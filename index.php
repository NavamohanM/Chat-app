<?php
require_once 'config.php';
if (!is_logged_in()) redirect('auth/login.php');
$user = current_user();
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title><?= APP_NAME ?></title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<link rel="stylesheet" href="assets/css/chat.css">
</head>
<body>

<!-- ── Toast ─────────────────────────────────────────────── -->
<div id="toast-bar"><i class="fa-solid fa-circle" id="toast-icon"></i><span id="toast-msg"></span></div>

<!-- ── Image Lightbox ────────────────────────────────────── -->
<div id="lightbox" onclick="closeLightbox()">
    <button class="lb-close" onclick="closeLightbox()"><i class="fa-solid fa-xmark"></i></button>
    <img id="lb-img" src="" alt="">
</div>

<!-- ── Incoming Call Modal ───────────────────────────────── -->
<div id="call-incoming" style="display:none">
    <div class="call-modal">
        <div class="call-avatar" id="call-peer-avatar"></div>
        <div class="call-peer-name" id="call-peer-name">Unknown</div>
        <div class="call-type-label" id="call-type-label">Voice Call</div>
        <div class="call-actions">
            <button class="call-btn decline" onclick="declineCall()"><i class="fa-solid fa-phone-slash"></i></button>
            <button class="call-btn accept"  onclick="acceptCall()"><i class="fa-solid fa-phone"></i></button>
        </div>
    </div>
</div>

<!-- ── Active Call UI ────────────────────────────────────── -->
<div id="call-active" style="display:none">
    <div class="active-call-bar">
        <div class="call-info">
            <span class="call-status-dot"></span>
            <span id="active-call-name">Call</span>
            <span id="call-timer">00:00</span>
        </div>
        <div class="call-controls">
            <button class="ctrl-btn" id="btn-mute"   onclick="toggleMute()"  title="Mute"><i class="fa-solid fa-microphone"></i></button>
            <button class="ctrl-btn" id="btn-cam"    onclick="toggleCamera()" title="Camera" style="display:none"><i class="fa-solid fa-video"></i></button>
            <button class="ctrl-btn" id="btn-speaker"onclick="toggleSpeaker()" title="Speaker"><i class="fa-solid fa-volume-high"></i></button>
            <button class="ctrl-btn end"             onclick="endCall()"     title="End"><i class="fa-solid fa-phone-slash"></i></button>
        </div>
    </div>
    <!-- Video streams -->
    <div id="video-container" style="display:none">
        <video id="remote-video" autoplay playsinline></video>
        <video id="local-video"  autoplay playsinline muted></video>
    </div>
</div>

<!-- ── Context Menu ──────────────────────────────────────── -->
<div id="ctx-menu">
    <div class="ctx-item" onclick="ctxReply()"><i class="fa-solid fa-reply"></i> Reply</div>
    <div class="ctx-item copy-only" onclick="ctxCopy()" style="display:none"><i class="fa-solid fa-copy"></i> Copy</div>
    <div class="ctx-item" onclick="ctxReact()"><i class="fa-regular fa-face-smile"></i> React</div>
    <div class="ctx-item" onclick="ctxForward()"><i class="fa-solid fa-share"></i> Forward</div>
    <div class="ctx-item edit-only" onclick="ctxEdit()" style="display:none"><i class="fa-solid fa-pen"></i> Edit</div>
    <div class="ctx-item" onclick="ctxBlock()"><i class="fa-solid fa-ban"></i> <span id="ctx-block-label">Block User</span></div>
    <div class="ctx-item danger" onclick="ctxDelete()" style="display:none"><i class="fa-solid fa-trash"></i> Delete</div>
</div>

<!-- ── Sidebar overlay ───────────────────────────────────── -->
<div class="sidebar-overlay" id="sidebar-overlay" onclick="closeSidebar()"></div>

<div class="chat-layout">

<!-- ════════════════════════════════════════════════════════
     SIDEBAR
════════════════════════════════════════════════════════ -->
<aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
        <div class="logo">
            <div class="logo-icon"><i class="fa-solid fa-comments"></i></div>
            <span class="logo-text"><?= APP_NAME ?></span>
        </div>
    </div>

    <div class="sidebar-tabs">
        <button class="sidebar-tab active" id="tab-chats" onclick="switchTab('chats')"><i class="fa-solid fa-message"></i> Chats</button>
        <button class="sidebar-tab" id="tab-calls" onclick="switchTab('calls')"><i class="fa-solid fa-phone"></i> Calls</button>
    </div>

    <div class="sidebar-search" id="chats-search">
        <div class="search-wrap">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="search-input" placeholder="Search people..." oninput="filterUsers(this.value)">
        </div>
    </div>

    <div class="sidebar-body" id="users-list">
        <div class="sidebar-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>
    </div>

    <div class="sidebar-body" id="calls-list" style="display:none">
        <div class="sidebar-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>
    </div>

    <div class="sidebar-footer">
        <div class="my-avatar" style="background:<?= htmlspecialchars($user['avatar_color']) ?>">
            <?= strtoupper(substr($user['username'], 0, 1)) ?>
            <span class="status-dot"></span>
        </div>
        <div class="my-info">
            <div class="my-name"><?= htmlspecialchars($user['username']) ?></div>
            <div class="my-status">Online</div>
        </div>
        <a href="settings.php" class="btn-icon" title="Settings"><i class="fa-solid fa-gear"></i></a>
        <a href="auth/logout.php" class="btn-icon" title="Sign Out"><i class="fa-solid fa-right-from-bracket"></i></a>
    </div>
</aside>

<!-- ════════════════════════════════════════════════════════
     MAIN
════════════════════════════════════════════════════════ -->
<main class="chat-main" id="chat-main">

    <!-- Welcome -->
    <div class="welcome-screen" id="welcome-screen">
        <div class="welcome-inner">
            <div class="welcome-icon"><i class="fa-solid fa-comments"></i></div>
            <h2>Welcome, <?= htmlspecialchars($user['username']) ?>!</h2>
            <p>Select someone to start chatting.</p>
        </div>
    </div>

    <!-- Chat view -->
    <div class="chat-view" id="chat-view" style="display:none">

        <!-- Header -->
        <div class="chat-header">
            <button class="btn-icon" onclick="toggleSidebar()"><i class="fa-solid fa-bars"></i></button>
            <div class="chat-peer-avatar" id="peer-avatar" onclick="activePeer && showProfileModal(activePeer)"></div>
            <div class="chat-header-info" onclick="activePeer && showProfileModal(activePeer)"  style="cursor:pointer">
                <div class="chat-header-name" id="peer-name">—</div>
                <div class="chat-header-sub"  id="peer-sub">Online</div>
            </div>
            <div class="chat-header-actions">
                <button class="btn-icon" id="btn-search-toggle" onclick="toggleSearchBar()" title="Search"><i class="fa-solid fa-magnifying-glass"></i></button>
                <button class="btn-icon" onclick="startCall('voice')" title="Voice Call"><i class="fa-solid fa-phone"></i></button>
                <button class="btn-icon" onclick="startCall('video')" title="Video Call"><i class="fa-solid fa-video"></i></button>
                <button class="btn-icon" onclick="clearChat()"        title="Clear Chat"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>

        <!-- Search bar -->
        <div id="search-bar" style="display:none" class="chat-search-bar">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="search-input-chat" placeholder="Search messages..." oninput="searchMessages(this.value)">
            <button onclick="closeSearchBar()"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <!-- Search results overlay -->
        <div id="search-results" style="display:none" class="search-results-panel"></div>

        <!-- Messages -->
        <div class="chat-messages" id="chat-messages"></div>

        <!-- Reply preview -->
        <div id="reply-bar" style="display:none">
            <div class="reply-preview">
                <div class="reply-info">
                    <i class="fa-solid fa-reply"></i>
                    <span id="reply-username"></span>
                </div>
                <div id="reply-text"></div>
            </div>
            <button onclick="cancelReply()"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <!-- Typing indicator -->
        <div id="typing-bar" style="display:none">
            <div class="typing-dots"><span></span><span></span><span></span></div>
            <span id="typing-label">typing...</span>
        </div>

        <!-- Input -->
        <div class="chat-input-area">
            <div class="emoji-bar" id="emoji-bar">
                <?php
                $emojis=['😀','😂','😍','🥰','😎','🤔','👍','❤️','🔥','🎉','😅','🙏','💯','✨','😊','🤣','😭','😜','🤩','👏','🎶','👀','💪','🤝','😤'];
                foreach($emojis as $e) echo "<button class='emoji-btn' onclick='insertEmoji(\"{$e}\")'>{$e}</button>";
                ?>
            </div>
            <div class="input-row">
                <button class="btn-attach" onclick="document.getElementById('file-input').click()" title="Attach file">
                    <i class="fa-solid fa-paperclip"></i>
                </button>
                <input type="file" id="file-input" style="display:none" accept="image/*,video/mp4,.pdf,.doc,.docx,.zip,.txt" onchange="handleFileSelect(this)">
                <button class="btn-emoji" onclick="toggleEmoji()"><i class="fa-regular fa-face-smile"></i></button>
                <textarea id="msg-input" placeholder="Type a message..." rows="1"
                    oninput="autoResize(this);handleTyping()" onkeydown="handleKey(event)"></textarea>
                <button class="btn-voice" id="btn-voice" onclick="startVoiceRecord()" title="Voice message">
                    <i class="fa-solid fa-microphone"></i>
                </button>
                <button class="btn-send" id="btn-send" onclick="sendMessage()">
                    <i class="fa-solid fa-paper-plane"></i>
                </button>
            </div>
        </div>

    </div><!-- /chat-view -->
</main>
</div><!-- /chat-layout -->

<!-- File upload preview modal -->
<div id="file-preview-modal" style="display:none">
    <div class="file-modal-inner">
        <button class="file-modal-close" onclick="cancelFileUpload()"><i class="fa-solid fa-xmark"></i></button>
        <div id="file-preview-content"></div>
        <div class="file-modal-caption">
            <input type="text" id="file-caption" placeholder="Add a caption (optional)...">
            <button onclick="sendFile()"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
    </div>
</div>

<audio id="snd-send"    src="assets/sounds/send.mp3"    preload="auto"></audio>
<audio id="snd-receive" src="assets/sounds/receive.mp3" preload="auto"></audio>
<audio id="snd-ringing" src="assets/sounds/ringing.mp3" preload="auto" loop></audio>

<script>
const CURRENT_USER   = {
    id:           <?= json_encode($user['id']) ?>,
    username:     <?= json_encode($user['username']) ?>,
    avatar_color: <?= json_encode($user['avatar_color']) ?>
};
const SUPABASE_URL      = <?= json_encode(SUPABASE_URL) ?>;
const SUPABASE_ANON_KEY = <?= json_encode(SUPABASE_ANON_KEY) ?>;
const CSRF_TOKEN        = <?= json_encode(csrf_token()) ?>;
</script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="assets/js/chat.js"></script>
<script src="assets/js/call.js"></script>
</body>
</html>
