<?php
require_once '../config.php';

if (is_logged_in()) redirect('../index.php');

$errors = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $login    = trim($_POST['login']    ?? '');
    $password = $_POST['password']      ?? '';

    if (empty($login) || empty($password)) {
        $errors[] = 'Please fill in all fields.';
    } else {
        // Find by username or email
        $isEmail  = filter_var($login, FILTER_VALIDATE_EMAIL);
        $field    = $isEmail ? 'email' : 'username';
        $result   = supabase_request(
            'users?' . $field . '=eq.' . urlencode($login) . '&limit=1',
            'GET', [], true
        );

        if (!empty($result['data'][0])) {
            $user = $result['data'][0];
            if (password_verify($password, $user['password_hash'])) {
                $_SESSION['user_id']      = $user['id'];
                $_SESSION['username']     = $user['username'];
                $_SESSION['email']        = $user['email'];
                $_SESSION['avatar_color'] = $user['avatar_color'];

                // Update last_seen
                supabase_request('users?id=eq.' . $user['id'], 'PATCH', [
                    'last_seen' => date('c'),
                ], true);

                redirect('../index.php');
            } else {
                $errors[] = 'Invalid username or password.';
            }
        } else {
            $errors[] = 'Invalid username or password.';
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login — <?= APP_NAME ?></title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="../assets/css/auth.css">
</head>
<body>
<div class="auth-wrapper">
    <div class="auth-card">
        <div class="auth-logo">
            <div class="logo-icon"><i class="fa-solid fa-comments"></i></div>
            <h1><?= APP_NAME ?></h1>
            <p>Sign in to continue</p>
        </div>

        <?php if (!empty($errors)): ?>
            <div class="alert alert-error">
                <?php foreach ($errors as $e): ?>
                    <div><i class="fa-solid fa-circle-exclamation"></i> <?= htmlspecialchars($e) ?></div>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>

        <form method="POST" class="auth-form">
            <div class="form-group">
                <label for="login">Username or Email</label>
                <div class="input-wrapper">
                    <i class="fa-solid fa-user"></i>
                    <input type="text" id="login" name="login" placeholder="Enter username or email"
                           value="<?= htmlspecialchars($_POST['login'] ?? '') ?>" required autocomplete="username">
                </div>
            </div>
            <div class="form-group">
                <label for="password">Password</label>
                <div class="input-wrapper">
                    <i class="fa-solid fa-lock"></i>
                    <input type="password" id="password" name="password" placeholder="Enter your password" required autocomplete="current-password">
                    <button type="button" class="toggle-password" onclick="togglePass('password')">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                </div>
            </div>
            <button type="submit" class="btn-primary">
                <i class="fa-solid fa-right-to-bracket"></i> Sign In
            </button>
        </form>
        <p class="auth-switch">Don't have an account? <a href="register.php">Create one</a></p>
    </div>
</div>
<script>
function togglePass(id) {
    const input = document.getElementById(id);
    const icon  = input.nextElementSibling.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fa-solid fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fa-solid fa-eye';
    }
}
</script>
</body>
</html>
