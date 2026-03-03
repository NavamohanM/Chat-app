-- ============================================================
-- Chat App — Migration v2
-- Run this in your Supabase SQL Editor AFTER schema.sql
-- ============================================================

-- Add status column to messages (sent → delivered → read)
alter table messages add column if not exists status varchar(10) default 'sent';
alter table messages add column if not exists read_at timestamp with time zone;

-- Make sure receiver_id exists (from earlier migration)
alter table messages add column if not exists receiver_id uuid references users(id) on delete cascade;
alter table messages add column if not exists reply_to uuid references messages(id) on delete set null;
alter table messages add column if not exists file_url text;
alter table messages add column if not exists file_name text;
alter table messages add column if not exists file_type text;
alter table messages add column if not exists deleted_at timestamp with time zone;

-- Full replica identity so realtime payloads include all columns
alter table messages replica identity full;
alter table users replica identity full;

-- Enable realtime on messages table
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table users;

-- Index for unread count queries
create index if not exists idx_messages_status on messages(receiver_id, status) where deleted_at is null;
create index if not exists idx_messages_receiver on messages(receiver_id, created_at desc);

-- Allow updating messages (for read receipts)
create policy "Users can update messages sent to them" on messages
  for update using (receiver_id = auth.uid()::uuid or user_id = auth.uid()::uuid);

-- Note: auth.uid() won't work with custom PHP sessions.
-- Since we use service key for all writes, the above policy is just informational.
-- With service key the existing policies already allow updates.

-- ============================================================
-- CALLS TABLE (for WebRTC voice/video calls)
-- ============================================================
create table if not exists calls (
  id          uuid primary key default uuid_generate_v4(),
  caller_id   uuid references users(id) on delete cascade not null,
  receiver_id uuid references users(id) on delete cascade not null,
  type        varchar(5) default 'voice',   -- 'voice' | 'video'
  status      varchar(10) default 'ringing', -- ringing | active | ended | declined
  offer       text,
  answer      text,
  created_at  timestamp with time zone default now(),
  ended_at    timestamp with time zone
);

create index if not exists idx_calls_receiver on calls(receiver_id, status);
create index if not exists idx_calls_caller   on calls(caller_id, created_at desc);

alter table calls enable row level security;
alter table calls replica identity full;

create policy "Calls viewable by participants" on calls
  for select using (true);

create policy "Anyone can insert calls" on calls
  for insert with check (true);

create policy "Anyone can update calls" on calls
  for update using (true);

-- Enable realtime on calls table
alter publication supabase_realtime add table calls;
