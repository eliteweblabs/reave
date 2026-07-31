FROM node:22-slim

WORKDIR /app

# System dependencies required by Playwright's Chromium browser
RUN apt-get update && apt-get install -y \
  git \
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

# Build the app
RUN npm run build

# Expose port
EXPOSE 4321

# Set environment variables at runtime (Railway will inject these)
ENV HOST=0.0.0.0
ENV PORT=4321

# Start the server
CMD ["node", "./dist/server/entry.mjs"]
