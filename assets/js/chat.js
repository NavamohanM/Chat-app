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

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadOfflineQueue();
    loadUnreadCounts();
    loadBlockedUsers();
    loadUsers();
    subscribeRealtime();
    subscribeBroadcast();
    setInterval(updateLastSeen, 30000);
    document.addEventListener('click', e => {
        if (!ctxMenu.contains(e.target)) ctxMenu.style.display = 'none';
        if (!$('emoji-bar').contains(e.target) && !e.target.closest('.btn-emoji')) closeEmoji();
    });

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
    peerSubEl.textContent       = 'Online';
    peerSubEl.className         = 'chat-header-sub live';

    welcomeScreen.style.display = 'none';
    chatView.style.display      = 'flex';

    messages  = []; lastDate = null; lastGroup = null; lastMsgTs = null;
    oldestMsgTs = null; hasMoreMsgs = true;
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
        await fetch('api/mark_read.php', {
            method: 'POST', headers: {'Content-Type':'application/json','X-CSRF-Token':CSRF_TOKEN},
            body: JSON.stringify({ from_id: fromId })
        });
        // Update status icons for messages we sent (now marked read on their side)
        // The realtime UPDATE event will handle the other user's UI
    } catch(e) {}
}

// ── Realtime subscription ─────────────────────────────────────
function subscribeRealtime() {
    if (channel) { supabaseClient.removeChannel(channel); channel = null; }

    channel = supabaseClient
        .channel('chat-' + CURRENT_USER.id)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, onNewMessage)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, onUpdateMessage)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' },    onUserUpdate)
        .subscribe(status => {
            console.log('Realtime:', status);
            if (status === 'SUBSCRIBED') { setConnected(true); stopPolling(); flushOfflineQueue(); }
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                setConnected(false); startPolling();
                setTimeout(subscribeRealtime, 5000);
            }
        });
}

// ── Broadcast channel for typing indicators ───────────────────
function subscribeBroadcast() {
    if (broadcastChannel) { supabaseClient.removeChannel(broadcastChannel); }
    broadcastChannel = supabaseClient
        .channel('typing-broadcast')
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
            if (!activePeer) return;
            if (payload.from === activePeer.id && payload.to === CURRENT_USER.id) {
                if (payload.typing) showTyping(payload.username);
                else hideTyping();
            }
        })
        .subscribe();
}

// ── New message event ─────────────────────────────────────────
function onNewMessage(payload) {
    const msg = payload.new;

    const isMine     = msg.user_id     === CURRENT_USER.id;
    const forMe      = msg.receiver_id === CURRENT_USER.id;
    const fromActive = activePeer && msg.user_id     === activePeer.id;
    const toActive   = activePeer && msg.receiver_id === activePeer.id;

    // Fallback: receiver_id missing from payload (REPLICA IDENTITY not full)
    if (!msg.receiver_id) {
        if (activePeer && fromActive) fetchLatest();
        return;
    }

    if (activePeer && ((isMine && toActive) || (forMe && fromActive))) {
        if (messages.find(m => m.id === msg.id)) return;
        // Replace optimistic temp bubble
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
    } else if (forMe && !fromActive) {
        addUnread(msg.user_id);
        setPreview(msg.user_id, msg.message || '📎 File');
        updateUserTime(msg.user_id);
        playSound('receive');
    }
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
                if (el) { el.setAttribute('data-id', m.id); el.classList.remove('pending'); updateStatusTick(el, m.status); }
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
            const idx = messages.findIndex(m => m.id === tempId);
            if (idx !== -1) messages[idx] = json.data;
            const el = document.querySelector(`[data-id="${tempId}"]`);
            if (el) { el.setAttribute('data-id', json.data.id); el.classList.remove('pending'); updateStatusTick(el, json.data.status || 'sent'); }
        }
    } catch(e) {
        // Network error — add to offline queue
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
    const caption = $('file-caption').value.trim();
    cancelFileUpload();

    const formData = new FormData();
    formData.append('file', selectedFile);

    const tempId  = 'temp_' + Date.now();
    const tempMsg = {
        id: tempId, user_id: CURRENT_USER.id, receiver_id: activePeer.id,
        username: CURRENT_USER.username, message: caption || selectedFile.name,
        created_at: new Date().toISOString(), _pending: true, _uploading: true,
        file_name: selectedFile.name, file_type: selectedFile.type, status: 'sent',
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
            const idx = messages.findIndex(m => m.id === tempId);
            if (idx !== -1) messages[idx] = json.data;
            const el = document.querySelector(`[data-id="${tempId}"]`);
            if (el) { el.setAttribute('data-id', json.data.id); el.classList.remove('pending', 'uploading'); refreshBubble(el, json.data); }
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

    if (msg.message) html += `<span class="msg-text">${escHtml(msg.message)}</span>${msg.edited_at ? '<span class="edited-mark">edited</span>' : ''}`;
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

    return b;
}

async function fetchReplyData(replyId, bubbleEl) {
    try {
        const res  = await fetch(`api/fetch_messages.php?reply_id=${replyId}`);
        // fallback: try direct lookup
        // Actually use a dedicated approach via users API – simpler: store _replyData in msg
        // For now skip if data not available
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
    ctxMenu.style.top  = Math.min(y, window.innerHeight - 130) + 'px';
    // Show/hide options based on ownership
    ctxMenu.querySelector('.danger').style.display    = isOwn ? 'flex' : 'none';
    ctxMenu.querySelector('.edit-only').style.display = isOwn ? 'flex' : 'none';
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
    if (!confirm(`Clear all messages with ${activePeer.username}?`)) return;
    const mine = messages.filter(m => m.user_id === CURRENT_USER.id);
    await Promise.all(mine.map(m =>
        fetch('api/delete_message.php', {
            method: 'POST', headers: {'Content-Type':'application/json','X-CSRF-Token':CSRF_TOKEN},
            body: JSON.stringify({ message_id: m.id })
        })
    ));
    await loadMessages();
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

// ── Unread ────────────────────────────────────────────────────
function addUnread(uid) {
    unreadCounts[uid] = (unreadCounts[uid] || 0) + 1;
    saveUnreadCounts();
    const b = $('badge-' + uid);
    if (b) { b.textContent = unreadCounts[uid]; b.style.display = 'inline-flex'; }
    // Bump user to top
    const item = $('ui-' + uid);
    if (item) usersList.prepend(item);
}

function clearUnread(uid) {
    unreadCounts[uid] = 0;
    saveUnreadCounts();
    const b = $('badge-' + uid);
    if (b) b.style.display = 'none';
}

function setPreview(uid, text) {
    const el = $('prev-' + uid);
    if (el) el.textContent = text.length > 35 ? text.slice(0,35) + '…' : text;
}

function updateUserTime(uid) {
    const el = $('time-' + uid);
    if (el) el.textContent = formatTime(new Date().toISOString());
}

// ── Polling fallback ──────────────────────────────────────────
function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => { if (activePeer && lastMsgTs) fetchLatest(); }, 2500);
}
function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

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

// ── Sounds ────────────────────────────────────────────────────
function playSound(name) {
    try { const a = $(name==='send'?'snd-send':'snd-receive'); if(a){a.currentTime=0;a.play().catch(()=>{});} } catch(e){}
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
function handleKey(e) { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();} }
function autoResize(el) { el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,120)+'px'; }

// ── Sidebar ───────────────────────────────────────────────────
function toggleSidebar() { $('sidebar').classList.toggle('open'); $('sidebar-overlay').classList.toggle('show'); }
function closeSidebar()  { $('sidebar').classList.remove('open'); $('sidebar-overlay').classList.remove('show'); }
