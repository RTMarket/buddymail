FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
COPY deploy ./deploy
EXPOSE 8787
# DB schema is ensured at startup by the app (migrate.ts); run seed manually once.
CMD ["npx", "tsx", "src/server.ts"]
