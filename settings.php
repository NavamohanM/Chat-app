<?php
require_once 'config.php';
send_security_headers();
if (!is_logged_in()) redirect('auth/login.php');
$user  = current_user();
$token = csrf_token();
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Settings — <?= APP_NAME ?></title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<link rel="stylesheet" href="assets/css/settings.css">
</head>
<body>
<div class="settings-layout">

    <!-- Sidebar -->
    <aside class="settings-sidebar">
        <div class="settings-back">
            <a href="index.php"><i class="fa-solid fa-arrow-left"></i> Back to Chat</a>
        </div>
        <div class="settings-profile">
            <div class="profile-av" id="profile-av" style="background:<?= htmlspecialchars($user['avatar_color']) ?>">
                <?= strtoupper(substr($user['username'], 0, 1)) ?>
            </div>
            <div class="profile-name" id="profile-name"><?= htmlspecialchars($user['username']) ?></div>
            <div class="profile-email"><?= htmlspecialchars($user['email']) ?></div>
        </div>
        <nav class="settings-nav">
            <a href="#" class="nav-item active" data-tab="profile"><i class="fa-solid fa-user"></i> Profile</a>
            <a href="#" class="nav-item" data-tab="security"><i class="fa-solid fa-shield"></i> Security</a>
            <a href="#" class="nav-item" data-tab="appearance"><i class="fa-solid fa-palette"></i> Appearance</a>
        </nav>
    </aside>

    <!-- Main -->
    <main class="settings-main">

        <!-- Profile tab -->
        <section class="tab-panel active" id="tab-profile">
            <h2>Profile Settings</h2>

            <div class="settings-card">
                <h3>Username</h3>
                <p class="card-desc">Change your display name. Other users will see this.</p>
                <div id="msg-username" class="settings-msg"></div>
                <div class="input-row">
                    <input type="text" id="new-username" placeholder="New username" value="<?= htmlspecialchars($user['username']) ?>" maxlength="50">
                    <button class="btn-save" onclick="changeUsername()">Save</button>
                </div>
            </div>

            <div class="settings-card">
                <h3>Avatar Color</h3>
                <p class="card-desc">Pick a color for your avatar circle.</p>
                <div id="msg-avatar" class="settings-msg"></div>
                <div class="color-grid">
                    <?php
                    $colors = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#14b8a6','#f97316','#06b6d4','#84cc16','#a855f7'];
                    foreach ($colors as $c):
                    ?>
                    <button class="color-swatch <?= $c === $user['avatar_color'] ? 'active' : '' ?>"
                            style="background:<?= $c ?>"
                            data-color="<?= $c ?>"
                            onclick="pickColor('<?= $c ?>', this)">
                        <?= $c === $user['avatar_color'] ? '<i class="fa-solid fa-check"></i>' : '' ?>
                    </button>
                    <?php endforeach; ?>
                </div>
                <div class="custom-color-row">
                    <label>Custom color:</label>
                    <input type="color" id="custom-color" value="<?= htmlspecialchars($user['avatar_color']) ?>" oninput="pickColor(this.value, this)">
                    <button class="btn-save" onclick="saveAvatar()">Apply</button>
                </div>
            </div>
        </section>

        <!-- Security tab -->
        <section class="tab-panel" id="tab-security">
            <h2>Security</h2>

            <div class="settings-card">
                <h3>Change Password</h3>
                <p class="card-desc">Use a strong password with at least 8 characters.</p>
                <div id="msg-password" class="settings-msg"></div>
                <div class="form-col">
                    <div class="input-wrap-pw">
                        <input type="password" id="current-pw" placeholder="Current password" autocomplete="current-password">
                        <button type="button" onclick="togglePw('current-pw')"><i class="fa-solid fa-eye"></i></button>
                    </div>
                    <div class="input-wrap-pw">
                        <input type="password" id="new-pw" placeholder="New password (min 8 chars)" autocomplete="new-password">
                        <button type="button" onclick="togglePw('new-pw')"><i class="fa-solid fa-eye"></i></button>
                    </div>
                    <div class="input-wrap-pw">
                        <input type="password" id="confirm-pw" placeholder="Confirm new password" autocomplete="new-password">
                        <button type="button" onclick="togglePw('confirm-pw')"><i class="fa-solid fa-eye"></i></button>
                    </div>
                    <div class="pw-strength" id="pw-strength"></div>
                    <button class="btn-save" onclick="changePassword()">Update Password</button>
                </div>
            </div>

            <div class="settings-card danger-zone">
                <h3><i class="fa-solid fa-triangle-exclamation"></i> Sign Out Everywhere</h3>
                <p class="card-desc">This will sign you out of all active sessions.</p>
                <a href="auth/logout.php" class="btn-danger">Sign Out</a>
            </div>
        </section>

        <!-- Appearance tab -->
        <section class="tab-panel" id="tab-appearance">
            <h2>Appearance</h2>
            <div class="settings-card">
                <h3>Notification Sounds</h3>
                <p class="card-desc">Play sounds for new messages and calls.</p>
                <label class="toggle-switch">
                    <input type="checkbox" id="sound-toggle" checked onchange="saveSoundPref(this.checked)">
                    <span class="toggle-slider"></span>
                    <span class="toggle-label">Message sounds</span>
                </label>
            </div>
            <div class="settings-card">
                <h3>Enter to Send</h3>
                <p class="card-desc">Press Enter to send messages (Shift+Enter for new line).</p>
                <label class="toggle-switch">
                    <input type="checkbox" id="enter-send" checked onchange="saveEnterPref(this.checked)">
                    <span class="toggle-slider"></span>
                    <span class="toggle-label">Enter sends message</span>
                </label>
            </div>
        </section>

    </main>
</div>

<script>
const CSRF_TOKEN = <?= json_encode($token) ?>;

// Tab switching
document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', e => {
        e.preventDefault();
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        el.classList.add('active');
        document.getElementById('tab-' + el.dataset.tab).classList.add('active');
    });
});

// Show message
function showMsg(id, text, ok) {
    const el = document.getElementById(id);
    el.textContent = text;
    el.className = 'settings-msg ' + (ok ? 'success' : 'error');
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// Change username
async function changeUsername() {
    const val = document.getElementById('new-username').value.trim();
    const res  = await post({ action: 'change_username', username: val });
    if (res.success) {
        showMsg('msg-username', 'Username updated!', true);
        document.getElementById('profile-name').textContent = val;
    } else {
        showMsg('msg-username', res.error || 'Failed', false);
    }
}

// Avatar color
let pendingColor = null;
function pickColor(color, el) {
    pendingColor = color;
    document.querySelectorAll('.color-swatch').forEach(s => { s.classList.remove('active'); s.innerHTML = ''; });
    if (el.classList?.contains('color-swatch')) {
        el.classList.add('active');
        el.innerHTML = '<i class="fa-solid fa-check"></i>';
    }
    document.getElementById('custom-color').value = color;
    document.getElementById('profile-av').style.background = color;
}
async function saveAvatar() {
    const color = pendingColor || document.getElementById('custom-color').value;
    const res   = await post({ action: 'change_avatar', avatar_color: color });
    if (res.success) {
        showMsg('msg-avatar', 'Avatar color updated!', true);
        document.getElementById('profile-av').style.background = color;
    } else {
        showMsg('msg-avatar', res.error || 'Failed', false);
    }
}

// Password
function togglePw(id) {
    const inp = document.getElementById(id);
    inp.type = inp.type === 'password' ? 'text' : 'password';
}
document.getElementById('new-pw')?.addEventListener('input', function() {
    const v = this.value, el = document.getElementById('pw-strength');
    let score = 0;
    if (v.length >= 8) score++;
    if (/[A-Z]/.test(v)) score++;
    if (/[0-9]/.test(v)) score++;
    if (/[^a-zA-Z0-9]/.test(v)) score++;
    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
    const classes = ['', 'pw-weak', 'pw-fair', 'pw-good', 'pw-strong'];
    el.textContent  = v.length ? 'Strength: ' + (labels[score] || 'Weak') : '';
    el.className    = 'pw-strength ' + (classes[score] || '');
});
async function changePassword() {
    const res = await post({
        action:           'change_password',
        current_password: document.getElementById('current-pw').value,
        new_password:     document.getElementById('new-pw').value,
        confirm_password: document.getElementById('confirm-pw').value,
    });
    if (res.success) {
        showMsg('msg-password', 'Password updated successfully!', true);
        ['current-pw','new-pw','confirm-pw'].forEach(id => document.getElementById(id).value = '');
    } else {
        showMsg('msg-password', res.error || 'Failed', false);
    }
}

// Preferences
function saveSoundPref(v)  { localStorage.setItem('chat_sound', v ? '1' : '0'); }
function saveEnterPref(v)  { localStorage.setItem('chat_enter_send', v ? '1' : '0'); }
document.getElementById('sound-toggle').checked  = localStorage.getItem('chat_sound')      !== '0';
document.getElementById('enter-send').checked    = localStorage.getItem('chat_enter_send') !== '0';

// API helper
async function post(data) {
    const res = await fetch('api/update_profile.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF_TOKEN },
        body: JSON.stringify(data),
    });
    return res.json();
}
</script>
</body>
</html>
