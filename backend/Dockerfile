FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

FROM base AS builder
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate

FROM base AS runner
COPY --from=builder /app/node_modules ./node_modules
COPY . .

RUN mkdir -p logs

EXPOSE 5000

CMD ["sh", "-c", "npx prisma db push && node src/server.js"]
