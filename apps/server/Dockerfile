FROM oven/bun:1
WORKDIR /app/apps/server

COPY apps/server/package.json ./
RUN bun install --production

WORKDIR /app
COPY apps/server apps/server
COPY packages/core packages/core

ENV PORT=8080
EXPOSE 8080

CMD ["bun", "run", "--cwd", "apps/server", "start"]
