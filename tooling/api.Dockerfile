FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --dir apps/api db:generate && pnpm --dir apps/api build
FROM build AS runtime
ENV NODE_ENV=production
WORKDIR /app/apps/api
USER node
EXPOSE 5000
CMD ["node", "dist/src/server.js"]
