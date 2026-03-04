-- ============================================================
-- Chat App — Full Schema
-- Run this in your Supabase SQL Editor (safe to re-run)
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- USERS
-- ============================================================
create table if not exists users (
  id           uuid primary key default uuid_generate_v4(),
  username     varchar(50)  unique not null,
  email        varchar(255) unique not null,
  password_hash text not null,
  avatar_color varchar(7) default '#6366f1',
  created_at   timestamptz default now(),
  last_seen    timestamptz default now()
);

-- ============================================================
-- MESSAGES
-- ============================================================
create table if not exists messages (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references users(id) on delete cascade,
  username    varchar(50) not null,
  message     text not null default '',
  receiver_id uuid references users(id) on delete cascade,
  file_url    text,
  file_name   text,
  file_type   text,
  reply_to    uuid references messages(id) on delete set null,
  status      varchar(20) default 'sent',
  edited_at   timestamptz,
  deleted_at  timestamptz,
  created_at  timestamptz default now()
);

-- ============================================================
-- BLOCKED USERS
-- ============================================================
create table if not exists blocked_users (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references users(id) on delete cascade,
  blocked_id uuid references users(id) on delete cascade,
  created_at timestamptz default now(),
  unique(user_id, blocked_id)
);

-- ============================================================
-- CALLS
-- ============================================================
create table if not exists calls (
  id          uuid primary key default uuid_generate_v4(),
  caller_id   uuid references users(id) on delete cascade,
  receiver_id uuid references users(id) on delete cascade,
  type        varchar(10) default 'voice',
  status      varchar(20) default 'ringing',
  offer       text,
  answer      text,
  created_at  timestamptz default now(),
  ended_at    timestamptz
);

-- ============================================================
-- REACTIONS
-- ============================================================
create table if not exists reactions (
  id         uuid primary key default uuid_generate_v4(),
  message_id uuid references messages(id) on delete cascade,
  user_id    uuid references users(id)    on delete cascade,
  username   varchar(50) not null,
  emoji      varchar(10) not null,
  created_at timestamptz default now(),
  unique(message_id, user_id, emoji)
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_messages_receiver_id  on messages(receiver_id);
create index if not exists idx_messages_user_id      on messages(user_id);
create index if not exists idx_messages_created_at   on messages(created_at asc);
create index if not exists idx_calls_receiver_id     on calls(receiver_id);
create index if not exists idx_reactions_message_id  on reactions(message_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table users         enable row level security;
alter table messages      enable row level security;
alter table blocked_users enable row level security;
alter table calls         enable row level security;
alter table reactions     enable row level security;

-- Drop existing policies before recreating (safe)
drop policy if exists "users_select"   on users;
drop policy if exists "users_insert"   on users;
drop policy if exists "users_update"   on users;
drop policy if exists "msg_select"     on messages;
drop policy if exists "msg_insert"     on messages;
drop policy if exists "msg_update"     on messages;
drop policy if exists "block_select"   on blocked_users;
drop policy if exists "block_all"      on blocked_users;
drop policy if exists "calls_select"   on calls;
drop policy if exists "calls_all"      on calls;
drop policy if exists "react_select"   on reactions;
drop policy if exists "react_all"      on reactions;

create policy "users_select"  on users         for select using (true);
create policy "users_insert"  on users         for insert with check (true);
create policy "users_update"  on users         for update using (true);
create policy "msg_select"    on messages      for select using (true);
create policy "msg_insert"    on messages      for insert with check (true);
create policy "msg_update"    on messages      for update using (true);
create policy "block_select"  on blocked_users for select using (true);
create policy "block_all"     on blocked_users for all    using (true);
create policy "calls_select"  on calls         for select using (true);
create policy "calls_all"     on calls         for all    using (true);
create policy "react_select"  on reactions     for select using (true);
create policy "react_all"     on reactions     for all    using (true);

-- ============================================================
-- REALTIME — CRITICAL: must enable for messages to appear live
-- ============================================================
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table calls;

-- ============================================================
-- REPLICA IDENTITY — makes full row available in realtime payloads
-- ============================================================
alter table messages replica identity full;
alter table calls    replica identity full;
