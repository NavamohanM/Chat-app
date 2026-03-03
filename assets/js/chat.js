/* ============================================================
   ChatApp — Full WhatsApp Clone
   ============================================================ */

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── State ─────────────────────────────────────────────────────
let activePeer    = null;
let messages      = [];
let lastDate      = null;
let lastGroup     = null;
let lastMsgTs     = null;
let channel       = null;
let pollTimer     = null;
let typingTimer   = null;
let typingTimeout = null;
let allUsers      = [];
let unreadCounts  = {};
let emojiOpen     = false;
let replyTo       = null;
let ctxMsgId      = null;
let ctxMsgMine    = false;
let selectedFile  = null;

// ── DOM ───────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const usersList     = $('users-list');
const chatView      = $('chat-view');
const welcomeScreen = $('welcome-screen');
const msgsEl        = $('chat-messages');
const inputEl       = $('msg-input');
const sendBtn       = $('btn-send');
const peerNameEl    = $('peer-name');
const peerSubEl     = $('peer-sub');
const peerAvatarEl  = $('peer-avatar');
const replyBar      = $('reply-bar');
const typingBar     = $('typing-bar');
const ctxMenu       = $('ctx-menu');

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadUsers();
    subscribeRealtime();
    setInterval(updateLastSeen, 30000);
    document.addEventListener('click', () => ctxMenu.style.display = 'none');
});

// ── Load users ────────────────────────────────────────────────
async function loadUsers() {
    const res  = await fetch('api/users.php');
    const json = await res.json();
    if (!json.success) return;
    allUsers = json.data;
    renderUsers(allUsers);
}

function renderUsers(users) {
    if (!users.length) {
        usersList.innerHTML = '<div class="no-users"><i class="fa-solid fa-user-plus"></i><p>No users yet</p></div>';
        return;
    }
    usersList.innerHTML = users.map(u => `
        <div class="user-item" id="ui-${u.id}" onclick="openChat('${u.id}','${escAttr(u.username)}','${u.avatar_color}')">
            <div class="user-av" style="background:${u.avatar_color}">${u.username[0].toUpperCase()}</div>
            <div class="user-info">
                <div class="user-name">${escHtml(u.username)}</div>
                <div class="user-preview" id="prev-${u.id}">Tap to chat</div>
            </div>
            <div class="user-meta">
                <span class="unread-badge" id="badge-${u.id}" style="display:none">0</span>
            </div>
        </div>`).join('');
}

function filterUsers(q) {
    renderUsers(allUsers.filter(u => u.username.toLowerCase().includes(q.toLowerCase())));
    if (activePeer) $('ui-' + activePeer.id)?.classList.add('active');
}

// ── Open chat ─────────────────────────────────────────────────
async function openChat(id, username, color) {
    document.querySelectorAll('.user-item').forEach(e => e.classList.remove('active'));
    $('ui-' + id)?.classList.add('active');

    activePeer = { id, username, avatar_color: color };
    peerNameEl.textContent      = username;
    peerAvatarEl.textContent    = username[0].toUpperCase();
    peerAvatarEl.style.background = color;
    peerSubEl.textContent       = 'Online';
    peerSubEl.className         = 'chat-header-sub live';

    welcomeScreen.style.display = 'none';
    chatView.style.display      = 'flex';

    messages  = []; lastDate = null; lastGroup = null; lastMsgTs = null;
    msgsEl.innerHTML = '<div class="msgs-loading"><i class="fa-solid fa-spinner fa-spin"></i></div>';
    cancelReply();
    clearUnread(id);
    closeSidebar();

    await loadMessages();
    inputEl.focus();
}

// ── Load messages ─────────────────────────────────────────────
async function loadMessages() {
    if (!activePeer) return;
    try {
        const res  = await fetch(`api/fetch_messages.php?with=${activePeer.id}&limit=60`);
        const json = await res.json();
        msgsEl.innerHTML = '';
        if (!json.success) { msgsEl.innerHTML = '<div class="msgs-error">Failed to load.</div>'; return; }
        if (!json.data.length) {
            msgsEl.innerHTML = `<div class="empty-state"><i class="fa-regular fa-comment-dots"></i><p>Say hi to ${escHtml(activePeer.username)}!</p></div>`;
            return;
        }
        json.data.forEach(m => appendMessage(m, false));
        lastMsgTs = json.data[json.data.length - 1].created_at;
        scrollToBottom(false);
    } catch(e) {
        msgsEl.innerHTML = '<div class="msgs-error">Connection error.</div>';
    }
}

// ── Realtime ──────────────────────────────────────────────────
function subscribeRealtime() {
    if (channel) { supabaseClient.removeChannel(channel); channel = null; }

    channel = supabaseClient
        .channel('chat-' + CURRENT_USER.id)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, onNewMessage)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, onUpdateMessage)
        .subscribe(status => {
            console.log('Realtime:', status);
            if (status === 'SUBSCRIBED') { setConnected(true); stopPolling(); }
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { setConnected(false); startPolling(); setTimeout(subscribeRealtime, 5000); }
        });
}

function onNewMessage(payload) {
    const msg = payload.new;
    console.log('New msg:', msg);

    const isMine  = msg.user_id     === CURRENT_USER.id;
    const forMe   = msg.receiver_id === CURRENT_USER.id;
    const fromActive = activePeer && msg.user_id     === activePeer.id;
    const toActive   = activePeer && msg.receiver_id === activePeer.id;

    // Fallback: receiver_id missing from payload
    if (!msg.receiver_id) {
        if (activePeer && fromActive) fetchLatest();
        return;
    }

    if (activePeer && ((isMine && toActive) || (forMe && fromActive))) {
        if (messages.find(m => m.id === msg.id)) return;
        // Replace temp bubble
        const ti = messages.findIndex(m => String(m.id).startsWith('temp_') && m.user_id === msg.user_id);
        if (ti !== -1) {
            const old = messages[ti].id;
            messages[ti] = msg;
            const el = document.querySelector(`[data-id="${old}"]`);
            if (el) { el.setAttribute('data-id', msg.id); el.classList.remove('pending'); }
        } else {
            appendMessage(msg, true);
            scrollToBottom(true);
            if (!isMine) playSound('receive');
        }
        lastMsgTs = msg.created_at;
        setPreview(activePeer.id, msg.message || '📎 File');
    } else if (forMe && !fromActive) {
        addUnread(msg.user_id);
        setPreview(msg.user_id, msg.message || '📎 File');
        playSound('receive');
    }
}

function onUpdateMessage(payload) {
    const msg = payload.new;
    if (msg.deleted_at) {
        const el = document.querySelector(`[data-id="${msg.id}"]`);
        if (el) {
            el.classList.add('deleted');
            el.innerHTML = '<i class="fa-solid fa-ban"></i> This message was deleted';
        }
        const idx = messages.findIndex(m => m.id === msg.id);
        if (idx !== -1) messages[idx] = msg;
    }
}

// ── Fetch latest (fallback) ───────────────────────────────────
async function fetchLatest() {
    if (!activePeer) return;
    try {
        const after = lastMsgTs ? `&after=${encodeURIComponent(lastMsgTs)}` : '';
        const res   = await fetch(`api/fetch_messages.php?with=${activePeer.id}&limit=10${after}`);
        const json  = await res.json();
        if (!json.success || !json.data.length) return;
        let added = false;
        json.data.forEach(m => {
            if (messages.find(x => x.id === m.id)) return;
            const ti = messages.findIndex(x => String(x.id).startsWith('temp_') && x.user_id === m.user_id);
            if (ti !== -1) {
                const old = messages[ti].id;
                messages[ti] = m;
                const el = document.querySelector(`[data-id="${old}"]`);
                if (el) { el.setAttribute('data-id', m.id); el.classList.remove('pending'); }
            } else { appendMessage(m, true); added = true; }
            lastMsgTs = m.created_at;
        });
        if (added) scrollToBottom(true);
    } catch(e) {}
}

// ── Send text message ─────────────────────────────────────────
async function sendMessage() {
    if (!activePeer) return;
    const text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = '';
    autoResize(inputEl);
    sendBtn.disabled = true;

    const tempId = 'temp_' + Date.now();
    const tempMsg = {
        id: tempId, user_id: CURRENT_USER.id,
        receiver_id: activePeer.id, username: CURRENT_USER.username,
        message: text, created_at: new Date().toISOString(),
        reply_to: replyTo?.id || null, _pending: true,
        _replyData: replyTo,
    };
    removeEmptyState();
    appendMessage(tempMsg, true);
    scrollToBottom(true);
    setPreview(activePeer.id, text);
    playSound('send');

    const body = { message: text, receiver_id: activePeer.id };
    if (replyTo) body.reply_to = replyTo.id;
    cancelReply();

    try {
        const res  = await fetch('api/send_message.php', {
            method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
        });
        const json = await res.json();
        if (json.success && json.data) {
            const idx = messages.findIndex(m => m.id === tempId);
            if (idx !== -1) messages[idx] = json.data;
            const el = document.querySelector(`[data-id="${tempId}"]`);
            if (el) { el.setAttribute('data-id', json.data.id); el.classList.remove('pending'); }
        }
    } catch(e) {
        const el = document.querySelector(`[data-id="${tempId}"]`);
        if (el) el.classList.add('failed');
    } finally { sendBtn.disabled = false; inputEl.focus(); }
}

// ── File upload ───────────────────────────────────────────────
function handleFileSelect(input) {
    const file = input.files[0];
    if (!file) return;
    selectedFile = file;
    const modal = $('file-preview-modal');
    const content = $('file-preview-content');

    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = e => { content.innerHTML = `<img src="${e.target.result}" alt="preview">`; };
        reader.readAsDataURL(file);
    } else {
        content.innerHTML = `<div class="file-preview-icon"><i class="fa-solid fa-file"></i><span>${escHtml(file.name)}</span><small>${formatSize(file.size)}</small></div>`;
    }
    modal.style.display = 'flex';
    input.value = '';
}

function cancelFileUpload() {
    selectedFile = null;
    $('file-preview-modal').style.display = 'none';
    $('file-caption').value = '';
}

async function sendFile() {
    if (!selectedFile || !activePeer) return;
    const caption = $('file-caption').value.trim();
    cancelFileUpload();

    const formData = new FormData();
    formData.append('file', selectedFile);

    // Show upload bubble
    const tempId = 'temp_' + Date.now();
    const tempMsg = {
        id: tempId, user_id: CURRENT_USER.id, receiver_id: activePeer.id,
        username: CURRENT_USER.username, message: caption || selectedFile.name,
        created_at: new Date().toISOString(), _pending: true, _uploading: true,
        file_name: selectedFile.name, file_type: selectedFile.type,
    };
    removeEmptyState();
    appendMessage(tempMsg, true);
    scrollToBottom(true);

    try {
        const upRes  = await fetch('api/upload.php', { method: 'POST', body: formData });
        const upJson = await upRes.json();
        if (!upJson.success) throw new Error(upJson.error);

        const body = {
            message:     caption || '',
            receiver_id: activePeer.id,
            file_url:    upJson.url,
            file_name:   upJson.name,
            file_type:   upJson.type,
        };
        const res  = await fetch('api/send_message.php', {
            method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
        });
        const json = await res.json();
        if (json.success && json.data) {
            const idx = messages.findIndex(m => m.id === tempId);
            if (idx !== -1) messages[idx] = json.data;
            const el = document.querySelector(`[data-id="${tempId}"]`);
            if (el) { el.setAttribute('data-id', json.data.id); el.classList.remove('pending'); el.classList.remove('uploading'); refreshBubble(el, json.data); }
        }
        playSound('send');
    } catch(e) {
        console.error('File send error:', e);
        const el = document.querySelector(`[data-id="${tempId}"]`);
        if (el) el.classList.add('failed');
    }
}

// ── Render message ────────────────────────────────────────────
function appendMessage(msg, animate) {
    messages.push(msg);
    const isOwn   = msg.user_id === CURRENT_USER.id;
    const dir     = isOwn ? 'outgoing' : 'incoming';
    const dateStr = formatDate(msg.created_at);
    const timeStr = formatTime(msg.created_at);

    if (dateStr !== lastDate) {
        lastDate = dateStr; lastGroup = null;
        const div = document.createElement('div');
        div.className = 'date-divider';
        div.innerHTML = `<span>${dateStr}</span>`;
        msgsEl.appendChild(div);
    }

    const prev     = messages[messages.length - 2];
    const canGroup = lastGroup && prev && prev.user_id === msg.user_id
        && (new Date(msg.created_at) - new Date(prev.created_at)) < 5 * 60 * 1000;

    if (canGroup) {
        const bubble = makeBubble(msg, isOwn);
        const timeEl = lastGroup.querySelector('.msg-time');
        lastGroup.insertBefore(bubble, timeEl);
        if (timeEl) timeEl.textContent = timeStr;
    } else {
        const group = document.createElement('div');
        group.className = `msg-group ${dir}`;
        if (animate) group.style.animation = 'msg-in 0.18s ease';
        group.appendChild(makeBubble(msg, isOwn));
        const timeEl = document.createElement('div');
        timeEl.className = 'msg-time';
        timeEl.textContent = timeStr;
        group.appendChild(timeEl);
        msgsEl.appendChild(group);
        lastGroup = group;
    }
}

function makeBubble(msg, isOwn) {
    const b = document.createElement('div');
    b.className = 'msg-bubble'
        + (msg._pending  ? ' pending'   : '')
        + (msg._uploading? ' uploading' : '')
        + (msg.deleted_at? ' deleted'   : '');
    b.setAttribute('data-id', msg.id);
    b.setAttribute('data-own', isOwn ? '1' : '0');

    if (msg.deleted_at) {
        b.innerHTML = '<i class="fa-solid fa-ban"></i> This message was deleted';
        return b;
    }

    let html = '';

    // Reply quote
    if (msg._replyData) {
        html += `<div class="reply-quote"><span>${escHtml(msg._replyData.username)}</span>${escHtml(msg._replyData.message || '📎')}</div>`;
    }

    // File / image
    if (msg.file_url) {
        if (msg.file_type && msg.file_type.startsWith('image/')) {
            html += `<img class="msg-img" src="${escAttr(msg.file_url)}" alt="image" onclick="openLightbox('${escAttr(msg.file_url)}')">`;
        } else {
            const icon = getFileIcon(msg.file_type || '');
            html += `<a class="msg-file" href="${escAttr(msg.file_url)}" target="_blank" download="${escAttr(msg.file_name||'file')}">
                <i class="fa-solid ${icon}"></i>
                <div><div class="fn">${escHtml(msg.file_name||'File')}</div></div>
                <i class="fa-solid fa-download"></i>
            </a>`;
        }
    }

    if (msg.message) html += `<span class="msg-text">${escHtml(msg.message)}</span>`;
    if (msg._uploading) html += '<span class="upload-progress"><i class="fa-solid fa-spinner fa-spin"></i> Uploading...</span>';

    b.innerHTML = html;

    // Context menu on right-click / long press
    b.addEventListener('contextmenu', e => { e.preventDefault(); showCtxMenu(e, msg.id, isOwn); });

    return b;
}

function refreshBubble(el, msg) {
    const isOwn = msg.user_id === CURRENT_USER.id;
    const nb = makeBubble(msg, isOwn);
    el.replaceWith(nb);
}

// ── Context menu ──────────────────────────────────────────────
function showCtxMenu(e, msgId, isOwn) {
    ctxMsgId  = msgId;
    ctxMsgOwn = isOwn;
    ctxMenu.style.display = 'block';
    ctxMenu.style.left    = Math.min(e.clientX, window.innerWidth - 150) + 'px';
    ctxMenu.style.top     = Math.min(e.clientY, window.innerHeight - 80) + 'px';
    ctxMenu.querySelector('.danger').style.display = isOwn ? 'flex' : 'none';
}

function ctxReply() {
    const msg = messages.find(m => m.id === ctxMsgId);
    if (!msg) return;
    replyTo = msg;
    $('reply-username').textContent = msg.username;
    $('reply-text').textContent     = msg.message || '📎 File';
    replyBar.style.display = 'flex';
    inputEl.focus();
}

function cancelReply() { replyTo = null; replyBar.style.display = 'none'; }

async function ctxDelete() {
    if (!ctxMsgId) return;
    if (!confirm('Delete this message?')) return;
    try {
        await fetch('api/delete_message.php', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ message_id: ctxMsgId })
        });
        const el = document.querySelector(`[data-id="${ctxMsgId}"]`);
        if (el) { el.classList.add('deleted'); el.innerHTML = '<i class="fa-solid fa-ban"></i> This message was deleted'; }
    } catch(e) {}
}

// ── Clear all chat ────────────────────────────────────────────
async function clearChat() {
    if (!activePeer) return;
    if (!confirm(`Clear all messages with ${activePeer.username}?`)) return;
    // Soft delete all messages in this conversation that belong to me
    const mine = messages.filter(m => m.user_id === CURRENT_USER.id);
    await Promise.all(mine.map(m =>
        fetch('api/delete_message.php', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ message_id: m.id })
        })
    ));
    await loadMessages();
}

// ── Typing indicator ──────────────────────────────────────────
let isTypingNow = false;
function handleTyping() {
    if (!activePeer) return;
    if (!isTypingNow) {
        isTypingNow = true;
        fetch(`api/typing.php?to=${activePeer.id}&typing=1`);
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        isTypingNow = false;
        fetch(`api/typing.php?to=${activePeer.id}&typing=0`);
    }, 2000);
}

function showTyping(username) {
    $('typing-label').textContent = `${username} is typing...`;
    typingBar.style.display = 'flex';
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => { typingBar.style.display = 'none'; }, 3000);
}

// ── Last seen ─────────────────────────────────────────────────
function updateLastSeen() {
    fetch('api/typing.php?to=0&typing=0');
}

// ── Unread ────────────────────────────────────────────────────
function addUnread(uid) {
    unreadCounts[uid] = (unreadCounts[uid] || 0) + 1;
    const b = $('badge-' + uid);
    if (b) { b.textContent = unreadCounts[uid]; b.style.display = 'inline-flex'; }
    const item = $('ui-' + uid);
    if (item) usersList.prepend(item);
}

function clearUnread(uid) {
    unreadCounts[uid] = 0;
    const b = $('badge-' + uid);
    if (b) b.style.display = 'none';
}

function setPreview(uid, text) {
    const el = $('prev-' + uid);
    if (el) el.textContent = text.length > 35 ? text.slice(0,35) + '…' : text;
}

// ── Polling fallback ──────────────────────────────────────────
function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => { if (activePeer && lastMsgTs) fetchLatest(); }, 2500);
}
function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

// ── Connection ────────────────────────────────────────────────
function setConnected(ok) {
    if (peerSubEl && activePeer) {
        peerSubEl.textContent = ok ? 'Online' : 'Reconnecting...';
        peerSubEl.className   = ok ? 'chat-header-sub live' : 'chat-header-sub';
    }
    showToast(ok ? 'Connected' : 'Reconnecting...', ok ? 'connected' : '');
}

let toastT;
function showToast(msg, type) {
    const t = $('toast-bar');
    t.className = 'show ' + (type||'');
    $('toast-msg').textContent = msg;
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.className=''; }, 2000);
}

// ── Sounds ────────────────────────────────────────────────────
function playSound(name) {
    try { const a = $(name==='send'?'snd-send':'snd-receive'); if(a){a.currentTime=0;a.play().catch(()=>{});} } catch(e){}
}

// ── Lightbox ──────────────────────────────────────────────────
function openLightbox(url) {
    $('lb-img').src = url;
    $('lightbox').style.display = 'flex';
}
function closeLightbox() { $('lightbox').style.display = 'none'; }

// ── Helpers ───────────────────────────────────────────────────
function removeEmptyState() { msgsEl.querySelector('.empty-state')?.remove(); }
function scrollToBottom(smooth) { msgsEl.scrollTo({top: msgsEl.scrollHeight, behavior: smooth?'smooth':'instant'}); }

function formatDate(iso) {
    const d = new Date(iso), now = new Date();
    const diff = new Date(now.toDateString()) - new Date(d.toDateString());
    if (diff===0) return 'Today';
    if (diff===86400000) return 'Yesterday';
    return d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
}
function formatTime(iso) { return new Date(iso).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}); }
function formatSize(b) { return b>1048576?(b/1048576).toFixed(1)+' MB':(b/1024).toFixed(0)+' KB'; }
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s) { return String(s).replace(/"/g,'&quot;'); }

function getFileIcon(type) {
    if (type.includes('pdf'))   return 'fa-file-pdf';
    if (type.includes('word'))  return 'fa-file-word';
    if (type.includes('zip'))   return 'fa-file-zipper';
    if (type.includes('text'))  return 'fa-file-lines';
    if (type.includes('video')) return 'fa-file-video';
    return 'fa-file';
}

// ── Emoji ─────────────────────────────────────────────────────
function toggleEmoji() { emojiOpen=!emojiOpen; $('emoji-bar').classList.toggle('show',emojiOpen); }
function insertEmoji(e) {
    const s=inputEl.selectionStart, end=inputEl.selectionEnd;
    inputEl.value=inputEl.value.slice(0,s)+e+inputEl.value.slice(end);
    inputEl.setSelectionRange(s+e.length,s+e.length);
    inputEl.focus();
}

// ── Input ─────────────────────────────────────────────────────
function handleKey(e) { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();} }
function autoResize(el) { el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,120)+'px'; }

// ── Sidebar ───────────────────────────────────────────────────
function toggleSidebar() { $('sidebar').classList.toggle('open'); $('sidebar-overlay').classList.toggle('show'); }
function closeSidebar()  { $('sidebar').classList.remove('open'); $('sidebar-overlay').classList.remove('show'); }
