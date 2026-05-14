CREATE TABLE "music_tracks" (
  "id" TEXT NOT NULL,
  "key" VARCHAR(240) NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "artist" VARCHAR(240) NOT NULL,
  "album" VARCHAR(240),
  "image_url" VARCHAR(1000),
  "audio_url" VARCHAR(1000),
  "provider" VARCHAR(80),
  "provider_label" VARCHAR(120),
  "duration" VARCHAR(20),
  "duration_seconds" INTEGER,
  "likes_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "music_tracks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "music_track_likes" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "track_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "music_track_likes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "music_tracks_key_key" ON "music_tracks"("key");
CREATE INDEX "music_tracks_likes_count_updated_at_idx" ON "music_tracks"("likes_count", "updated_at");
CREATE INDEX "music_tracks_artist_title_idx" ON "music_tracks"("artist", "title");
CREATE UNIQUE INDEX "music_track_likes_user_id_track_id_key" ON "music_track_likes"("user_id", "track_id");
CREATE INDEX "music_track_likes_user_id_created_at_idx" ON "music_track_likes"("user_id", "created_at");
CREATE INDEX "music_track_likes_track_id_idx" ON "music_track_likes"("track_id");

ALTER TABLE "music_track_likes" ADD CONSTRAINT "music_track_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "music_track_likes" ADD CONSTRAINT "music_track_likes_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "music_tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
