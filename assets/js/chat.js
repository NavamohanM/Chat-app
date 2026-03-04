/* ============================================================
   ChatApp — Full WhatsApp Clone  v2
   ============================================================ */

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── State ─────────────────────────────────────────────────────
let blockedUsers  = new Set();
let mediaRecorder = null;
let audioChunks   = [];
let isRecording   = false;
let loadingOlder  = false;
let hasMoreMsgs   = true;
let oldestMsgTs   = null;
let searchTimer   = null;
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
let ctxMsgOwn     = false;
let selectedFile  = null;
let isOnline      = navigator.onLine;
let offlineQueue  = [];   // localStorage-backed offline queue
let broadcastChannel = null;
let totalUnread   = 0;    // for browser tab badge
let newMsgDividerAdded = false; // "New Messages" divider

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

// ── Jump-to-latest button ─────────────────────────────────────
let jumpBtn = null;
function setupJumpBtn() {
    if (jumpBtn) return;
    jumpBtn = document.createElement('button');
    jumpBtn.id = 'jump-latest';
    jumpBtn.className = 'jump-latest-btn';
    jumpBtn.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
    jumpBtn.onclick = () => { scrollToBottom(true); jumpBtn.style.display = 'none'; };
    document.querySelector('.chat-view')?.appendChild(jumpBtn);
    msgsEl.addEventListener('scroll', () => {
        const distFromBottom = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight;
        if (jumpBtn) jumpBtn.style.display = distFromBottom > 200 ? 'flex' : 'none';
    });
}

// ── Browser notifications ─────────────────────────────────────
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}
function showBrowserNotification(title, body, icon) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return; // tab is focused — skip
    try {
        const n = new Notification(title, { body, icon: icon || '/favicon.ico', tag: 'chat-msg', renotify: true });
        n.onclick = () => { window.focus(); n.close(); };
        setTimeout(() => n.close(), 5000);
    } catch(e) {}
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadOfflineQueue();
    loadUnreadCounts();
    loadBlockedUsers();
    loadUsers();
    subscribeRealtime();
    subscribeBroadcast();
    startPolling();           // always-on fallback — ensures messages never get stuck
    requestNotificationPermission();
    setInterval(updateLastSeen, 30000);
    document.addEventListener('click', e => {
        if (!ctxMenu.contains(e.target)) ctxMenu.style.display = 'none';
        if (!$('emoji-bar').contains(e.target) && !e.target.closest('.btn-emoji')) closeEmoji();
        // Close reaction picker on outside click
        document.querySelectorAll('.reaction-picker').forEach(p => p.remove());
    });

    // Paste image from clipboard
    document.addEventListener('paste', handlePaste);

    // Drag and drop files onto chat
    const chatView = $('chat-view');
    if (chatView) {
        chatView.addEventListener('dragover', e => { e.preventDefault(); chatView.classList.add('drag-over'); });
        chatView.addEventListener('dragleave', e => { if (!chatView.contains(e.relatedTarget)) chatView.classList.remove('drag-over'); });
        chatView.addEventListener('drop', e => {
            e.preventDefault(); chatView.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file && activePeer) { selectedFile = file; showFilePreview(file); }
        });
    }

    // Online / offline detection
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    if (!navigator.onLine) showOfflineBanner();
});

// ── Offline / Online ──────────────────────────────────────────
function handleOnline() {
    isOnline = true;
    hideOfflineBanner();
    showToast('Back online', 'connected');
    flushOfflineQueue();
    subscribeRealtime();
}
function handleOffline() {
    isOnline = false;
    showOfflineBanner();
    showToast('You are offline', '');
}
function showOfflineBanner() {
    let b = $('offline-banner');
    if (!b) {
        b = document.createElement('div');
        b.id = 'offline-banner';
        b.className = 'offline-banner';
        b.innerHTML = '<i class="fa-solid fa-wifi-exclamation"></i> You are offline — messages will be sent when reconnected';
        document.body.prepend(b);
    }
    b.classList.add('show');
}
function hideOfflineBanner() {
    const b = $('offline-banner');
    if (b) b.classList.remove('show');
}

// ── Paste image from clipboard ────────────────────────────────
function handlePaste(e) {
    if (!activePeer) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
        if (item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) { selectedFile = file; showFilePreview(file); }
            break;
        }
    }
}

// ── Show file preview (shared by drag-drop & paste) ──────────
function showFilePreview(file) {
    const modal   = $('file-preview-modal');
    const content = $('file-preview-content');
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = e => { content.innerHTML = `<img src="${e.target.result}" alt="preview">`; };
        reader.readAsDataURL(file);
    } else {
        content.innerHTML = `<div class="file-preview-icon"><i class="fa-solid fa-file"></i><span>${escHtml(file.name)}</span><small>${formatSize(file.size)}</small></div>`;
    }
    modal.style.display = 'flex';
}

// ── Forward message modal ─────────────────────────────────────
let _forwardMsg = null;

function showForwardModal(msg) {
    _forwardMsg = msg;
    let modal = $('forward-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'forward-modal';
    modal.className = 'forward-modal-overlay';
    const peers = allUsers.filter(u => u.id !== CURRENT_USER.id);
    modal.innerHTML = `
        <div class="forward-modal">
            <div class="forward-header">
                <span>Forward to...</span>
                <button onclick="document.getElementById('forward-modal').remove()"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="forward-list">
                ${peers.map(u => `
                <div class="forward-item" data-uid="${escAttr(u.id)}" data-uname="${escAttr(u.username)}" data-ucolor="${escAttr(u.avatar_color)}">
                    <div class="user-av" style="background:${u.avatar_color};width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0">${u.username[0].toUpperCase()}</div>
                    <span>${escHtml(u.username)}</span>
                </div>`).join('')}
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('.forward-item').forEach(item => {
        item.addEventListener('click', () => {
            doForward(item.dataset.uid, item.dataset.uname, item.dataset.ucolor, _forwardMsg);
        });
    });
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

async function doForward(uid, username, color, msg) {
    document.getElementById('forward-modal')?.remove();
    const body = { receiver_id: uid };
    if (msg.message) body.message = msg.message;
    if (msg.file_url) { body.file_url = msg.file_url; body.file_name = msg.file_name; body.file_type = msg.file_type; }
    try {
        const res  = await fetch('api/send_message.php', {
            method: 'POST', headers: {'Content-Type':'application/json','X-CSRF-Token':CSRF_TOKEN}, body: JSON.stringify(body)
        });
        const json = await res.json();
        if (json.success) {
            showToast(`Forwarded to ${username}`, '');
            broadcastToUser(uid, 'new_message', { msg: json.data });
            if (activePeer && uid === activePeer.id && json.data) { appendMessage(json.data, true); scrollToBottom(true); }
        }
    } catch(e) { showToast('Forward failed', ''); }
}

// ── User profile modal ────────────────────────────────────────
function showProfileModal(user) {
    let modal = $('profile-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'profile-modal';
    modal.className = 'profile-modal-overlay';
    modal.innerHTML = `
        <div class="profile-modal">
            <button class="profile-close" onclick="document.getElementById('profile-modal').remove()"><i class="fa-solid fa-xmark"></i></button>
            <div class="profile-avatar" style="background:${user.avatar_color}">${user.username[0].toUpperCase()}</div>
            <div class="profile-name">${escHtml(user.username)}</div>
            <div class="profile-status" id="pm-status">Checking status...</div>
            <div class="profile-actions">
                <button onclick="document.getElementById('profile-modal').remove();openChat('${user.id}','${escAttr(user.username)}','${user.avatar_color}')">
                    <i class="fa-solid fa-message"></i> Message
                </button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    // Populate status
    const u = allUsers.find(u2 => u2.id === user.id);
    if (u && u.last_seen) {
        const diff = (Date.now() - new Date(u.last_seen)) / 1000;
        $('pm-status').textContent = diff < 35 ? '🟢 Online' : 'Last seen ' + formatLastSeen(new Date(u.last_seen));
    }
}

// ── Offline queue (localStorage) ──────────────────────────────
function loadOfflineQueue() {
    try { offlineQueue = JSON.parse(localStorage.getItem('chat_offline_queue') || '[]'); } catch(e) { offlineQueue = []; }
}
function saveOfflineQueue() {
    try { localStorage.setItem('chat_offline_queue', JSON.stringify(offlineQueue)); } catch(e) {}
}
function addToOfflineQueue(payload) {
    offlineQueue.push(payload);
    saveOfflineQueue();
}
function removeFromOfflineQueue(tempId) {
    offlineQueue = offlineQueue.filter(q => q.tempId !== tempId);
    saveOfflineQueue();
}
async function flushOfflineQueue() {
    if (!offlineQueue.length) return;
    const queue = [...offlineQueue];
    for (const item of queue) {
        try {
            const res  = await fetch('api/send_message.php', {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify(item.body)
            });
            const json = await res.json();
            if (json.success) {
                removeFromOfflineQueue(item.tempId);
                // Update the pending bubble if still in DOM
                const el = document.querySelector(`[data-id="${item.tempId}"]`);
                if (el && json.data) { el.setAttribute('data-id', json.data.id); el.classList.remove('pending', 'failed'); }
            }
        } catch(e) {}
    }
}

// ── Persistent unread counts ──────────────────────────────────
function loadUnreadCounts() {
    try { unreadCounts = JSON.parse(localStorage.getItem('chat_unread') || '{}'); } catch(e) { unreadCounts = {}; }
}
function saveUnreadCounts() {
    try { localStorage.setItem('chat_unread', JSON.stringify(unreadCounts)); } catch(e) {}
}

// ── Load users ────────────────────────────────────────────────
async function loadUsers() {
    const res  = await fetch('api/users.php');
    const json = await res.json();
    if (!json.success) return;
    allUsers = json.data;
    renderUsers(allUsers);
    // Re-apply stored unread counts after render
    for (const [uid, count] of Object.entries(unreadCounts)) {
        if (count > 0) {
            const b = $('badge-' + uid);
            if (b) { b.textContent = count; b.style.display = 'inline-flex'; }
        }
    }
}

function renderUsers(users) {
    if (!users.length) {
        usersList.innerHTML = '<div class="no-users"><i class="fa-solid fa-user-plus"></i><p>No users yet</p></div>';
        return;
    }
    usersList.innerHTML = users.map(u => {
        const count = unreadCounts[u.id] || 0;
        return `
        <div class="user-item" id="ui-${u.id}" onclick="openChat('${u.id}','${escAttr(u.username)}','${u.avatar_color}')">
            <div class="user-av-wrap">
                <div class="user-av" style="background:${u.avatar_color}">${u.username[0].toUpperCase()}</div>
                <span class="online-dot" id="dot-${u.id}" style="display:none"></span>
            </div>
            <div class="user-info">
                <div class="user-name">${escHtml(u.username)}</div>
                <div class="user-preview" id="prev-${u.id}">Tap to chat</div>
            </div>
            <div class="user-meta">
                <span class="user-time" id="time-${u.id}"></span>
                <span class="unread-badge" id="badge-${u.id}" style="${count>0?'display:inline-flex':'display:none'}">${count||''}</span>
            </div>
        </div>`;
    }).join('');
    // Fetch and show last seen / online status
    refreshOnlineStatus();
}

function filterUsers(q) {
    renderUsers(allUsers.filter(u => u.username.toLowerCase().includes(q.toLowerCase())));
    if (activePeer) $('ui-' + activePeer.id)?.classList.add('active');
}

// ── Online / Last seen ────────────────────────────────────────
async function refreshOnlineStatus() {
    try {
        const res  = await fetch('api/users.php');
        const json = await res.json();
        if (!json.success) return;
        const now = new Date();
        json.data.forEach(u => {
            const dot = $('dot-' + u.id);
            const timeEl = $('time-' + u.id);
            if (!dot) return;
            const lastSeen = u.last_seen ? new Date(u.last_seen) : null;
            const diffSec  = lastSeen ? (now - lastSeen) / 1000 : Infinity;
            const isOnlineNow = diffSec < 35; // within 35s = online
            dot.style.display = isOnlineNow ? 'block' : 'none';
            if (timeEl && lastSeen) {
                timeEl.textContent = isOnlineNow ? '' : formatLastSeen(lastSeen);
            }
            // If this is the active peer, update header
            if (activePeer && u.id === activePeer.id) {
                peerSubEl.textContent = isOnlineNow ? 'Online' : 'Last seen ' + formatLastSeen(lastSeen);
                peerSubEl.className   = isOnlineNow ? 'chat-header-sub live' : 'chat-header-sub';
            }
        });
    } catch(e) {}
}

function formatLastSeen(date) {
    const now  = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60)    return 'just now';
    if (diff < 3600)  return Math.floor(diff/60) + 'm ago';
    if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
    return date.toLocaleDateString(undefined, {month:'short', day:'numeric'});
}

// ── Open chat ─────────────────────────────────────────────────
async function openChat(id, username, color) {
    document.querySelectorAll('.user-item').forEach(e => e.classList.remove('active'));
    $('ui-' + id)?.classList.add('active');

    activePeer = { id, username, avatar_color: color };
    peerNameEl.textContent      = username;
    peerAvatarEl.textContent    = username[0].toUpperCase();
    peerAvatarEl.style.background = color;
    peerAvatarEl.onclick        = () => showProfileModal(activePeer);
    peerSubEl.textContent       = 'Online';
    peerSubEl.className         = 'chat-header-sub live';

    welcomeScreen.style.display = 'none';
    chatView.style.display      = 'flex';

    messages  = []; lastDate = null; lastGroup = null; lastMsgTs = null;
    oldestMsgTs = null; hasMoreMsgs = true; newMsgDividerAdded = false;
    msgsEl.innerHTML = '<div class="msgs-loading"><i class="fa-solid fa-spinner fa-spin"></i></div>';
    cancelReply();
    clearUnread(id);
    closeSidebar();

    await loadMessages();
    markRead(id);
    setupJumpBtn();
    inputEl.focus();
}

// ── Load messages ─────────────────────────────────────────────
const MSG_PAGE = 30;
async function loadMessages() {
    if (!activePeer) return;
    try {
        const res  = await fetch(`api/fetch_messages.php?with=${activePeer.id}&limit=${MSG_PAGE}`);
        const json = await res.json();
        msgsEl.innerHTML = '';
        if (!json.success) { msgsEl.innerHTML = '<div class="msgs-error">Failed to load.</div>'; return; }
        if (!json.data.length) {
            hasMoreMsgs = false;
            msgsEl.innerHTML = `<div class="empty-state"><i class="fa-regular fa-comment-dots"></i><p>Say hi to ${escHtml(activePeer.username)}!</p></div>`;
            return;
        }
        if (json.data.length < MSG_PAGE) hasMoreMsgs = false;
        json.data.forEach(m => appendMessage(m, false));
        lastMsgTs   = json.data[json.data.length - 1].created_at;
        oldestMsgTs = json.data[0].created_at;
        scrollToBottom(false);
        // Load reactions for visible messages
        const msgIds = json.data.map(m => m.id).filter(id => !String(id).startsWith('temp_'));
        if (msgIds.length) loadReactions(msgIds);
        // Notify sender their messages are delivered (so they see double grey tick)
        broadcastToUser(activePeer.id, 'delivered', { from: CURRENT_USER.id });
        // Set up infinite scroll
        setupInfiniteScroll();
    } catch(e) {
        msgsEl.innerHTML = '<div class="msgs-error">Connection error.</div>';
    }
}

// ── Infinite scroll (load older messages) ────────────────────
function setupInfiniteScroll() {
    msgsEl.onscroll = async () => {
        if (msgsEl.scrollTop > 80) return;
        if (loadingOlder || !hasMoreMsgs || !oldestMsgTs) return;
        loadingOlder = true;
        const indicator = document.createElement('div');
        indicator.className = 'load-older';
        indicator.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading older messages...';
        msgsEl.prepend(indicator);
        try {
            const res  = await fetch(`api/fetch_messages.php?with=${activePeer.id}&limit=${MSG_PAGE}&before=${encodeURIComponent(oldestMsgTs)}`);
            const json = await res.json();
            indicator.remove();
            if (!json.success || !json.data.length) { hasMoreMsgs = false; loadingOlder = false; return; }
            if (json.data.length < MSG_PAGE) hasMoreMsgs = false;
            // Prepend older messages (save scroll position)
            const prevHeight = msgsEl.scrollHeight;
            const saved = { lastDate, lastGroup };
            lastDate = null; lastGroup = null;
            const frag = document.createDocumentFragment();
            const tempEl = document.createElement('div');
            json.data.forEach(m => {
                messages.unshift(m);
                appendOldMessage(m, tempEl);
            });
            while (tempEl.firstChild) frag.appendChild(tempEl.firstChild);
            msgsEl.prepend(frag);
            // Restore scroll
            msgsEl.scrollTop = msgsEl.scrollHeight - prevHeight;
            oldestMsgTs = json.data[0].created_at;
            // Restore last group state
            lastDate  = saved.lastDate;
            lastGroup = saved.lastGroup;
        } catch(e) { indicator.remove(); }
        loadingOlder = false;
    };
}

function appendOldMessage(msg, container) {
    const isOwn   = msg.user_id === CURRENT_USER.id;
    const dir     = isOwn ? 'outgoing' : 'incoming';
    const group   = document.createElement('div');
    group.className = `msg-group ${dir}`;
    group.appendChild(makeBubble(msg, isOwn));
    const timeEl = document.createElement('div');
    timeEl.className   = 'msg-time';
    timeEl.textContent = formatTime(msg.created_at);
    group.appendChild(timeEl);
    container.appendChild(group);
}

// ── Message search ────────────────────────────────────────────
function toggleSearchBar() {
    const bar = $('search-bar');
    const isOpen = bar.style.display !== 'none';
    bar.style.display = isOpen ? 'none' : 'flex';
    if (!isOpen) $('search-input-chat').focus();
    else closeSearchBar();
}
function closeSearchBar() {
    $('search-bar').style.display = 'none';
    $('search-results').style.display = 'none';
    $('search-input-chat').value = '';
}
function searchMessages(q) {
    clearTimeout(searchTimer);
    if (q.length < 2) { $('search-results').style.display = 'none'; return; }
    searchTimer = setTimeout(async () => {
        try {
            const res  = await fetch(`api/search_messages.php?q=${encodeURIComponent(q)}&with=${activePeer?.id || ''}`);
            const json = await res.json();
            renderSearchResults(json.data || [], q);
        } catch(e) {}
    }, 300);
}
function renderSearchResults(results, q) {
    const panel = $('search-results');
    if (!results.length) {
        panel.innerHTML = `<div class="sr-empty"><i class="fa-solid fa-search"></i> No messages found for "<strong>${escHtml(q)}</strong>"</div>`;
        panel.style.display = 'block';
        return;
    }
    const hl = text => text.replace(new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>');
    panel.innerHTML = results.map(m => `
        <div class="sr-item" onclick="jumpToMessage('${m.id}')">
            <div class="sr-meta">
                <strong>${escHtml(m.username)}</strong>
                <span>${formatDate(m.created_at)} ${formatTime(m.created_at)}</span>
            </div>
            <div class="sr-text">${hl(escHtml(m.message || '📎 File'))}</div>
        </div>
    `).join('');
    panel.style.display = 'block';
}
function jumpToMessage(id) {
    closeSearchBar();
    const el = document.querySelector(`[data-id="${id}"]`);
    if (el) { el.scrollIntoView({behavior:'smooth',block:'center'}); el.classList.add('highlight'); setTimeout(() => el.classList.remove('highlight'), 2000); }
}

// ── Mark messages as read ─────────────────────────────────────
async function markRead(fromId) {
    try {
        const res  = await fetch('api/mark_read.php', {
            method: 'POST', headers: {'Content-Type':'application/json','X-CSRF-Token':CSRF_TOKEN},
            body: JSON.stringify({ from_id: fromId })
        });
        const json = await res.json();
        // Notify the sender that their messages are now read
        if (json.success) {
            broadcastToUser(fromId, 'read_receipt', { from: CURRENT_USER.id, to: fromId });
        }
    } catch(e) {}
}

// ── Broadcast to another user's channel ──────────────────────
// Pre-subscribed persistent channels — wait for SUBSCRIBED before sending
const _sendChannels = {};
const _sendQueues   = {};
function broadcastToUser(userId, event, payload) {
    if (!_sendChannels[userId]) {
        const ch = supabaseClient.channel('send-to-' + userId, { config: { broadcast: { self: true } } });
        _sendQueues[userId] = [];
        _sendChannels[userId] = ch;
        ch.subscribe(status => {
            if (status === 'SUBSCRIBED') {
                // Flush any queued messages
                (_sendQueues[userId] || []).forEach(q => ch.send(q));
                _sendQueues[userId] = [];
            }
        });
    }
    const msg = { type: 'broadcast', event, payload };
    const ch  = _sendChannels[userId];
    // If not yet subscribed, queue it
    if (ch.state !== 'joined') {
        _sendQueues[userId] = _sendQueues[userId] || [];
        _sendQueues[userId].push(msg);
    } else {
        ch.send(msg);
    }
}

// ── Realtime subscription ─────────────────────────────────────
function subscribeRealtime() {
    if (channel) { supabaseClient.removeChannel(channel); channel = null; }

    channel = supabaseClient
        .channel('chat-' + CURRENT_USER.id)
        // Filter to only messages sent TO me — ensures full payload is delivered
        .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'messages',
            filter: `receiver_id=eq.${CURRENT_USER.id}`,
        }, onNewMessage)
        // Also listen for messages I sent (for multi-tab / multi-device sync)
        .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'messages',
            filter: `user_id=eq.${CURRENT_USER.id}`,
        }, onOwnMessageInsert)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, onUpdateMessage)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' },    onUserUpdate)
        .subscribe(status => {
            if (status === 'SUBSCRIBED') {
                setConnected(true);
                flushOfflineQueue();
                // Always keep polling as a safety net — real-time can miss messages
                startPolling();
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                setConnected(false);
                startPolling();
                setTimeout(subscribeRealtime, 5000);
            }
        });
}

// Own message confirmed by DB (multi-tab sync / confirm temp bubble)
function onOwnMessageInsert(payload) {
    const msg = payload.new;
    if (!msg || !activePeer) return;
    if (msg.receiver_id !== activePeer.id) return;
    // Replace temp bubble if it exists
    const ti = messages.findIndex(m => String(m.id).startsWith('temp_') && m.user_id === CURRENT_USER.id);
    if (ti !== -1) {
        const old = messages[ti].id;
        messages[ti] = msg;
        const el = document.querySelector(`[data-id="${old}"]`);
        if (el) { el.setAttribute('data-id', msg.id); el.classList.remove('pending'); updateStatusTick(el, msg.status || 'sent'); }
    }
}

// ── Broadcast channel (typing + instant message delivery) ─────
function subscribeBroadcast() {
    if (broadcastChannel) { supabaseClient.removeChannel(broadcastChannel); }
    broadcastChannel = supabaseClient
        .channel('broadcast-' + CURRENT_USER.id)
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
            if (!activePeer) return;
            if (payload.from === activePeer.id && payload.to === CURRENT_USER.id) {
                if (payload.typing) showTyping(payload.username);
                else hideTyping();
            }
        })
        .on('broadcast', { event: 'delivered' }, ({ payload }) => {
            // Peer has loaded/received our messages — update single tick → double grey tick
            if (!activePeer || payload.from !== activePeer.id) return;
            document.querySelectorAll('.msg-bubble[data-own="1"] .msg-status').forEach(tick => {
                // Only upgrade from single tick — don't downgrade blue ticks
                if (tick.querySelector('.read')) return;
                tick.innerHTML = '<i class="fa-solid fa-check-double"></i>';
            });
            messages.forEach(m => { if (m.user_id === CURRENT_USER.id && m.status === 'sent') m.status = 'delivered'; });
        })
        .on('broadcast', { event: 'read_receipt' }, ({ payload }) => {
            // Peer has read our messages — update all our sent message ticks to blue
            if (!activePeer || payload.from !== activePeer.id) return;
            document.querySelectorAll('.msg-bubble[data-own="1"] .msg-status').forEach(tick => {
                tick.innerHTML = '<i class="fa-solid fa-check-double read"></i>';
            });
            messages.forEach(m => { if (m.user_id === CURRENT_USER.id) m.status = 'read'; });
        })
        .on('broadcast', { event: 'reaction' }, ({ payload }) => {
            // Peer added/removed a reaction — just render locally (already persisted by them)
            if (activePeer && payload.from === activePeer.id) {
                renderReaction(payload.msgId, payload.emoji, activePeer.username, payload.removed || false);
            }
        })
        .on('broadcast', { event: 'new_message' }, ({ payload }) => {
            // Instant message delivery — sent by the other user directly
            const msg = payload.msg;
            if (!msg) return;
            // Drop messages from blocked users
            if (blockedUsers.has(msg.user_id)) return;
            const forMe      = msg.receiver_id === CURRENT_USER.id;
            const fromActive = activePeer && msg.user_id === activePeer.id;
            if (forMe && fromActive) {
                if (messages.find(m => m.id === msg.id)) return;
                appendMessage(msg, true);
                scrollToBottom(true);
                playSound('receive');
                markRead(msg.user_id);
                lastMsgTs = msg.created_at;
                setPreview(activePeer.id, msg.message || '📎 File');
                updateUserTime(activePeer.id);
            } else if (forMe && !fromActive) {
                addUnread(msg.user_id);
                setPreview(msg.user_id, msg.message || '📎 File');
                updateUserTime(msg.user_id);
                playSound('receive');
                showBrowserNotification(msg.username, msg.message || '📎 Sent a file');
            }
        })
        .subscribe();
}

// ── New message event ─────────────────────────────────────────
function onNewMessage(payload) {
    const msg = payload.new;

    // receiver_id missing = replica identity not set (old Supabase projects)
    // fetchLatest() polling already handles this as a safety net — just return
    if (!msg.receiver_id) return;

    // ── CASE 2: Full payload available ───────────────────────
    const isMine     = msg.user_id     === CURRENT_USER.id;
    const forMe      = msg.receiver_id === CURRENT_USER.id;
    const fromActive = activePeer && msg.user_id     === activePeer.id;
    const toActive   = activePeer && msg.receiver_id === activePeer.id;

    // Message belongs to the currently open conversation
    if (activePeer && ((isMine && toActive) || (forMe && fromActive))) {
        if (messages.find(m => m.id === msg.id)) return;

        // Replace optimistic temp bubble if exists
        const ti = messages.findIndex(m => String(m.id).startsWith('temp_') && m.user_id === msg.user_id);
        if (ti !== -1) {
            const old = messages[ti].id;
            messages[ti] = msg;
            const el = document.querySelector(`[data-id="${old}"]`);
            if (el) { el.setAttribute('data-id', msg.id); el.classList.remove('pending'); updateStatusTick(el, msg.status); }
        } else {
            appendMessage(msg, true);
            scrollToBottom(true);
            if (!isMine) {
                playSound('receive');
                markRead(msg.user_id);
            }
        }
        lastMsgTs = msg.created_at;
        setPreview(activePeer.id, msg.message || '📎 File');
        updateUserTime(activePeer.id);

    // Message is for me but from someone I'm not chatting with right now
    } else if (forMe && !fromActive) {
        addUnread(msg.user_id);
        setPreview(msg.user_id, msg.message || '📎 File');
        updateUserTime(msg.user_id);
        playSound('receive');
        showBrowserNotification(msg.username, msg.message || '📎 Sent a file');

    // Message is from me to someone else (sent from another tab/device)
    } else if (isMine && !toActive) {
        setPreview(msg.receiver_id, msg.message || '📎 File');
        updateUserTime(msg.receiver_id);
    }
}

// Fetch latest previews for all users (used when receiver_id missing)
async function fetchUnreadPreviews() {
    // Re-fetch latest message for active chat
    if (activePeer) fetchLatest();
}

function onUpdateMessage(payload) {
    const msg = payload.new;
    const el  = document.querySelector(`[data-id="${msg.id}"]`);

    // Deleted
    if (msg.deleted_at) {
        if (el) { el.classList.add('deleted'); el.innerHTML = '<i class="fa-solid fa-ban"></i> This message was deleted'; }
        const idx = messages.findIndex(m => m.id === msg.id);
        if (idx !== -1) messages[idx] = msg;
        return;
    }

    // Edited
    if (msg.edited_at && el) {
        const textEl = el.querySelector('.msg-text');
        if (textEl) textEl.textContent = msg.message || '';
        if (!el.querySelector('.edited-mark')) {
            const mark = document.createElement('span');
            mark.className = 'edited-mark'; mark.textContent = 'edited';
            el.appendChild(mark);
        }
    }

    // Status update (sent → delivered → read)
    if (msg.status && el) {
        updateStatusTick(el, msg.status);
        const idx = messages.findIndex(m => m.id === msg.id);
        if (idx !== -1) messages[idx].status = msg.status;
    }
}

function onUserUpdate(payload) {
    const user = payload.new;
    // Update allUsers cache
    const idx = allUsers.findIndex(u => u.id === user.id);
    if (idx !== -1) allUsers[idx] = { ...allUsers[idx], ...user };

    // Update online dot
    const now = new Date();
    const lastSeen = user.last_seen ? new Date(user.last_seen) : null;
    const diffSec  = lastSeen ? (now - lastSeen) / 1000 : Infinity;
    const isOnlineNow = diffSec < 35;
    const dot = $('dot-' + user.id);
    if (dot) dot.style.display = isOnlineNow ? 'block' : 'none';
    if (activePeer && user.id === activePeer.id) {
        peerSubEl.textContent = isOnlineNow ? 'Online' : 'Last seen ' + formatLastSeen(lastSeen);
        peerSubEl.className   = isOnlineNow ? 'chat-header-sub live' : 'chat-header-sub';
    }
}

// ── Read receipt tick ─────────────────────────────────────────
function updateStatusTick(el, status) {
    if (!el) return;
    let tick = el.querySelector('.msg-status');
    if (!tick) {
        // Only add ticks to our own messages
        if (el.getAttribute('data-own') !== '1') return;
        tick = document.createElement('span');
        tick.className = 'msg-status';
        el.appendChild(tick);
    }
    if (status === 'read')      tick.innerHTML = '<i class="fa-solid fa-check-double read"></i>';
    else if (status === 'delivered') tick.innerHTML = '<i class="fa-solid fa-check-double"></i>';
    else                        tick.innerHTML = '<i class="fa-solid fa-check"></i>';
}

// ── Fetch latest (fallback / polling) ────────────────────────
async function fetchLatest() {
    if (!activePeer) return;
    try {
        const res  = await fetch(`api/fetch_messages.php?with=${activePeer.id}&limit=20`);
        const json = await res.json();
        if (!json.success || !json.data.length) return;
        let added = false;
        json.data.forEach(m => {
            // Skip if already present (by real ID — ignore temp IDs)
            if (messages.find(x => x.id === m.id && !String(x.id).startsWith('temp_'))) return;
            // Replace matching temp message from same sender
            const ti = messages.findIndex(x => String(x.id).startsWith('temp_') && x.user_id === m.user_id);
            if (ti !== -1) {
                const old = messages[ti].id;
                messages[ti] = m;
                const el = document.querySelector(`[data-id="${old}"]`);
                if (el) { el.setAttribute('data-id', m.id); el.classList.remove('pending'); updateStatusTick(el, m.status || 'sent'); }
            } else {
                appendMessage(m, true);
                added = true;
            }
            if (!lastMsgTs || m.created_at > lastMsgTs) lastMsgTs = m.created_at;
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

    const tempId = 'temp_' + (crypto.randomUUID ? crypto.randomUUID() : Date.now());
    const tempMsg = {
        id: tempId, user_id: CURRENT_USER.id,
        receiver_id: activePeer.id, username: CURRENT_USER.username,
        message: text, created_at: new Date().toISOString(),
        reply_to: replyTo?.id || null, _pending: true,
        _replyData: replyTo ? { ...replyTo } : null,
        status: 'sent',
    };
    removeEmptyState();
    appendMessage(tempMsg, true);
    scrollToBottom(true);
    setPreview(activePeer.id, text);
    playSound('send');

    const body = { message: text, receiver_id: activePeer.id };
    if (replyTo) body.reply_to = replyTo.id;
    cancelReply();

    // If offline, queue the message
    if (!isOnline) {
        addToOfflineQueue({ tempId, body });
        sendBtn.disabled = false;
        inputEl.focus();
        return;
    }

    try {
        const res  = await fetch('api/send_message.php', {
            method: 'POST', headers: {'Content-Type':'application/json','X-CSRF-Token':CSRF_TOKEN}, body: JSON.stringify(body)
        });
        const json = await res.json();
        if (json.success && json.data) {
            const savedMsg = json.data;
            // Update optimistic bubble
            const idx = messages.findIndex(m => m.id === tempId);
            if (idx !== -1) messages[idx] = savedMsg;
            const el = document.querySelector(`[data-id="${tempId}"]`);
            if (el) { el.setAttribute('data-id', savedMsg.id); el.classList.remove('pending'); updateStatusTick(el, savedMsg.status || 'sent'); }

            // Broadcast directly to receiver's channel for instant delivery
            broadcastToUser(activePeer.id, 'new_message', { msg: savedMsg });
        }
    } catch(e) {
        addToOfflineQueue({ tempId, body });
        const el = document.querySelector(`[data-id="${tempId}"]`);
        if (el) el.classList.add('failed');
    } finally { sendBtn.disabled = false; inputEl.focus(); }
}

// ── File upload ───────────────────────────────────────────────
function handleFileSelect(input) {
    const file = input.files[0];
    if (!file) return;
    selectedFile = file;
    showFilePreview(file);
    input.value = '';
}

function cancelFileUpload() {
    selectedFile = null;
    $('file-preview-modal').style.display = 'none';
    $('file-caption').value = '';
}

async function sendFile() {
    if (!selectedFile || !activePeer) return;
    if (!isOnline) { showToast('No connection — file upload requires internet', ''); return; }
    const caption  = $('file-caption').value.trim();
    const fileToSend = selectedFile; // capture before cancelFileUpload clears it
    cancelFileUpload();

    const formData = new FormData();
    formData.append('file', fileToSend);

    const tempId  = 'temp_' + Date.now();
    const tempMsg = {
        id: tempId, user_id: CURRENT_USER.id, receiver_id: activePeer.id,
        username: CURRENT_USER.username, message: caption || fileToSend.name,
        created_at: new Date().toISOString(), _pending: true, _uploading: true,
        file_name: fileToSend.name, file_type: fileToSend.type, status: 'sent',
    };
    removeEmptyState();
    appendMessage(tempMsg, true);
    scrollToBottom(true);

    try {
        // Upload with XHR for progress tracking
        const upJson = await uploadWithProgress(formData, tempId);
        if (!upJson.success) throw new Error(upJson.error);

        const body = {
            message:     caption || '',
            receiver_id: activePeer.id,
            file_url:    upJson.url,
            file_name:   upJson.name,
            file_type:   upJson.type,
        };
        const res  = await fetch('api/send_message.php', {
            method: 'POST', headers: {'Content-Type':'application/json','X-CSRF-Token':CSRF_TOKEN}, body: JSON.stringify(body)
        });
        const json = await res.json();
        if (json.success && json.data) {
            const savedMsg = json.data;
            const idx = messages.findIndex(m => m.id === tempId);
            if (idx !== -1) messages[idx] = savedMsg;
            const el = document.querySelector(`[data-id="${tempId}"]`);
            if (el) { el.setAttribute('data-id', savedMsg.id); el.classList.remove('pending', 'uploading'); refreshBubble(el, savedMsg); }
            broadcastToUser(activePeer.id, 'new_message', { msg: savedMsg });
        }
        playSound('send');
    } catch(e) {
        console.error('File send error:', e);
        const el = document.querySelector(`[data-id="${tempId}"]`);
        if (el) el.classList.add('failed');
    }
}

// ── Upload with progress ──────────────────────────────────────
function uploadWithProgress(formData, tempId) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'api/upload.php');
        xhr.setRequestHeader('X-CSRF-Token', CSRF_TOKEN);
        xhr.upload.onprogress = e => {
            if (!e.lengthComputable) return;
            const pct = Math.round(e.loaded / e.total * 100);
            const el  = document.querySelector(`[data-id="${tempId}"] .upload-progress`);
            if (el) el.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Uploading ${pct}%`;
        };
        xhr.onload  = () => {
            try { resolve(JSON.parse(xhr.responseText)); }
            catch(e) { reject(new Error('Upload parse error')); }
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(formData);
    });
}

// ── Render message ────────────────────────────────────────────
function appendMessage(msg, animate) {
    // Don't show messages from blocked users (incoming only)
    if (msg.user_id !== CURRENT_USER.id && blockedUsers.has(msg.user_id)) return;
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

    // "New Messages" divider — shown once when first new incoming message arrives
    if (animate && !isOwn && !newMsgDividerAdded && messages.length > 1) {
        newMsgDividerAdded = true;
        const nd = document.createElement('div');
        nd.className = 'new-msg-divider';
        nd.innerHTML = '<span>New Messages</span>';
        msgsEl.appendChild(nd);
    }

    const prev     = messages[messages.length - 2];
    const canGroup = lastGroup && prev && prev.user_id === msg.user_id
        && (new Date(msg.created_at) - new Date(prev.created_at)) < 5 * 60 * 1000;

    if (canGroup) {
        const bubble  = makeBubble(msg, isOwn);
        const timeEl  = lastGroup.querySelector('.msg-time');
        lastGroup.insertBefore(bubble, timeEl);
        if (timeEl) timeEl.textContent = timeStr;
    } else {
        const group = document.createElement('div');
        group.className = `msg-group ${dir}`;
        if (animate) group.style.animation = 'msg-in 0.18s ease';
        group.appendChild(makeBubble(msg, isOwn));
        const timeEl = document.createElement('div');
        timeEl.className   = 'msg-time';
        timeEl.textContent = timeStr;
        group.appendChild(timeEl);
        msgsEl.appendChild(group);
        lastGroup = group;
    }
}

function makeBubble(msg, isOwn) {
    const b = document.createElement('div');
    b.className = 'msg-bubble'
        + (msg._pending   ? ' pending'   : '')
        + (msg._uploading ? ' uploading' : '')
        + (msg.deleted_at ? ' deleted'   : '');
    b.setAttribute('data-id',  msg.id);
    b.setAttribute('data-own', isOwn ? '1' : '0');
    // Hover timestamp tooltip
    if (msg.created_at) {
        const full = new Date(msg.created_at).toLocaleString(undefined, {weekday:'short',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
        b.setAttribute('title', full);
    }

    if (msg.deleted_at) {
        b.innerHTML = '<i class="fa-solid fa-ban"></i> This message was deleted';
        return b;
    }

    let html = '';

    // Reply quote — use _replyData if available, otherwise show placeholder
    if (msg._replyData) {
        const rtext = msg._replyData.message || (msg._replyData.file_type ? '📎 File' : '');
        html += `<div class="reply-quote"><span>${escHtml(msg._replyData.username)}</span><p>${escHtml(rtext)}</p></div>`;
    } else if (msg.reply_to) {
        html += `<div class="reply-quote loading"><i class="fa-solid fa-reply"></i> <em>Loading...</em></div>`;
        // Async fetch the quoted message
        fetchReplyData(msg.reply_to, b);
    }

    // File / image / audio
    if (msg.file_url) {
        if (msg.file_type && msg.file_type.startsWith('image/')) {
            html += `<img class="msg-img" src="${escAttr(msg.file_url)}" alt="image" onclick="openLightbox('${escAttr(msg.file_url)}')">`;
        } else if (msg.file_type && msg.file_type.startsWith('audio/')) {
            html += `<div class="msg-audio"><i class="fa-solid fa-microphone"></i><audio controls src="${escAttr(msg.file_url)}"></audio></div>`;
        } else if (msg.file_type && msg.file_type.startsWith('video/')) {
            html += `<video class="msg-video" controls src="${escAttr(msg.file_url)}"></video>`;
        } else {
            const icon = getFileIcon(msg.file_type || '');
            html += `<a class="msg-file" href="${escAttr(msg.file_url)}" target="_blank" download="${escAttr(msg.file_name||'file')}">
                <i class="fa-solid ${icon}"></i>
                <div><div class="fn">${escHtml(msg.file_name||'File')}</div><div class="fs">${msg.file_size ? formatSize(msg.file_size) : ''}</div></div>
                <i class="fa-solid fa-download"></i>
            </a>`;
        }
    }

    if (msg.message) {
        html += `<span class="msg-text">${linkify(escHtml(msg.message))}</span>${msg.edited_at ? '<span class="edited-mark">edited</span>' : ''}`;
    }
    if (msg._uploading) html += '<span class="upload-progress"><i class="fa-solid fa-spinner fa-spin"></i> Uploading...</span>';

    // Status tick for own messages
    if (isOwn && !msg._uploading) {
        const status = msg.status || 'sent';
        if (status === 'read')           html += '<span class="msg-status"><i class="fa-solid fa-check-double read"></i></span>';
        else if (status === 'delivered') html += '<span class="msg-status"><i class="fa-solid fa-check-double"></i></span>';
        else                             html += '<span class="msg-status"><i class="fa-solid fa-check"></i></span>';
    }

    b.innerHTML = html;

    // Context menu
    b.addEventListener('contextmenu', e => { e.preventDefault(); showCtxMenu(e, msg.id, isOwn); });
    // Long press for mobile
    let pressTimer;
    b.addEventListener('touchstart', e => { pressTimer = setTimeout(() => { e.preventDefault(); showCtxMenu(e.touches[0], msg.id, isOwn); }, 500); });
    b.addEventListener('touchend',   () => clearTimeout(pressTimer));

    // Link preview (lazy, after bubble is in DOM)
    if (msg.message && !msg.file_url) {
        const urls = extractUrls(msg.message);
        if (urls.length) {
            setTimeout(() => fetchLinkPreview(urls[0], b), 50);
        }
    }

    return b;
}

// ── Link detection & preview ──────────────────────────────────
const URL_REGEX = /https?:\/\/[^\s<>"']+/g;

function extractUrls(text) {
    return [...(text.match(URL_REGEX) || [])];
}

function linkify(html) {
    // html is already escaped — find escaped URLs and wrap them
    return html.replace(/https?:\/\/[^\s&<>"]+/g, url => {
        const display = url.length > 50 ? url.slice(0, 47) + '…' : url;
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="msg-link">${display}</a>`;
    });
}

const _previewCache = {};
async function fetchLinkPreview(url, bubbleEl) {
    if (_previewCache[url] === null) return; // known failure
    try {
        let data = _previewCache[url];
        if (!data) {
            const res = await fetch('api/link_preview.php?url=' + encodeURIComponent(url));
            data = await res.json();
            _previewCache[url] = data.success ? data : null;
        }
        if (!data || !data.success || !data.title) return;
        if (!bubbleEl.isConnected) return; // bubble was removed
        const card = document.createElement('a');
        card.className = 'link-preview-card';
        card.href = data.url || url;
        card.target = '_blank';
        card.rel = 'noopener noreferrer';
        card.innerHTML = (data.image ? `<img src="${escAttr(data.image)}" alt="" onerror="this.remove()">` : '')
            + `<div class="lp-text">
                <div class="lp-site">${escHtml(data.site_name || '')}</div>
                <div class="lp-title">${escHtml(data.title)}</div>
                ${data.description ? `<div class="lp-desc">${escHtml(data.description)}</div>` : ''}
               </div>`;
        bubbleEl.appendChild(card);
    } catch(e) { _previewCache[url] = null; }
}

async function fetchReplyData(replyId, bubbleEl) {
    try {
        const res  = await fetch(`api/reply_data.php?id=${encodeURIComponent(replyId)}`);
        const json = await res.json();
        if (!json.success || !json.data) return;
        const rd = json.data;
        const quoteEl = bubbleEl.querySelector('.reply-quote');
        if (quoteEl) {
            const rtext = rd.message || (rd.file_type ? '📎 File' : '—');
            quoteEl.className = 'reply-quote';
            quoteEl.innerHTML = `<span>${escHtml(rd.username)}</span><p>${escHtml(rtext)}</p>`;
        }
    } catch(e) {}
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
    const x = e.clientX ?? e.pageX ?? 0;
    const y = e.clientY ?? e.pageY ?? 0;
    ctxMenu.style.left = Math.min(x, window.innerWidth  - 170) + 'px';
    ctxMenu.style.top  = Math.min(y, window.innerHeight - 150) + 'px';
    // Show/hide options based on ownership
    ctxMenu.querySelector('.danger').style.display    = isOwn ? 'flex' : 'none';
    ctxMenu.querySelector('.edit-only').style.display = isOwn ? 'flex' : 'none';
    // Show copy only for text messages
    const copyItem = ctxMenu.querySelector('.copy-only');
    if (copyItem) {
        const msg = messages.find(m => m.id === ctxMsgId);
        copyItem.style.display = msg?.message ? 'flex' : 'none';
    }
    // Block label
    const blockLabel = $('ctx-block-label');
    if (blockLabel && activePeer) {
        blockLabel.textContent = blockedUsers.has(activePeer.id) ? 'Unblock User' : 'Block User';
    }
}

function ctxReply() {
    const msg = messages.find(m => m.id === ctxMsgId);
    if (!msg) return;
    replyTo = msg;
    $('reply-username').textContent = msg.username;
    $('reply-text').textContent     = msg.message || '📎 File';
    replyBar.style.display = 'flex';
    inputEl.focus();
    ctxMenu.style.display = 'none';
}

function ctxCopy() {
    const msg = messages.find(m => m.id === ctxMsgId);
    if (!msg || !msg.message) return;
    ctxMenu.style.display = 'none';
    navigator.clipboard.writeText(msg.message).then(() => showToast('Copied', '')).catch(() => {
        // Fallback for older browsers
        const ta = document.createElement('textarea');
        ta.value = msg.message; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        showToast('Copied', '');
    });
}

function ctxForward() {
    const msg = messages.find(m => m.id === ctxMsgId);
    if (!msg) return;
    ctxMenu.style.display = 'none';
    showForwardModal(msg);
}

function cancelReply() { replyTo = null; replyBar.style.display = 'none'; }

// ── Edit message ──────────────────────────────────────────────
function ctxEdit() {
    const msg = messages.find(m => m.id === ctxMsgId);
    if (!msg || !msg.message) return;
    ctxMenu.style.display = 'none';
    const newText = prompt('Edit message:', msg.message);
    if (!newText || newText.trim() === msg.message) return;
    fetch('api/edit_message.php', {
        method: 'POST', headers: {'Content-Type':'application/json','X-CSRF-Token':CSRF_TOKEN},
        body: JSON.stringify({ message_id: ctxMsgId, message: newText.trim() })
    }).then(r => r.json()).then(json => {
        if (json.success) {
            const el = document.querySelector(`[data-id="${ctxMsgId}"] .msg-text`);
            if (el) { el.textContent = newText.trim(); }
            const idx = messages.findIndex(m => m.id === ctxMsgId);
            if (idx !== -1) { messages[idx].message = newText.trim(); messages[idx].edited_at = new Date().toISOString(); }
            // Add edited marker
            const bubble = document.querySelector(`[data-id="${ctxMsgId}"]`);
            if (bubble && !bubble.querySelector('.edited-mark')) {
                const mark = document.createElement('span');
                mark.className = 'edited-mark';
                mark.textContent = 'edited';
                bubble.appendChild(mark);
            }
        } else { showToast(json.error || 'Cannot edit', ''); }
    }).catch(() => showToast('Failed to edit', ''));
}

// ── Block / unblock user ──────────────────────────────────────
async function loadBlockedUsers() {
    try {
        const res  = await fetch('api/block_user.php?action=list');
        const json = await res.json();
        if (json.success) blockedUsers = new Set(json.data || []);
    } catch(e) {}
}

function ctxBlock() {
    if (!activePeer) return;
    ctxMenu.style.display = 'none';
    const isBlocked = blockedUsers.has(activePeer.id);
    if (!confirm(isBlocked ? `Unblock ${activePeer.username}?` : `Block ${activePeer.username}? You won't receive their messages.`)) return;
    const action = isBlocked ? 'unblock' : 'block';
    fetch('api/block_user.php', {
        method: 'POST', headers: {'Content-Type':'application/json','X-CSRF-Token':CSRF_TOKEN},
        body: JSON.stringify({ action, target_id: activePeer.id })
    }).then(r => r.json()).then(json => {
        if (json.success) {
            if (action === 'block') { blockedUsers.add(activePeer.id); showToast(`Blocked ${activePeer.username}`, ''); }
            else { blockedUsers.delete(activePeer.id); showToast(`Unblocked ${activePeer.username}`, 'connected'); }
        }
    });
}

async function ctxDelete() {
    if (!ctxMsgId) return;
    if (!confirm('Delete this message?')) return;
    ctxMenu.style.display = 'none';
    try {
        await fetch('api/delete_message.php', {
            method: 'POST', headers: {'Content-Type':'application/json','X-CSRF-Token':CSRF_TOKEN},
            body: JSON.stringify({ message_id: ctxMsgId })
        });
        const el = document.querySelector(`[data-id="${ctxMsgId}"]`);
        if (el) { el.classList.add('deleted'); el.innerHTML = '<i class="fa-solid fa-ban"></i> This message was deleted'; }
    } catch(e) {}
}

// ── Clear all chat ────────────────────────────────────────────
async function clearChat() {
    if (!activePeer) return;
    if (!confirm(`Clear all messages with ${activePeer.username}? This clears the chat for both of you.`)) return;
    try {
        const res  = await fetch('api/clear_chat.php', {
            method: 'POST', headers: {'Content-Type':'application/json','X-CSRF-Token':CSRF_TOKEN},
            body: JSON.stringify({ peer_id: activePeer.id })
        });
        const json = await res.json();
        if (json.success) {
            messages = [];
            msgsEl.innerHTML = `<div class="empty-state"><i class="fa-regular fa-comment-dots"></i><p>Chat cleared.</p></div>`;
            setPreview(activePeer.id, 'Chat cleared');
            showToast('Chat cleared', '');
        } else {
            showToast(json.error || 'Failed to clear chat', '');
        }
    } catch(e) { showToast('Failed to clear chat', ''); }
}

// ── Voice message recording ───────────────────────────────────
async function startVoiceRecord() {
    if (isRecording) { stopVoiceRecord(); return; }
    if (!activePeer) return;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks   = [];
        isRecording   = true;
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = async () => {
            stream.getTracks().forEach(t => t.stop());
            const blob     = new Blob(audioChunks, { type: 'audio/webm' });
            const formData = new FormData();
            formData.append('file', blob, 'voice_' + Date.now() + '.webm');
            const tempId  = 'temp_' + (crypto.randomUUID ? crypto.randomUUID() : Date.now());
            const tempMsg = {
                id: tempId, user_id: CURRENT_USER.id, receiver_id: activePeer.id,
                username: CURRENT_USER.username, message: '🎤 Voice message',
                created_at: new Date().toISOString(), _pending: true, _uploading: true,
                file_type: 'audio/webm', file_name: 'Voice message', status: 'sent',
            };
            removeEmptyState();
            appendMessage(tempMsg, true);
            scrollToBottom(true);
            try {
                const upJson = await uploadWithProgress(formData, tempId);
                if (!upJson.success) throw new Error(upJson.error);
                const body = { message: '', receiver_id: activePeer.id, file_url: upJson.url, file_name: 'Voice message', file_type: 'audio/webm' };
                const res  = await fetch('api/send_message.php', { method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':CSRF_TOKEN}, body: JSON.stringify(body) });
                const json = await res.json();
                if (json.success && json.data) {
                    const idx = messages.findIndex(m => m.id === tempId);
                    if (idx !== -1) messages[idx] = json.data;
                    const el = document.querySelector(`[data-id="${tempId}"]`);
                    if (el) { el.setAttribute('data-id', json.data.id); el.classList.remove('pending','uploading'); refreshBubble(el, json.data); }
                }
                playSound('send');
            } catch(e) {
                const el = document.querySelector(`[data-id="${tempId}"]`);
                if (el) el.classList.add('failed');
            }
        };
        mediaRecorder.start();
        const btn = $('btn-voice');
        if (btn) { btn.classList.add('recording'); btn.title = 'Stop recording'; }
        showToast('Recording... tap again to send', '');
    } catch(e) {
        showToast('Cannot access microphone', '');
    }
}
function stopVoiceRecord() {
    if (!mediaRecorder || !isRecording) return;
    isRecording = false;
    mediaRecorder.stop();
    const btn = $('btn-voice');
    if (btn) { btn.classList.remove('recording'); btn.title = 'Voice message'; }
}

// ── Typing indicator ──────────────────────────────────────────
let isTypingNow = false;
function handleTyping() {
    if (!activePeer || !broadcastChannel) return;
    if (!isTypingNow) {
        isTypingNow = true;
        broadcastChannel.send({
            type: 'broadcast', event: 'typing',
            payload: { from: CURRENT_USER.id, to: activePeer.id, username: CURRENT_USER.username, typing: true }
        });
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        isTypingNow = false;
        if (broadcastChannel && activePeer) {
            broadcastChannel.send({
                type: 'broadcast', event: 'typing',
                payload: { from: CURRENT_USER.id, to: activePeer.id, username: CURRENT_USER.username, typing: false }
            });
        }
        fetch(`api/typing.php?to=${activePeer.id}&typing=0`);
    }, 2000);
}

function showTyping(username) {
    $('typing-label').textContent = `${username} is typing...`;
    typingBar.style.display = 'flex';
    clearTimeout(typingTimer);
    typingTimer = setTimeout(hideTyping, 3500);
}
function hideTyping() { typingBar.style.display = 'none'; }

// ── Last seen heartbeat ───────────────────────────────────────
function updateLastSeen() {
    fetch('api/typing.php?to=0&typing=0');
    refreshOnlineStatus();
}

// ── Unread + tab badge ────────────────────────────────────────
function addUnread(uid) {
    unreadCounts[uid] = (unreadCounts[uid] || 0) + 1;
    saveUnreadCounts();
    const b = $('badge-' + uid);
    if (b) { b.textContent = unreadCounts[uid]; b.style.display = 'inline-flex'; }
    // Bump user to top
    const item = $('ui-' + uid);
    if (item) usersList.prepend(item);
    // Update tab title
    totalUnread = Object.values(unreadCounts).reduce((s, v) => s + v, 0);
    updateTabTitle();
}

function clearUnread(uid) {
    unreadCounts[uid] = 0;
    saveUnreadCounts();
    const b = $('badge-' + uid);
    if (b) b.style.display = 'none';
    totalUnread = Object.values(unreadCounts).reduce((s, v) => s + v, 0);
    updateTabTitle();
}

function updateTabTitle() {
    const base = document.title.replace(/^\(\d+\) /, '');
    document.title = totalUnread > 0 ? `(${totalUnread}) ${base}` : base;
}

function setPreview(uid, text) {
    const el = $('prev-' + uid);
    if (el) el.textContent = text.length > 35 ? text.slice(0,35) + '…' : text;
}

function updateUserTime(uid) {
    const el = $('time-' + uid);
    if (el) el.textContent = formatTime(new Date().toISOString());
}

// ── Polling (always-on safety net — catches missed realtime events) ───
function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => { if (activePeer) fetchLatest(); }, 2500);
}
function stopPolling() { /* keep polling always running — do not stop */ }

// ── Connection ────────────────────────────────────────────────
function setConnected(ok) {
    showToast(ok ? 'Connected' : 'Reconnecting...', ok ? 'connected' : '');
}

let toastT;
function showToast(msg, type) {
    const t = $('toast-bar');
    t.className = 'show ' + (type||'');
    $('toast-msg').textContent = msg;
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.className=''; }, 2500);
}

// ── Sounds (Web Audio API — no files needed) ──────────────────
let _audioCtx = null;
function getAudioCtx() {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return _audioCtx;
}
function playTone(freq, duration, type = 'sine', gain = 0.15) {
    try {
        const ctx = getAudioCtx();
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.type = type; osc.frequency.value = freq;
        g.gain.setValueAtTime(gain, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
    } catch(e) {}
}
function playSound(name) {
    if (localStorage.getItem('chat_sound') === '0') return;
    if (name === 'send') {
        playTone(880, 0.08, 'sine', 0.12);
    } else {
        // Two-tone receive beep
        playTone(660, 0.1, 'sine', 0.15);
        setTimeout(() => playTone(880, 0.1, 'sine', 0.15), 120);
    }
}

// ── Lightbox ──────────────────────────────────────────────────
function openLightbox(url) { $('lb-img').src = url; $('lightbox').style.display = 'flex'; }
function closeLightbox()   { $('lightbox').style.display = 'none'; }

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
function formatSize(b)   { return b>1048576?(b/1048576).toFixed(1)+' MB':(b/1024).toFixed(0)+' KB'; }
function escHtml(s)      { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s)      { return String(s).replace(/"/g,'&quot;'); }

function getFileIcon(type) {
    if (type.includes('pdf'))   return 'fa-file-pdf';
    if (type.includes('word'))  return 'fa-file-word';
    if (type.includes('zip'))   return 'fa-file-zipper';
    if (type.includes('text'))  return 'fa-file-lines';
    if (type.includes('video')) return 'fa-file-video';
    return 'fa-file';
}

// ── Emoji ─────────────────────────────────────────────────────
function toggleEmoji()  { emojiOpen=!emojiOpen; $('emoji-bar').classList.toggle('show',emojiOpen); }
function closeEmoji()   { emojiOpen=false; $('emoji-bar').classList.remove('show'); }
function insertEmoji(e) {
    const s=inputEl.selectionStart, end=inputEl.selectionEnd;
    inputEl.value=inputEl.value.slice(0,s)+e+inputEl.value.slice(end);
    inputEl.setSelectionRange(s+e.length,s+e.length);
    inputEl.focus();
}

// ── Input ─────────────────────────────────────────────────────
function handleKey(e) {
    const enterSends = localStorage.getItem('chat_enter_send') !== '0';
    if (e.key === 'Enter' && !e.shiftKey && enterSends) { e.preventDefault(); sendMessage(); }
}
function autoResize(el) { el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,120)+'px'; }

// ── Emoji reactions ───────────────────────────────────────────
const REACTIONS = ['👍','❤️','😂','😮','😢','🙏'];

function ctxReact() {
    ctxMenu.style.display = 'none';
    const bubble = document.querySelector(`[data-id="${ctxMsgId}"]`);
    if (!bubble) return;
    document.querySelectorAll('.reaction-picker').forEach(p => p.remove());
    const picker = document.createElement('div');
    picker.className = 'reaction-picker';
    REACTIONS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.textContent = emoji;
        btn.onclick = () => { addReaction(ctxMsgId, emoji); picker.remove(); };
        picker.appendChild(btn);
    });
    // Position near the bubble
    const rect = bubble.getBoundingClientRect();
    picker.style.cssText = `position:fixed;top:${rect.top - 50}px;left:${Math.max(8, rect.left)}px`;
    document.body.appendChild(picker);
    setTimeout(() => document.addEventListener('click', () => picker.remove(), { once: true }), 50);
}

async function addReaction(msgId, emoji) {
    // Persist to DB (toggle)
    try {
        const res  = await fetch('api/reactions.php', {
            method: 'POST', headers: {'Content-Type':'application/json','X-CSRF-Token':CSRF_TOKEN},
            body: JSON.stringify({ message_id: msgId, emoji })
        });
        const json = await res.json();
        if (!json.success) return;
        const removed = json.action === 'removed';
        renderReaction(msgId, emoji, CURRENT_USER.username, removed);
        // Broadcast to peer
        if (activePeer) {
            broadcastToUser(activePeer.id, 'reaction', { msgId, emoji, from: CURRENT_USER.id, removed });
        }
    } catch(e) {}
}

function renderReaction(msgId, emoji, username, removed) {
    const bubble = document.querySelector(`[data-id="${msgId}"]`);
    if (!bubble) return;
    let bar = bubble.querySelector('.reaction-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.className = 'reaction-bar';
        bubble.appendChild(bar);
    }
    const existing = bar.querySelector(`[data-emoji="${CSS.escape(emoji)}"]`);
    if (removed) {
        if (existing) {
            const cnt = parseInt(existing.dataset.count || '1') - 1;
            if (cnt <= 0) existing.remove();
            else { existing.dataset.count = cnt; existing.querySelector('.r-count').textContent = cnt > 1 ? cnt : ''; }
        }
        if (!bar.children.length) bar.remove();
    } else {
        if (existing) {
            const cnt = parseInt(existing.dataset.count || '1') + 1;
            existing.dataset.count = cnt;
            existing.querySelector('.r-count').textContent = cnt > 1 ? cnt : '';
            existing.title = (existing.title ? existing.title + ', ' : '') + username;
        } else {
            const btn = document.createElement('button');
            btn.className = 'reaction-chip';
            btn.dataset.emoji = emoji;
            btn.dataset.count = '1';
            btn.innerHTML = `${emoji}<span class="r-count"></span>`;
            btn.title = username;
            btn.onclick = () => addReaction(msgId, emoji);
            bar.appendChild(btn);
        }
    }
}

async function loadReactions(messageIds) {
    if (!messageIds.length) return;
    try {
        const res  = await fetch(`api/reactions.php?ids=${encodeURIComponent(messageIds.join(','))}`);
        const json = await res.json();
        if (!json.success) return;
        // Group by message_id
        const grouped = {};
        (json.data || []).forEach(r => {
            if (!grouped[r.message_id]) grouped[r.message_id] = {};
            if (!grouped[r.message_id][r.emoji]) grouped[r.message_id][r.emoji] = { count: 0, users: [] };
            grouped[r.message_id][r.emoji].count++;
            grouped[r.message_id][r.emoji].users.push(r.username);
        });
        Object.entries(grouped).forEach(([msgId, emojis]) => {
            Object.entries(emojis).forEach(([emoji, { count, users }]) => {
                const bubble = document.querySelector(`[data-id="${msgId}"]`);
                if (!bubble) return;
                let bar = bubble.querySelector('.reaction-bar');
                if (!bar) { bar = document.createElement('div'); bar.className = 'reaction-bar'; bubble.appendChild(bar); }
                const btn = document.createElement('button');
                btn.className = 'reaction-chip';
                btn.dataset.emoji = emoji;
                btn.dataset.count = count;
                btn.innerHTML = `${emoji}<span class="r-count">${count > 1 ? count : ''}</span>`;
                btn.title = users.join(', ');
                btn.onclick = () => addReaction(msgId, emoji);
                bar.appendChild(btn);
            });
        });
    } catch(e) {}
}

// Handle incoming reactions from peer
// (wired up in subscribeBroadcast)

// ── Sidebar ───────────────────────────────────────────────────
function toggleSidebar() { $('sidebar').classList.toggle('open'); $('sidebar-overlay').classList.toggle('show'); }
function closeSidebar()  { $('sidebar').classList.remove('open'); $('sidebar-overlay').classList.remove('show'); }

// ── Sidebar tabs (Chats / Calls) ──────────────────────────────
function switchTab(tab) {
    $('tab-chats').classList.toggle('active', tab === 'chats');
    $('tab-calls').classList.toggle('active', tab === 'calls');
    $('users-list').style.display   = tab === 'chats' ? '' : 'none';
    $('calls-list').style.display   = tab === 'calls' ? '' : 'none';
    $('chats-search').style.display = tab === 'chats' ? '' : 'none';
    if (tab === 'calls') loadCallHistory();
}

async function loadCallHistory() {
    const list = $('calls-list');
    list.innerHTML = '<div class="sidebar-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';
    try {
        const res  = await fetch('api/call_history.php?limit=30');
        const json = await res.json();
        if (!json.success || !json.data.length) {
            list.innerHTML = '<div class="no-users"><i class="fa-solid fa-phone-slash"></i><p>No call history</p></div>';
            return;
        }
        list.innerHTML = json.data.map(call => {
            const isOutgoing = call.caller_id === CURRENT_USER.id;
            const peerId     = isOutgoing ? call.receiver_id : call.caller_id;
            const peer       = allUsers.find(u => u.id === peerId);
            const peerName   = peer ? peer.username : 'Unknown';
            const peerColor  = peer ? peer.avatar_color : '#6366f1';
            const icon       = call.type === 'video' ? 'fa-video' : 'fa-phone';
            const statusIcon = call.status === 'declined' ? 'fa-phone-slash' :
                               call.status === 'ended'    ? (isOutgoing ? 'fa-arrow-up-right' : 'fa-arrow-down-left') :
                               'fa-phone-missed';
            const statusColor = call.status === 'declined' ? 'var(--red)' :
                                call.status === 'ended'    ? 'var(--green)' : 'var(--red)';
            const timeStr = formatDate(call.created_at) + ' ' + formatTime(call.created_at);
            return `<div class="call-history-item" onclick="peer && openChat('${peerId}','${escAttr(peerName)}','${peerColor}')">
                <div class="user-av" style="background:${peerColor};width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#fff;flex-shrink:0">${peerName[0].toUpperCase()}</div>
                <div class="call-hist-info">
                    <div class="call-hist-name">${escHtml(peerName)}</div>
                    <div class="call-hist-meta" style="color:${statusColor}">
                        <i class="fa-solid ${statusIcon}"></i>
                        ${call.type === 'video' ? 'Video' : 'Voice'} · ${isOutgoing ? 'Outgoing' : 'Incoming'}
                    </div>
                </div>
                <div class="call-hist-time">${formatTime(call.created_at)}</div>
            </div>`;
        }).join('');
    } catch(e) {
        list.innerHTML = '<div class="no-users"><i class="fa-solid fa-circle-exclamation"></i><p>Failed to load</p></div>';
    }
}
