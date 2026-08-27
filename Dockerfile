# ---------- build ----------
FROM node:22-alpine AS build

WORKDIR /app

# Dependencies first so this layer stays cached while only source changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---------- runtime ----------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Never run the API as root.
RUN addgroup -S totli && adduser -S totli -G totli

COPY --from=build --chown=totli:totli /app/node_modules ./node_modules
COPY --from=build --chown=totli:totli /app/package.json ./package.json
COPY --from=build --chown=totli:totli /app/dist ./dist

USER totli
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
