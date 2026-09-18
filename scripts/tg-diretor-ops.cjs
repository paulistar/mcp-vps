#!/usr/bin/env node
/**
 * tg-diretor-ops — send/read/smoke Telegram Diretor via OpenClaw.
 * Secrets: token via docker exec into OpenClaw. Never print token.
 * Usage: node tg-diretor-ops.cjs <status|send|history|smoke|inbound> [...]
 */
const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const https = require("https");

const CHAT_ID = process.env.TG_DIRETOR_CHAT_ID || "137339320";
const OC =
  process.env.OPENCLAW_CONTAINER ||
  (() => {
    try {
      const out = execFileSync(
        "docker",
        ["ps", "--filter", "name=openclaw-vibestack", "--format", "{{.Names}}"],
        { encoding: "utf8" }
      )
        .trim()
        .split("\n")
        .filter(Boolean)[0];
      return out || "openclaw-vibestack-wa";
    } catch {
      return "openclaw-vibestack-wa";
    }
  })();

function oc(args, opts = {}) {
  const timeoutMs = opts.timeoutMs || 120000;
  const env = {
    ...process.env,
    OPENCLAW_GATEWAY_TIMEOUT_MS: String(opts.gatewayTimeout || 180000),
  };
  const r = spawnSync(
    "docker",
    ["exec", "-e", `OPENCLAW_GATEWAY_TIMEOUT_MS=${env.OPENCLAW_GATEWAY_TIMEOUT_MS}`, OC, "openclaw", ...args],
    { encoding: "utf8", timeout: timeoutMs, env, maxBuffer: 8 * 1024 * 1024 }
  );
  return {
    code: r.status ?? 1,
    stdout: (r.stdout || "").trim(),
    stderr: (r.stderr || "").trim(),
  };
}

function dockerLogs(since = "30m") {
  const r = spawnSync(
    "docker",
    ["logs", OC, "--since", since],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
  return `${r.stdout || ""}${r.stderr || ""}`;
}

function readToken() {
  const viaDocker = spawnSync(
    "docker",
    ["exec", OC, "cat", "/root/.openclaw/credentials/telegram-diretor.token"],
    { encoding: "utf8" }
  );
  if (viaDocker.status === 0 && viaDocker.stdout.trim()) {
    return viaDocker.stdout.trim().replace(/\r/g, "");
  }
  const p = "/root/.openclaw/credentials/telegram-diretor.token";
  if (fs.existsSync(p)) return fs.readFileSync(p, "utf8").trim().replace(/\r/g, "");
  throw new Error("telegram-diretor.token missing");
}

function botApi(method, body) {
  const token = readToken();
  const payload = JSON.stringify(body || {});
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${token}/${method}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 30000,
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function extractJson(stdout) {
  const s = stdout || "";
  const i = s.indexOf("{");
  if (i < 0) return null;
  try {
    return JSON.parse(s.slice(i));
  } catch {
    return null;
  }
}

async function cmdStatus() {
  const me = await botApi("getMe", {});
  const ch = oc(["channels", "status", "--channel", "telegram"], { timeoutMs: 90000 });
  const sess = oc(["sessions", "list", "--agent", "diretor", "--json"], { timeoutMs: 60000 });
  let session = null;
  try {
    session = JSON.parse(sess.stdout).sessions?.[0] || null;
  } catch {}
  return {
    bot: me.ok
      ? { id: me.result.id, username: me.result.username, name: me.result.first_name }
      : { error: me.description },
    chatId: CHAT_ID,
    container: OC,
    channelsStatusTail: (ch.stdout || ch.stderr).slice(-800),
    session: session
      ? {
          key: session.key,
          status: session.status,
          model: session.model,
          provider: session.modelProvider,
          tokens: session.totalTokens,
        }
      : null,
  };
}

async function cmdSend(text) {
  if (!text) throw new Error("send requires message text");
  const r = oc(
    ["message", "send", "--channel", "telegram", "-t", CHAT_ID, "-m", text, "--json"],
    { timeoutMs: 90000 }
  );
  if (r.code === 0 && r.stdout) {
    const parsed = extractJson(r.stdout);
    if (parsed) return { via: "openclaw", result: parsed };
    return { via: "openclaw", raw: r.stdout.slice(0, 1000) };
  }
  const api = await botApi("sendMessage", { chat_id: CHAT_ID, text });
  return {
    via: "botapi",
    ok: api.ok,
    messageId: api.result?.message_id,
    description: api.description,
  };
}

function cmdHistory(limit = 25) {
  const logs = dockerLogs("2h");
  const events = [];
  for (const line of logs.split("\n")) {
    if (/Inbound message telegram:137339320/.test(line)) {
      const m = line.match(/\((direct, (\d+) chars)\)/);
      events.push({
        kind: "inbound",
        chars: m ? Number(m[2]) : null,
        raw: line.replace(/\x1b\[[0-9;]*m/g, "").slice(-180),
      });
    } else if (/outbound send ok.*chatId=137339320/.test(line)) {
      const m = line.match(/messageId=(\d+)/);
      events.push({
        kind: "outbound",
        messageId: m ? Number(m[1]) : null,
        raw: line.replace(/\x1b\[[0-9;]*m/g, "").slice(-180),
      });
    } else if (/GatewayDrainingError|isError=true.*telegram|chave de API ausente/.test(line)) {
      events.push({
        kind: "error",
        raw: line.replace(/\x1b\[[0-9;]*m/g, "").slice(-220),
      });
    }
  }
  const tail = oc(
    [
      "sessions",
      "tail",
      "--agent",
      "diretor",
      "--session-key",
      "agent:diretor:main",
      "--tail",
      String(Math.min(limit, 40)),
    ],
    { timeoutMs: 60000 }
  );
  return {
    chatId: CHAT_ID,
    events: events.slice(-limit),
    sessionTail: (tail.stdout || tail.stderr || "").slice(-2500),
  };
}

function cmdInbound(minutes = 15) {
  const logs = dockerLogs(`${minutes}m`);
  const out = [];
  for (const line of logs.split("\n")) {
    if (/Inbound message telegram:137339320|outbound send ok.*137339320|embedded run agent end/.test(line)) {
      out.push(line.replace(/\x1b\[[0-9;]*m/g, "").slice(-220));
    }
  }
  return { lines: out.slice(-40) };
}

function cmdSmoke(message) {
  const msg =
    message ||
    `SMOKE-TG-${new Date().toISOString().slice(11, 19)}Z: responda exatamente PONG-OK e nada mais.`;
  const r = oc(
    [
      "agent",
      "--agent",
      "diretor",
      "--channel",
      "telegram",
      "--reply-to",
      CHAT_ID,
      "--deliver",
      "-m",
      msg,
      "--timeout",
      "120",
      "--json",
    ],
    { timeoutMs: 200000, gatewayTimeout: 180000 }
  );
  const parsed = extractJson(r.stdout);
  const text =
    parsed?.result?.finalAssistantVisibleText ||
    parsed?.finalAssistantVisibleText ||
    null;
  const delivery =
    parsed?.result?.deliverySucceeded ??
    parsed?.deliverySucceeded ??
    parsed?.deliveryStatus?.succeeded;
  const provider =
    parsed?.result?.executionTrace?.winnerProvider ||
    parsed?.executionTrace?.winnerProvider;
  const model =
    parsed?.result?.executionTrace?.winnerModel ||
    parsed?.executionTrace?.winnerModel;
  return {
    ok: r.code === 0 && delivery === true,
    prompt: msg,
    reply: text,
    deliverySucceeded: delivery,
    provider,
    model,
    stderrTail: (r.stderr || "").slice(-400),
  };
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  let out;
  switch (cmd) {
    case "status":
      out = await cmdStatus();
      break;
    case "send":
      out = await cmdSend(rest.join(" ").trim());
      break;
    case "history":
      out = cmdHistory(Number(rest[0]) || 25);
      break;
    case "inbound":
      out = cmdInbound(Number(rest[0]) || 15);
      break;
    case "smoke":
      out = cmdSmoke(rest.join(" ").trim() || undefined);
      break;
    default:
      out = {
        error:
          "usage: tg-diretor-ops.cjs status|send <text>|history [n]|inbound [min]|smoke [text]",
      };
      process.exitCode = 2;
  }
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e.message || String(e) }));
  process.exit(1);
});
