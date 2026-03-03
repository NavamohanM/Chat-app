<?php
require_once '../config.php';
header('Content-Type: application/json');
api_auth_check();

$user   = current_user();
$input  = json_decode(file_get_contents('php://input'), true);
$action = $input['action']     ?? $_GET['action'] ?? 'list';
$target = $input['target_id']  ?? '';

if ($action === 'block') {
    if (empty($target) || $target === $user['id']) { echo json_encode(['error'=>'Invalid user']); exit; }
    // Store in user's metadata (we use a simple blocked_users table)
    $r = supabase_request('blocked_users', 'POST', [
        'user_id'    => $user['id'],
        'blocked_id' => $target,
    ], true);
    echo json_encode(['success' => $r['status'] === 201]);

} elseif ($action === 'unblock') {
    $r = supabase_request('blocked_users?user_id=eq.' . $user['id'] . '&blocked_id=eq.' . $target, 'DELETE', [], true);
    echo json_encode(['success' => true]);

} elseif ($action === 'list') {
    $r = supabase_request('blocked_users?user_id=eq.' . $user['id'] . '&select=blocked_id', 'GET', [], true);
    $ids = array_column($r['data'] ?? [], 'blocked_id');
    echo json_encode(['success' => true, 'data' => $ids]);
}
