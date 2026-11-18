# syntax=docker/dockerfile:1
# The image tag MUST match the `playwright` version pinned in apps/api/package.json:
# each Playwright release only works with the browser build it was published with.
ARG PLAYWRIGHT_VERSION=1.63.0

# --- Build stage -------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @linkforge/api --include-workspace-root
COPY apps/api apps/api
RUN npm run build --workspace @linkforge/api

# --- Runtime stage -------------------------------------------------------------
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
# Browsers are already in the base image.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace @linkforge/api --include-workspace-root \
 && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
# Chromium's sandbox requires an unprivileged user; the image ships `pwuser`.
USER pwuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "apps/api/dist/server.js"]
