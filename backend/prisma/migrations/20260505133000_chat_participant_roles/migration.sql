ALTER TABLE "chat_participants"
ADD COLUMN "role" VARCHAR(20) NOT NULL DEFAULT 'member';

UPDATE "chat_participants" cp
SET "role" = 'owner'
FROM "chats" c
WHERE cp."chat_id" = c."id"
  AND c."owner_id" IS NOT NULL
  AND cp."user_id" = c."owner_id";
