# ChatApp — WhatsApp Clone

A full-featured real-time chat application built with PHP and Supabase, inspired by WhatsApp.

![PHP](https://img.shields.io/badge/PHP-8.3-777BB4?style=flat&logo=php)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat&logo=supabase)
![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?style=flat&logo=javascript)
![License](https://img.shields.io/badge/License-MIT-blue.svg)

---

## Features

- **Real-time Messaging** — Instant delivery via Supabase WebSocket + broadcast channels
- **Voice & Video Calls** — WebRTC peer-to-peer calls with STUN servers
- **Voice Messages** — Record and send audio messages
- **File Sharing** — Upload and share images, videos, PDFs, documents (up to 25MB)
- **Message Reactions** — Emoji reactions persisted to database
- **Reply & Forward** — Reply to specific messages, forward to any user
- **Edit & Delete** — Edit sent messages, delete for everyone
- **Read Receipts** — Single tick (sent), double grey tick (delivered), blue tick (read)
- **Typing Indicators** — Live typing status
- **Online / Last Seen** — Real-time presence detection
- **Message Search** — Search messages within any conversation
- **Link Previews** — Auto-fetch Open Graph previews for URLs
- **Browser Notifications** — Native OS notifications when tab is in background
- **Emoji Picker** — Built-in emoji bar
- **Drag & Drop / Paste** — Drag files or paste images directly into chat
- **Infinite Scroll** — Load older messages on scroll
- **Offline Queue** — Messages queued and sent when connection restores
- **Block / Unblock** — Block users from messaging you
- **Clear Chat** — Clear entire conversation history
- **Dark Theme UI** — Discord/Telegram-style dark interface
- **Settings** — Change username, avatar color, password, sound & notification preferences
- **Call History** — View past voice and video calls
- **Mobile Responsive** — Works on all screen sizes

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | PHP 8.3 (no framework) |
| Database | Supabase (PostgreSQL) |
| Real-time | Supabase WebSocket (`postgres_changes` + Broadcast) |
| File Storage | Supabase Storage |
| Frontend | Vanilla JavaScript, HTML5, CSS3 |
| Calls | WebRTC (STUN servers) |
| Fonts | Inter (Google Fonts) |
| Icons | Font Awesome 6.4 |

---

## Project Structure

```
Chat-app/
├── api/
│   ├── send_message.php      # Send a message
│   ├── fetch_messages.php    # Load messages
│   ├── upload.php            # File upload to Supabase Storage
│   ├── call.php              # WebRTC call signaling
│   ├── call_history.php      # Call log
│   ├── reactions.php         # Emoji reactions (toggle)
│   ├── mark_read.php         # Mark messages as read
│   ├── edit_message.php      # Edit a message
│   ├── delete_message.php    # Soft delete a message
│   ├── clear_chat.php        # Clear conversation
│   ├── block_user.php        # Block / unblock user
│   ├── reply_data.php        # Fetch reply quote data
│   ├── search_messages.php   # Search messages
│   ├── link_preview.php      # Fetch URL Open Graph data
│   ├── typing.php            # Typing indicator + last seen
│   ├── users.php             # User list
│   ├── me.php                # Current user info
│   └── update_profile.php    # Update username / password / avatar
├── assets/
│   ├── css/
│   │   ├── chat.css          # Main chat UI styles
│   │   ├── auth.css          # Login / register styles
│   │   └── settings.css      # Settings page styles
│   └── js/
│       ├── chat.js           # Main chat logic + real-time
│       └── call.js           # WebRTC voice & video calls
├── auth/
│   ├── login.php             # Login page
│   ├── register.php          # Register page
│   └── logout.php            # Logout
├── index.php                 # Main chat UI
├── settings.php              # Settings page
├── config.php                # Supabase config + helpers
├── schema.sql                # Database schema (run once in Supabase)
└── migration.sql             # Additional migrations
```

---

## Setup & Run Locally

### 1. Prerequisites
- PHP 8.0+ with `curl` extension
- A free [Supabase](https://supabase.com) account

### 2. Clone the repository
```bash
git clone https://github.com/NavamohanM/Chat-app.git
cd Chat-app
```

### 3. Set up Supabase
1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run `schema.sql`
3. Then run these critical commands:
```sql
alter table messages replica identity full;
alter table calls    replica identity full;
```
4. Go to **Storage** → create a bucket named `chat-media` → set it to **Public**

### 4. Configure the app
Edit `config.php` and fill in your Supabase credentials:
```php
define('SUPABASE_URL',         'https://your-project.supabase.co');
define('SUPABASE_ANON_KEY',    'your-anon-key');
define('SUPABASE_SERVICE_KEY', 'your-service-role-key');
```

### 5. Run locally
```bash
php -S localhost:8000
```
Open [http://localhost:8000](http://localhost:8000) in your browser.

---

## Screenshots

> Register → Login → Chat in real-time with voice/video calls, file sharing, reactions and more.

---

## Author

**Navamohan M**
- GitHub: [@NavamohanM](https://github.com/NavamohanM)
- Email: navamohan5219@gmail.com

---

## License

This project is licensed under the MIT License.
