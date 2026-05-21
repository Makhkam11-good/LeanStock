FROM node:20-alpine AS base

WORKDIR /app

RUN apk add --no-cache openssl

# Install dependencies only when needed
# Build stage
FROM base AS builder
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate

# Production image
FROM base AS runner
ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/docs ./docs
COPY --from=builder /app/openapi.yaml ./openapi.yaml
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server.js ./

RUN mkdir -p /app/logs && chown appuser:nodejs /app/logs

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "const http=require('http');const port=process.env.PORT||process.env.APP_PORT||3000;const req=http.get({host:'127.0.0.1',port,path:'/health',timeout:3000},res=>process.exit(res.statusCode<500?0:1));req.on('error',()=>process.exit(1));req.on('timeout',()=>process.exit(1));"

CMD ["node", "src/startService.js"]
