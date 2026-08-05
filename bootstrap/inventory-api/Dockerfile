FROM node:22-slim

# safeCompare is bundled under ./lib (not ../lib) for isolated Docker context.

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV HOST=0.0.0.0
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]
