# syntax=docker/dockerfile:1
# Multi-stage Dockerfile for the Next.js web app.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# better-sqlite3 needs build toolchain
RUN apk add --no-cache python3 make g++ \
 && npm install --legacy-peer-deps --no-audit --no-fund

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build needs an AUTH_SECRET so lib/env.ts doesn't blow up at module-eval time.
ENV AUTH_SECRET=build-time-placeholder-replace-at-runtime
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tini
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/next.config.mjs ./
COPY --from=build /app/server ./server
COPY --from=build /app/lib ./lib
COPY --from=build /app/auth.ts ./
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/workers ./workers
COPY --from=build /app/drizzle.config.ts ./
COPY --from=build /app/tsconfig.json ./
RUN mkdir -p /app/data
VOLUME ["/app/data"]
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npm", "start"]
