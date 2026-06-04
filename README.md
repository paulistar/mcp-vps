# VPS MCP Server

Servidor MCP remoto que roda **na VPS** e expõe ferramentas de sistema, arquivos, Docker e systemd via HTTP — para usar no Cursor, Claude ou qualquer cliente MCP.

## Tools disponíveis

| Tool | Descrição |
|------|-----------|
| `vps_exec` | Executa comando shell |
| `vps_system_info` | Hostname, uptime, memória, disco, SO |
| `vps_read_file` | Lê arquivo |
| `vps_write_file` | Escreve arquivo |
| `vps_list_dir` | Lista diretório |
| `vps_docker` | ps, logs, restart, compose-up/down, etc. |
| `vps_systemctl` | status, start, stop, restart de serviços |

## Deploy no Easypanel (produção)

- **Projeto:** `martstudios`
- **Serviço:** `mcp-vps`
- **Repositório:** [github.com/paulistar/mcp-vps](https://github.com/paulistar/mcp-vps)
- **Domínio:** `https://vps.martstudiosbr.com.br` (porta 80)
- **Painel:** [painel.martstudiosbr.com.br](https://painel.martstudiosbr.com.br)

Teste:

```bash
curl https://vps.martstudiosbr.com.br/health
```

Resposta esperada:

```json
{"status":"ok","tools":["vps_exec","vps_system_info",...],"version":"1.0.0","auth":"enabled"}
```

## Conectar no Cursor

Em `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "vps": {
      "url": "https://mcp.seudominio.com/mcp",
      "headers": {
        "Authorization": "Bearer seu-token-seguro-aqui"
      }
    }
  }
}
```

Reinicie o Cursor após salvar.

## Desenvolvimento local

```bash
cp .env.example .env
npm install
npm run dev
```

Teste local:

```bash
curl http://localhost:3000/health
```

## Docker

```bash
docker compose up --build
```

## Segurança

- Sempre defina `MCP_AUTH_TOKEN` em produção
- O servidor executa comandos com as permissões do processo (idealmente usuário dedicado, não root)
- Saídas são truncadas em `MAX_OUTPUT_BYTES` para evitar respostas enormes
- Comandos têm timeout configurável via `EXEC_TIMEOUT_MS`

## Complemento ao Easypanel MCP

Use o **Easypanel MCP** para criar/deploy de apps e o **VPS MCP** para operações de sistema: logs em `/var/log`, nginx, cron, `docker exec`, diagnóstico de disco/RAM, etc.
