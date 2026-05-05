FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate

RUN mkdir -p logs uploads

EXPOSE 5000

CMD ["npm", "run", "start"]
