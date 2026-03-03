/* ============================================================
   ChatApp — WebRTC Voice & Video Calls
   ============================================================ */

let peerConn    = null;
let localStream = null;
let callId      = null;
let callType    = null;
let callTimer   = null;
let callSeconds = 0;
let isMuted     = false;
let isCamOff    = false;
let incomingCallData = null;

const ICE_SERVERS = { iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
]};

// ── Listen for incoming calls via Supabase realtime ───────────
let callChannel = null;
document.addEventListener('DOMContentLoaded', () => {
    subscribeCallChannel();
});

function subscribeCallChannel() {
    if (callChannel) { supabaseClient.removeChannel(callChannel); }
    callChannel = supabaseClient
        .channel('calls-' + CURRENT_USER.id)
        .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'calls',
            filter: `receiver_id=eq.${CURRENT_USER.id}`,
        }, payload => {
            const call = payload.new;
            if (call.status === 'ringing') showIncomingCall(call);
        })
        .on('postgres_changes', {
            event: 'UPDATE', schema: 'public', table: 'calls',
        }, payload => {
            const call = payload.new;
            if (call.id !== callId) return;
            if (call.status === 'active' && peerConn && call.answer) {
                handleAnswer(call.answer);
            }
            if (call.status === 'ended' || call.status === 'declined') {
                hangupLocal();
            }
        })
        .subscribe();
}

// ── Start a call ──────────────────────────────────────────────
async function startCall(type) {
    if (!activePeer) return;
    if (peerConn) { showToast('Already in a call', ''); return; }

    callType = type;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: type === 'video',
        });
    } catch(e) {
        showToast('Cannot access microphone/camera', '');
        return;
    }

    peerConn = new RTCPeerConnection(ICE_SERVERS);
    localStream.getTracks().forEach(t => peerConn.addTrack(t, localStream));

    peerConn.ontrack = e => {
        const rv = document.getElementById('remote-video');
        if (rv) rv.srcObject = e.streams[0];
    };

    peerConn.onicecandidate = e => {
        if (e.candidate && callId) {
            fetch('api/call.php', { method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ action:'ice', call_id:callId, candidate:e.candidate }) });
        }
    };

    const offer = await peerConn.createOffer();
    await peerConn.setLocalDescription(offer);

    // Save offer to DB and create call record
    const res  = await fetch('api/call.php', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'initiate', receiver_id:activePeer.id, type, offer:JSON.stringify({sdp:offer}) }) });
    const json = await res.json();
    if (!json.success) { showToast('Failed to start call',''); hangupLocal(); return; }

    callId = json.data.id;
    showActiveCall(activePeer.username, type);

    // Show local video
    if (type === 'video') {
        const lv = document.getElementById('local-video');
        if (lv) lv.srcObject = localStream;
        document.getElementById('video-container').style.display = 'flex';
        document.getElementById('btn-cam').style.display = 'inline-flex';
    }

    playRinging();
}

// ── Incoming call ─────────────────────────────────────────────
function showIncomingCall(call) {
    incomingCallData = call;
    const peerUser = allUsers.find(u => u.id === call.caller_id);
    const name     = peerUser ? peerUser.username : 'Unknown';
    const color    = peerUser ? peerUser.avatar_color : '#6366f1';

    document.getElementById('call-peer-name').textContent  = name;
    document.getElementById('call-type-label').textContent = call.type === 'video' ? '📹 Video Call' : '📞 Voice Call';
    document.getElementById('call-peer-avatar').textContent = name[0].toUpperCase();
    document.getElementById('call-peer-avatar').style.background = color;
    document.getElementById('call-incoming').style.display = 'flex';
    playRinging();
}

async function acceptCall() {
    if (!incomingCallData) return;
    stopRinging();
    document.getElementById('call-incoming').style.display = 'none';

    const call = incomingCallData;
    callId   = call.id;
    callType = call.type;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true, video: call.type === 'video',
        });
    } catch(e) { showToast('Cannot access microphone/camera',''); return; }

    peerConn = new RTCPeerConnection(ICE_SERVERS);
    localStream.getTracks().forEach(t => peerConn.addTrack(t, localStream));

    peerConn.ontrack = e => {
        const rv = document.getElementById('remote-video');
        if (rv) rv.srcObject = e.streams[0];
    };

    peerConn.onicecandidate = e => {
        if (e.candidate && callId) {
            fetch('api/call.php', { method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ action:'ice', call_id:callId, candidate:e.candidate }) });
        }
    };

    // Set remote offer
    const offerData = JSON.parse(call.offer || '{}');
    await peerConn.setRemoteDescription(new RTCSessionDescription(offerData.sdp || offerData));

    const answer = await peerConn.createAnswer();
    await peerConn.setLocalDescription(answer);

    await fetch('api/call.php', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'answer', call_id:callId, answer:JSON.stringify({sdp:answer}) }) });

    const peerUser = allUsers.find(u => u.id === call.caller_id);
    showActiveCall(peerUser?.username || 'Call', call.type);

    if (call.type === 'video') {
        const lv = document.getElementById('local-video');
        if (lv) lv.srcObject = localStream;
        document.getElementById('video-container').style.display = 'flex';
        document.getElementById('btn-cam').style.display = 'inline-flex';
    }
    incomingCallData = null;
}

async function handleAnswer(answerStr) {
    if (!peerConn) return;
    try {
        const answerData = JSON.parse(answerStr);
        const sdp = answerData.sdp || answerData;
        if (peerConn.signalingState === 'have-local-offer') {
            await peerConn.setRemoteDescription(new RTCSessionDescription(sdp));
            stopRinging();
        }
    } catch(e) { console.error('handleAnswer error:', e); }
}

function declineCall() {
    if (!incomingCallData) return;
    fetch('api/call.php', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'decline', call_id:incomingCallData.id }) });
    stopRinging();
    document.getElementById('call-incoming').style.display = 'none';
    incomingCallData = null;
}

async function endCall() {
    if (callId) {
        await fetch('api/call.php', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ action:'end', call_id:callId }) });
    }
    hangupLocal();
}

function hangupLocal() {
    if (peerConn) { peerConn.close(); peerConn = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    stopRinging();
    clearInterval(callTimer); callTimer = null; callSeconds = 0;
    document.getElementById('call-active').style.display   = 'none';
    document.getElementById('call-incoming').style.display = 'none';
    document.getElementById('video-container').style.display = 'none';
    const rv = document.getElementById('remote-video');
    const lv = document.getElementById('local-video');
    if (rv) rv.srcObject = null;
    if (lv) lv.srcObject = null;
    callId = null; callType = null; isMuted = false; isCamOff = false;
}

// ── Active call UI ────────────────────────────────────────────
function showActiveCall(name, type) {
    document.getElementById('active-call-name').textContent = name + (type==='video'?' (Video)':'');
    document.getElementById('call-active').style.display   = 'block';
    callSeconds = 0;
    callTimer   = setInterval(() => {
        callSeconds++;
        const m = String(Math.floor(callSeconds/60)).padStart(2,'0');
        const s = String(callSeconds%60).padStart(2,'0');
        document.getElementById('call-timer').textContent = m + ':' + s;
    }, 1000);
}

// ── Call controls ─────────────────────────────────────────────
function toggleMute() {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
    const btn = document.getElementById('btn-mute');
    btn.innerHTML = isMuted ? '<i class="fa-solid fa-microphone-slash"></i>' : '<i class="fa-solid fa-microphone"></i>';
    btn.classList.toggle('active', isMuted);
}

function toggleCamera() {
    if (!localStream) return;
    isCamOff = !isCamOff;
    localStream.getVideoTracks().forEach(t => t.enabled = !isCamOff);
    const btn = document.getElementById('btn-cam');
    btn.innerHTML = isCamOff ? '<i class="fa-solid fa-video-slash"></i>' : '<i class="fa-solid fa-video"></i>';
    btn.classList.toggle('active', isCamOff);
}

function toggleSpeaker() {
    const rv = document.getElementById('remote-video');
    if (!rv) return;
    rv.muted = !rv.muted;
    const btn = document.getElementById('btn-speaker');
    btn.innerHTML = rv.muted ? '<i class="fa-solid fa-volume-xmark"></i>' : '<i class="fa-solid fa-volume-high"></i>';
    btn.classList.toggle('active', rv.muted);
}

// ── Ringing sound ─────────────────────────────────────────────
function playRinging()  { try { const a=$('snd-ringing'); if(a){a.currentTime=0;a.play().catch(()=>{});} } catch(e){} }
function stopRinging()  { try { const a=$('snd-ringing'); if(a){a.pause();a.currentTime=0;} } catch(e){} }
