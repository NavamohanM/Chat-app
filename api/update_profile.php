<?php
require_once '../config.php';
header('Content-Type: application/json');
api_auth_check();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$input  = json_decode(file_get_contents('php://input'), true);
$user   = current_user();
$action = $input['action'] ?? '';

if ($action === 'change_password') {
    $current = $input['current_password'] ?? '';
    $new     = $input['new_password']     ?? '';
    $confirm = $input['confirm_password'] ?? '';

    if (strlen($new) < 8) { echo json_encode(['error'=>'Password must be at least 8 characters']); exit; }
    if ($new !== $confirm)  { echo json_encode(['error'=>'Passwords do not match']); exit; }

    // Fetch current hash
    $r = supabase_request('users?id=eq.' . $user['id'] . '&select=password_hash', 'GET', [], true);
    if (empty($r['data'][0])) { http_response_code(500); echo json_encode(['error'=>'User not found']); exit; }

    if (!password_verify($current, $r['data'][0]['password_hash'])) {
        echo json_encode(['error'=>'Current password is incorrect']); exit;
    }

    $result = supabase_request('users?id=eq.' . $user['id'], 'PATCH', [
        'password_hash' => password_hash($new, PASSWORD_BCRYPT)
    ], true);

    echo json_encode(['success' => true, 'message' => 'Password updated']);

} elseif ($action === 'change_avatar') {
    $color = $input['avatar_color'] ?? '';
    // Validate hex color
    if (!preg_match('/^#[0-9a-fA-F]{6}$/', $color)) {
        echo json_encode(['error'=>'Invalid color']); exit;
    }
    $result = supabase_request('users?id=eq.' . $user['id'], 'PATCH', ['avatar_color' => $color], true);
    if ($result['status'] === 200) {
        $_SESSION['avatar_color'] = $color;
        echo json_encode(['success' => true, 'avatar_color' => $color]);
    } else {
        echo json_encode(['error' => 'Update failed']);
    }

} elseif ($action === 'change_username') {
    $username = trim($input['username'] ?? '');
    if (strlen($username) < 3 || strlen($username) > 50) {
        echo json_encode(['error'=>'Username must be 3-50 characters']); exit;
    }
    if (!preg_match('/^[a-zA-Z0-9_]+$/', $username)) {
        echo json_encode(['error'=>'Letters, numbers, underscores only']); exit;
    }
    // Check not taken
    $check = supabase_request('users?username=eq.' . urlencode($username) . '&id=neq.' . $user['id'], 'GET', [], true);
    if (!empty($check['data'])) { echo json_encode(['error'=>'Username already taken']); exit; }

    $result = supabase_request('users?id=eq.' . $user['id'], 'PATCH', ['username' => $username], true);
    if ($result['status'] === 200) {
        $_SESSION['username'] = $username;
        echo json_encode(['success' => true, 'username' => $username]);
    } else {
        echo json_encode(['error' => 'Update failed']);
    }

} else {
    http_response_code(400);
    echo json_encode(['error' => 'Unknown action']);
}
