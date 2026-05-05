-- AlterTable
ALTER TABLE "communities" ADD COLUMN     "members_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tweets_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "tweets" ADD COLUMN     "bookmarks_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "likes_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "replies_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "retweets_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "followers_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "following_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tweets_count" INTEGER NOT NULL DEFAULT 0;

-- Backfill denormalized counters from existing data.
UPDATE "tweets" t
SET
  "likes_count" = COALESCE(l.count, 0),
  "retweets_count" = COALESCE(r.count, 0),
  "replies_count" = COALESCE(re.count, 0),
  "bookmarks_count" = COALESCE(b.count, 0)
FROM (
  SELECT "id" FROM "tweets"
) base
LEFT JOIN (
  SELECT "tweet_id", COUNT(*)::int AS count FROM "likes" GROUP BY "tweet_id"
) l ON l."tweet_id" = base."id"
LEFT JOIN (
  SELECT "tweet_id", COUNT(*)::int AS count FROM "retweets" GROUP BY "tweet_id"
) r ON r."tweet_id" = base."id"
LEFT JOIN (
  SELECT "parent_id", COUNT(*)::int AS count FROM "tweets" WHERE "parent_id" IS NOT NULL GROUP BY "parent_id"
) re ON re."parent_id" = base."id"
LEFT JOIN (
  SELECT "tweet_id", COUNT(*)::int AS count FROM "bookmarks" GROUP BY "tweet_id"
) b ON b."tweet_id" = base."id"
WHERE t."id" = base."id";

UPDATE "users" u
SET
  "followers_count" = COALESCE(followers.count, 0),
  "following_count" = COALESCE(following.count, 0),
  "tweets_count" = COALESCE(tweets.count, 0)
FROM (
  SELECT "id" FROM "users"
) base
LEFT JOIN (
  SELECT "following_id", COUNT(*)::int AS count FROM "follows" GROUP BY "following_id"
) followers ON followers."following_id" = base."id"
LEFT JOIN (
  SELECT "follower_id", COUNT(*)::int AS count FROM "follows" GROUP BY "follower_id"
) following ON following."follower_id" = base."id"
LEFT JOIN (
  SELECT "author_id", COUNT(*)::int AS count FROM "tweets" WHERE "parent_id" IS NULL GROUP BY "author_id"
) tweets ON tweets."author_id" = base."id"
WHERE u."id" = base."id";

UPDATE "communities" c
SET
  "members_count" = COALESCE(members.count, 0),
  "tweets_count" = COALESCE(tweets.count, 0)
FROM (
  SELECT "id" FROM "communities"
) base
LEFT JOIN (
  SELECT "community_id", COUNT(*)::int AS count FROM "community_members" GROUP BY "community_id"
) members ON members."community_id" = base."id"
LEFT JOIN (
  SELECT "community_id", COUNT(*)::int AS count FROM "tweets" WHERE "parent_id" IS NULL GROUP BY "community_id"
) tweets ON tweets."community_id" = base."id"
WHERE c."id" = base."id";

-- CreateIndex
CREATE INDEX "communities_members_count_created_at_idx" ON "communities"("members_count", "created_at");

-- CreateIndex
CREATE INDEX "tweets_views_count_created_at_id_idx" ON "tweets"("views_count", "created_at", "id");

-- CreateIndex
CREATE INDEX "users_is_community_followers_count_created_at_idx" ON "users"("is_community", "followers_count", "created_at");

