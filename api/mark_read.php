<?php
require_once '../config.php';
header('Content-Type: application/json');

if (!is_logged_in()) { http_response_code(401); echo json_encode(['error'=>'Unauthorized']); exit; }

$user     = current_user();
$input    = json_decode(file_get_contents('php://input'), true);
$from_id  = $input['from_id'] ?? null;   // Mark all messages from this user as read

if (!$from_id) { http_response_code(400); echo json_encode(['error'=>'from_id required']); exit; }

// Mark all messages from $from_id to me as read
$result = supabase_request(
    'messages?user_id=eq.' . $from_id . '&receiver_id=eq.' . $user['id'] . '&status=neq.read',
    'PATCH',
    ['status' => 'read'],
    true
);

echo json_encode(['success' => true]);
