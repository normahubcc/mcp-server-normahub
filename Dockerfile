# NormaHub MCP Server — HTTP transport in a container.
# Stdio is not useful in Docker: clients spawn the process themselves.

FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src/ ./src/
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0
COPY --chown=node:node --chmod=644 package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node --from=builder /app/dist ./dist

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/sse.js"]
