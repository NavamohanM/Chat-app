-- ============================================================
-- Chat App - Supabase Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- USERS TABLE
-- ============================================================
create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  username varchar(50) unique not null,
  email varchar(255) unique not null,
  password_hash text not null,
  avatar_color varchar(7) default '#6366f1',
  created_at timestamp with time zone default now(),
  last_seen timestamp with time zone default now()
);

-- ============================================================
-- MESSAGES TABLE
-- ============================================================
create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  username varchar(50) not null,
  message text not null,
  created_at timestamp with time zone default now()
);

-- ============================================================
-- INDEXES for performance
-- ============================================================
create index if not exists idx_messages_created_at on messages(created_at asc);
create index if not exists idx_messages_user_id on messages(user_id);

-- ============================================================
-- Enable Row Level Security (RLS)
-- ============================================================
alter table users enable row level security;
alter table messages enable row level security;

-- Allow reading users (for display)
create policy "Users are viewable by everyone"
  on users for select using (true);

-- Allow inserting own user record
create policy "Users can insert their own record"
  on users for insert with check (true);

-- Allow updating own user record
create policy "Users can update own record"
  on users for update using (true);

-- Allow reading all messages
create policy "Messages are viewable by everyone"
  on messages for select using (true);

-- Allow inserting messages
create policy "Anyone can insert messages"
  on messages for insert with check (true);

-- ============================================================
-- Enable Realtime on messages table
-- ============================================================
-- Go to Supabase Dashboard > Database > Replication
-- Enable replication for the 'messages' table
-- OR run:
-- alter publication supabase_realtime add table messages;
