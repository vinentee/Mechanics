FROM node:24-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build \
  && ./node_modules/.bin/tsc -p tsconfig.server.json \
  && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --chown=node:node --from=build /app/package.json ./package.json
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/dist-server ./dist-server

USER node
EXPOSE 3000
CMD ["node", "dist-server/server/index.js"]
