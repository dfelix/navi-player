# syntax=docker/dockerfile:1

# --- Stage 1: build the app and the server ---
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Optional: bake a Navidrome URL into the bundle for direct (static) use. The
# runtime server below proxies Navidrome on its own origin, so the image does
# not need it — the runtime VITE_NAVIDROME_URL is what counts there.
ARG VITE_NAVIDROME_URL=""
ENV VITE_NAVIDROME_URL=${VITE_NAVIDROME_URL}
# Type checking and tests belong in CI; the image only needs the artefacts.
RUN npx vite build && npm run build:server

# --- Stage 2: runtime (Node server) ---
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Production dependencies only (hono, @hono/node-server, fflate, music-metadata…).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server

# VITE_NAVIDROME_URL — your Navidrome server (e.g. http://navidrome:4533). The
#                      server proxies /rest/*, /auth/*, /api/* and /share/* to
#                      it, so the browser never needs CORS. Set it at runtime
#                      (docker run -e / compose `environment:`); restart to change.
# VITE_APP_NAME      — optional display name; renames the served page and web
#                      app manifest at startup. Unset = the built name (NaviPlayer).
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -q -O /dev/null http://localhost:8080/api/config || exit 1

# Never run as root inside the container (the image's built-in "node" user).
USER node

CMD ["node", "dist-server/index.js"]

LABEL org.opencontainers.image.title="NaviPlayer"
LABEL org.opencontainers.image.description="Dark, album-art-first web client for a Navidrome music library"
