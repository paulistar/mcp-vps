FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache docker-cli docker-cli-compose

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

RUN npm run build

EXPOSE 80

ENV PORT=80

CMD ["node", "dist/index.js"]
