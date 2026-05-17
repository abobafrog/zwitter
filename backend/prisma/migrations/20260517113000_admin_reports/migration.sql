ALTER TABLE "users"
ADD COLUMN "role" VARCHAR(20) NOT NULL DEFAULT 'user',
ADD COLUMN "is_banned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "banned_at" TIMESTAMP(3),
ADD COLUMN "ban_reason" VARCHAR(500);

CREATE TABLE "post_reports" (
  "id" TEXT NOT NULL,
  "reporter_id" TEXT NOT NULL,
  "tweet_id" TEXT NOT NULL,
  "target_user_id" TEXT NOT NULL,
  "reason" VARCHAR(120) NOT NULL,
  "details" VARCHAR(500),
  "status" VARCHAR(20) NOT NULL DEFAULT 'open',
  "admin_note" VARCHAR(500),
  "reviewed_at" TIMESTAMP(3),
  "reviewed_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "post_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_reports" (
  "id" TEXT NOT NULL,
  "reporter_id" TEXT NOT NULL,
  "target_user_id" TEXT NOT NULL,
  "reason" VARCHAR(120) NOT NULL,
  "details" VARCHAR(500),
  "status" VARCHAR(20) NOT NULL DEFAULT 'open',
  "admin_note" VARCHAR(500),
  "reviewed_at" TIMESTAMP(3),
  "reviewed_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "user_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "post_reports_reporter_id_tweet_id_key" ON "post_reports"("reporter_id", "tweet_id");
CREATE INDEX "post_reports_status_created_at_idx" ON "post_reports"("status", "created_at");
CREATE INDEX "post_reports_tweet_id_idx" ON "post_reports"("tweet_id");
CREATE INDEX "post_reports_target_user_id_idx" ON "post_reports"("target_user_id");

CREATE UNIQUE INDEX "user_reports_reporter_id_target_user_id_key" ON "user_reports"("reporter_id", "target_user_id");
CREATE INDEX "user_reports_status_created_at_idx" ON "user_reports"("status", "created_at");
CREATE INDEX "user_reports_target_user_id_idx" ON "user_reports"("target_user_id");

ALTER TABLE "post_reports"
ADD CONSTRAINT "post_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "post_reports_tweet_id_fkey" FOREIGN KEY ("tweet_id") REFERENCES "tweets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "post_reports_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "post_reports_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_reports"
ADD CONSTRAINT "user_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "user_reports_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "user_reports_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
