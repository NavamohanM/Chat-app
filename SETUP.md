# Chat App — Setup Guide

## Step 1: Create Supabase Project

1. Go to https://supabase.com and sign up (free)
2. Click **New Project**, fill in name and password
3. Wait for it to provision (~1 min)

## Step 2: Run the Database Schema

1. In your Supabase dashboard, go to **SQL Editor**
2. Copy the contents of `schema.sql`
3. Paste and click **Run**
4. This creates the `users` and `messages` tables

## Step 3: Enable Realtime on Messages Table

1. Go to **Database → Replication** in Supabase dashboard
2. Toggle **ON** the `messages` table
3. This enables WebSocket push for new messages

## Step 4: Get Your API Keys

1. Go to **Settings → API** in Supabase dashboard
2. Copy:
   - **Project URL** (looks like `https://abcxyz.supabase.co`)
   - **anon / public key** (safe to use in frontend)
   - **service_role key** (keep secret, used only in PHP backend)

## Step 5: Update config.php

Open `config.php` and replace the placeholder values:

```php
define('SUPABASE_URL',         'https://YOUR_PROJECT_ID.supabase.co');
define('SUPABASE_ANON_KEY',    'your-anon-key-here');
define('SUPABASE_SERVICE_KEY', 'your-service-role-key-here');
```

## Step 6: Run with PHP

```bash
# Make sure PHP is installed (PHP 7.4+ with cURL extension)
php -S localhost:8000
```

Then open: http://localhost:8000

## Step 7: Register and Chat

1. Go to http://localhost:8000/auth/register.php
2. Create an account
3. Open in another browser/tab, register a second user
4. Watch messages appear in real-time!

---

## File Structure

```
Chat-app/
├── config.php              ← Supabase config + helpers (EDIT THIS)
├── schema.sql              ← Run in Supabase SQL Editor
├── index.php               ← Main chat page
├── auth/
│   ├── login.php           ← Login page
│   ├── register.php        ← Registration page
│   └── logout.php          ← Logout handler
├── api/
│   ├── send_message.php    ← POST: send a message
│   ├── fetch_messages.php  ← GET: load messages
│   └── me.php              ← GET: current user info
└── assets/
    ├── css/
    │   ├── auth.css        ← Login/Register styles
    │   └── chat.css        ← Main chat UI styles
    └── js/
        └── chat.js         ← Real-time WebSocket + UI logic
```

## Requirements

- PHP 7.4+ with `curl` extension enabled
- A free Supabase account
- No MySQL/XAMPP needed!
