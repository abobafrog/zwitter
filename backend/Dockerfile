FROM ruby:4.0.2-alpine

WORKDIR /app

RUN apk add --no-cache \
    bash \
    build-base \
    curl \
    git \
    imagemagick \
    libxml2-dev \
    libxslt-dev \
    nodejs \
    npm \
    openssl \
    postgresql-client \
    postgresql-dev \
    redis \
    sqlite-dev \
    tzdata \
    yaml-dev \
    zlib-dev

COPY package*.json ./
RUN npm ci

COPY muffon-api/Gemfile muffon-api/Gemfile.lock muffon-api/.ruby-version ./muffon-api/
RUN gem install bundler:2.7.1 && cd muffon-api && bundle _2.7.1_ install

COPY . .
RUN npx prisma generate

RUN mkdir -p logs uploads
RUN chmod +x docker-entrypoint.sh

EXPOSE 5000

CMD ["./docker-entrypoint.sh"]
