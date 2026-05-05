CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "tweets_content_trgm_idx"
ON "tweets"
USING gin ("content" gin_trgm_ops);
