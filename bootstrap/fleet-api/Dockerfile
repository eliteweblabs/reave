FROM node:22-slim

# /api/health/live alias is required — Railway inherits root railway.json healthcheck.

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV HOST=0.0.0.0
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]
