FROM node:22-slim

WORKDIR /app

# System dependencies required by Playwright's Chromium browser
RUN apt-get update && apt-get install -y \
  chromium \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libxkbcommon0 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libasound2 \
  libdbus-1-3 \
  libdrm2 \
  libxshmfence1 \
  ca-certificates \
  fonts-liberation \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

# Tell Playwright to use the system Chromium instead of downloading its own
ENV PLAYWRIGHT_BROWSERS_PATH=0
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# Astro/Vite build can OOM on small Railway builder instances (~512MB heap).
ENV NODE_OPTIONS=--max-old-space-size=768

# Copy package files
COPY package*.json ./

# Install all dependencies (devDependencies required for astro build)
RUN npm ci

# Install Playwright browser binaries (Chromium only — smallest footprint)
RUN npx playwright install chromium --with-deps || true

# Copy source
COPY . .

# Railway injects git metadata as build args for Dockerfiles — declare them so
# `scripts/asset-version.mjs` can stamp public/* script URLs with the commit SHA
# (otherwise they fall back to `?v=dev` and Cloudflare's 4h TTL never busts).
ARG RAILWAY_GIT_COMMIT_SHA
ARG RAILWAY_DEPLOYMENT_ID
ENV RAILWAY_GIT_COMMIT_SHA=$RAILWAY_GIT_COMMIT_SHA
ENV RAILWAY_DEPLOYMENT_ID=$RAILWAY_DEPLOYMENT_ID

# @clerk/astro inlines PUBLIC_CLERK_PUBLISHABLE_KEY at `astro build`. Dockerfile
# builds do not receive Railway service variables unless they are declared ARG.
# Runtime still injects both keys; these ARGs keep the client bundle in sync
# when the keys are already on the service.
ARG PUBLIC_CLERK_PUBLISHABLE_KEY
ARG CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG CLERK_SECRET_KEY
ARG CLERK_BACKEND_API_KEY
ARG CLERK_SECRET
ENV PUBLIC_CLERK_PUBLISHABLE_KEY=$PUBLIC_CLERK_PUBLISHABLE_KEY
ENV CLERK_PUBLISHABLE_KEY=$CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV CLERK_SECRET_KEY=$CLERK_SECRET_KEY
ENV CLERK_BACKEND_API_KEY=$CLERK_BACKEND_API_KEY
ENV CLERK_SECRET=$CLERK_SECRET

# Prefer canonical names so @clerk/astro inlines the same key the runtime reads.
RUN if [ -z "$PUBLIC_CLERK_PUBLISHABLE_KEY" ]; then \
      export PUBLIC_CLERK_PUBLISHABLE_KEY="${CLERK_PUBLISHABLE_KEY:-$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}"; \
    fi && \
    if [ -z "$CLERK_SECRET_KEY" ]; then \
      export CLERK_SECRET_KEY="${CLERK_BACKEND_API_KEY:-$CLERK_SECRET}"; \
    fi && \
    npm run build

# Expose port
EXPOSE 4321

# Set environment variables at runtime (Railway will inject these)
ENV HOST=0.0.0.0
ENV PORT=4321

# Start the server
CMD ["node", "./dist/server/entry.mjs"]
