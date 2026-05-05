-- CreateIndex
CREATE INDEX IF NOT EXISTS "tweets_parent_id_views_count_created_at_idx" ON "tweets"("parent_id", "views_count", "created_at");
