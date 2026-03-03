<?php
// Copy this file to config.php and fill in your values
define('SUPABASE_URL',         'https://YOUR_PROJECT.supabase.co');
define('SUPABASE_ANON_KEY',    'YOUR_ANON_KEY');
define('SUPABASE_SERVICE_KEY', 'YOUR_SERVICE_ROLE_KEY');
define('APP_NAME', 'ChatApp');
define('SESSION_LIFETIME', 86400);

if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params([
        'lifetime' => SESSION_LIFETIME,
        'path'     => '/',
        'secure'   => isset($_SERVER['HTTPS']),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

function supabase_request(string $endpoint, string $method = 'GET', array $data = [], bool $useServiceKey = false): array {
    $key = $useServiceKey ? SUPABASE_SERVICE_KEY : SUPABASE_ANON_KEY;
    $url = SUPABASE_URL . '/rest/v1/' . $endpoint;
    $headers = [
        'Content-Type: application/json',
        'apikey: ' . $key,
        'Authorization: Bearer ' . $key,
        'Prefer: return=representation',
    ];
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    if (!empty($data) && in_array($method, ['POST', 'PATCH', 'PUT']))
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error    = curl_error($ch);
    curl_close($ch);
    if ($error) return ['error' => $error, 'status' => 0];
    return ['data' => json_decode($response, true), 'status' => $httpCode];
}

function is_logged_in(): bool { return isset($_SESSION['user_id']) && !empty($_SESSION['user_id']); }
function current_user(): array {
    return ['id'=>$_SESSION['user_id']??'','username'=>$_SESSION['username']??'','email'=>$_SESSION['email']??'','avatar_color'=>$_SESSION['avatar_color']??'#6366f1'];
}
function redirect(string $path): void { header('Location: ' . $path); exit; }
?>
