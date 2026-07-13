FROM node:22-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (devDependencies required for astro build)
RUN npm ci

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
