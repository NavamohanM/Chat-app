<?php
require_once '../config.php';

if (is_logged_in()) redirect('../index.php');

$errors = [];
$success = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = trim($_POST['username'] ?? '');
    $email    = trim($_POST['email']    ?? '');
    $password = $_POST['password']      ?? '';
    $confirm  = $_POST['confirm']       ?? '';

    // Validation
    if (strlen($username) < 3 || strlen($username) > 50) {
        $errors[] = 'Username must be 3–50 characters.';
    }
    if (!preg_match('/^[a-zA-Z0-9_]+$/', $username)) {
        $errors[] = 'Username can only contain letters, numbers, and underscores.';
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $errors[] = 'Please enter a valid email address.';
    }
    if (strlen($password) < 6) {
        $errors[] = 'Password must be at least 6 characters.';
    }
    if ($password !== $confirm) {
        $errors[] = 'Passwords do not match.';
    }

    if (empty($errors)) {
        // Check if username or email already exists
        $check = supabase_request(
            'users?or=(username.eq.' . urlencode($username) . ',email.eq.' . urlencode($email) . ')',
            'GET', [], true
        );

        if (!empty($check['data'])) {
            foreach ($check['data'] as $existing) {
                if (strtolower($existing['username']) === strtolower($username)) {
                    $errors[] = 'Username already taken.';
                }
                if (strtolower($existing['email']) === strtolower($email)) {
                    $errors[] = 'Email already registered.';
                }
            }
        }

        if (empty($errors)) {
            // Pick a random avatar color
            $colors = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#14b8a6'];
            $avatar_color = $colors[array_rand($colors)];

            $result = supabase_request('users', 'POST', [
                'username'      => $username,
                'email'         => $email,
                'password_hash' => password_hash($password, PASSWORD_BCRYPT),
                'avatar_color'  => $avatar_color,
            ], true);

            if ($result['status'] === 201 && !empty($result['data'][0])) {
                $user = $result['data'][0];
                $_SESSION['user_id']      = $user['id'];
                $_SESSION['username']     = $user['username'];
                $_SESSION['email']        = $user['email'];
                $_SESSION['avatar_color'] = $user['avatar_color'];
                redirect('../index.php');
            } else {
                $errors[] = 'Registration failed. Please try again.';
            }
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Register — <?= APP_NAME ?></title>
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
            <p>Create your account</p>
        </div>

        <?php if (!empty($errors)): ?>
            <div class="alert alert-error">
                <?php foreach ($errors as $e): ?>
                    <div><i class="fa-solid fa-circle-exclamation"></i> <?= htmlspecialchars($e) ?></div>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>

        <form method="POST" class="auth-form" novalidate>
            <div class="form-group">
                <label for="username">Username</label>
                <div class="input-wrapper">
                    <i class="fa-solid fa-user"></i>
                    <input type="text" id="username" name="username" placeholder="Choose a username"
                           value="<?= htmlspecialchars($_POST['username'] ?? '') ?>" required autocomplete="username">
                </div>
            </div>
            <div class="form-group">
                <label for="email">Email</label>
                <div class="input-wrapper">
                    <i class="fa-solid fa-envelope"></i>
                    <input type="email" id="email" name="email" placeholder="Enter your email"
                           value="<?= htmlspecialchars($_POST['email'] ?? '') ?>" required autocomplete="email">
                </div>
            </div>
            <div class="form-group">
                <label for="password">Password</label>
                <div class="input-wrapper">
                    <i class="fa-solid fa-lock"></i>
                    <input type="password" id="password" name="password" placeholder="Min 6 characters" required autocomplete="new-password">
                    <button type="button" class="toggle-password" onclick="togglePass('password')">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                </div>
            </div>
            <div class="form-group">
                <label for="confirm">Confirm Password</label>
                <div class="input-wrapper">
                    <i class="fa-solid fa-lock"></i>
                    <input type="password" id="confirm" name="confirm" placeholder="Repeat password" required autocomplete="new-password">
                    <button type="button" class="toggle-password" onclick="togglePass('confirm')">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                </div>
            </div>
            <button type="submit" class="btn-primary">
                <i class="fa-solid fa-user-plus"></i> Create Account
            </button>
        </form>
        <p class="auth-switch">Already have an account? <a href="login.php">Sign in</a></p>
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
