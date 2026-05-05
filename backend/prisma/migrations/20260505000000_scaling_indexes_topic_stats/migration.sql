-- AlterTable
ALTER TABLE "tweets" ALTER COLUMN "content" SET DATA TYPE VARCHAR(500);

-- CreateTable
CREATE TABLE "topic_stats" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "posts" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topic_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "topic_stats_name_key" ON "topic_stats"("name");

-- CreateIndex
CREATE UNIQUE INDEX "topic_stats_slug_key" ON "topic_stats"("slug");

-- CreateIndex
CREATE INDEX "topic_stats_posts_updated_at_idx" ON "topic_stats"("posts", "updated_at");

-- CreateIndex
CREATE INDEX "bookmarks_user_id_created_at_idx" ON "bookmarks"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "bookmarks_tweet_id_idx" ON "bookmarks"("tweet_id");

-- CreateIndex
CREATE INDEX "bookmarks_created_at_idx" ON "bookmarks"("created_at");

-- CreateIndex
CREATE INDEX "chat_participants_user_id_idx" ON "chat_participants"("user_id");

-- CreateIndex
CREATE INDEX "chat_participants_chat_id_idx" ON "chat_participants"("chat_id");

-- CreateIndex
CREATE INDEX "follows_follower_id_idx" ON "follows"("follower_id");

-- CreateIndex
CREATE INDEX "follows_following_id_idx" ON "follows"("following_id");

-- CreateIndex
CREATE INDEX "likes_tweet_id_idx" ON "likes"("tweet_id");

-- CreateIndex
CREATE INDEX "likes_user_id_idx" ON "likes"("user_id");

-- CreateIndex
CREATE INDEX "messages_chat_id_created_at_idx" ON "messages"("chat_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_sender_id_idx" ON "messages"("sender_id");

-- CreateIndex
CREATE INDEX "messages_is_read_idx" ON "messages"("is_read");

-- CreateIndex
CREATE INDEX "messages_chat_id_is_read_sender_id_idx" ON "messages"("chat_id", "is_read", "sender_id");

-- CreateIndex
CREATE INDEX "retweets_user_id_created_at_idx" ON "retweets"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "retweets_tweet_id_idx" ON "retweets"("tweet_id");

-- CreateIndex
CREATE INDEX "retweets_created_at_idx" ON "retweets"("created_at");

-- CreateIndex
CREATE INDEX "tweet_views_tweet_id_idx" ON "tweet_views"("tweet_id");

-- CreateIndex
CREATE INDEX "tweet_views_user_id_idx" ON "tweet_views"("user_id");

-- CreateIndex
CREATE INDEX "tweet_views_created_at_idx" ON "tweet_views"("created_at");

-- CreateIndex
CREATE INDEX "tweets_created_at_id_idx" ON "tweets"("created_at", "id");

-- CreateIndex
CREATE INDEX "tweets_author_id_created_at_idx" ON "tweets"("author_id", "created_at");

-- CreateIndex
CREATE INDEX "tweets_parent_id_created_at_idx" ON "tweets"("parent_id", "created_at");

-- CreateIndex
CREATE INDEX "tweets_community_id_created_at_idx" ON "tweets"("community_id", "created_at");

-- CreateIndex
CREATE INDEX "tweets_views_count_created_at_idx" ON "tweets"("views_count", "created_at");

