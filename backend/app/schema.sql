CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  username varchar(50) UNIQUE NOT NULL,
  email varchar(255) UNIQUE NOT NULL,
  email_verified boolean NOT NULL DEFAULT false,
  email_verified_at timestamp,
  password_hash text NOT NULL,
  display_name varchar(100) NOT NULL,
  bio varchar(160),
  avatar_url text,
  banner_url text,
  birth_date text,
  is_verified boolean NOT NULL DEFAULT false,
  is_community boolean NOT NULL DEFAULT false,
  block_group_invites boolean NOT NULL DEFAULT false,
  message_privacy varchar(20) NOT NULL DEFAULT 'everyone',
  notify_likes boolean NOT NULL DEFAULT true,
  notify_replies boolean NOT NULL DEFAULT true,
  notify_retweets boolean NOT NULL DEFAULT true,
  notify_follows boolean NOT NULL DEFAULT true,
  notify_messages boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS account_tokens (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  token_hash text UNIQUE NOT NULL,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type varchar(40) NOT NULL,
  payload text,
  expires_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_tokens_user_id_type_idx ON account_tokens(user_id, type);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  token text UNIQUE NOT NULL,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS communities (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  slug varchar(50) UNIQUE NOT NULL,
  name varchar(100) NOT NULL,
  bio varchar(180),
  avatar_url text,
  banner_url text,
  owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_members (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  community_id text NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);

CREATE TABLE IF NOT EXISTS tweets (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  content varchar(280) NOT NULL,
  image_url text,
  author_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id text REFERENCES communities(id) ON DELETE CASCADE,
  parent_id text REFERENCES tweets(id) ON DELETE CASCADE,
  views_count integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tweet_views (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tweet_id text NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
  user_id text REFERENCES users(id) ON DELETE CASCADE,
  ip_address text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tweet_views_tweet_user_unique ON tweet_views(tweet_id, user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS likes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tweet_id text NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (user_id, tweet_id)
);

CREATE TABLE IF NOT EXISTS retweets (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tweet_id text NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (user_id, tweet_id)
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tweet_id text NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (user_id, tweet_id)
);

CREATE TABLE IF NOT EXISTS follows (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  follower_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id)
);

CREATE TABLE IF NOT EXISTS chats (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name varchar(100),
  description varchar(180),
  avatar_url text,
  owner_id text,
  is_group boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_participants (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  chat_id text NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  chat_id text NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id text REFERENCES users(id),
  content varchar(1000) NOT NULL,
  image_url text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  edited_at timestamp
);

CREATE TABLE IF NOT EXISTS message_reactions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  message_id text NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji varchar(16) NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS message_reactions_message_id_idx ON message_reactions(message_id);

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  tweet_id text REFERENCES tweets(id) ON DELETE CASCADE,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_read_created_idx ON notifications(user_id, is_read, created_at);

CREATE TABLE IF NOT EXISTS quick_notes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content varchar(1000) NOT NULL,
  color varchar(20) NOT NULL DEFAULT 'cyan',
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quick_notes_user_pinned_updated_idx ON quick_notes(user_id, pinned, updated_at);

CREATE TABLE IF NOT EXISTS quick_note_history (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  note_id text NOT NULL REFERENCES quick_notes(id) ON DELETE CASCADE,
  summary varchar(180) NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quick_note_history_note_created_idx ON quick_note_history(note_id, created_at);

CREATE TABLE IF NOT EXISTS service_tasks (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title varchar(160) NOT NULL,
  details varchar(1000),
  status varchar(20) NOT NULL DEFAULT 'todo',
  priority varchar(20) NOT NULL DEFAULT 'normal',
  due_date timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_tasks_user_status_due_idx ON service_tasks(user_id, status, due_date);
