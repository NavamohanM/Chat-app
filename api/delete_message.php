<?php
require_once '../config.php';
header('Content-Type: application/json');

if (!is_logged_in()) { http_response_code(401); echo json_encode(['error'=>'Unauthorized']); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$input = json_decode(file_get_contents('php://input'), true);
$msgId = $input['message_id'] ?? '';
$user  = current_user();

if (empty($msgId)) { http_response_code(400); echo json_encode(['error'=>'Missing message_id']); exit; }

// Verify ownership
$check = supabase_request('messages?id=eq.' . $msgId . '&user_id=eq.' . $user['id'] . '&select=id', 'GET', [], true);
if (empty($check['data'])) {
    http_response_code(403); echo json_encode(['error'=>'Not your message']); exit;
}

// Soft delete
$result = supabase_request(
    'messages?id=eq.' . $msgId,
    'PATCH',
    ['deleted_at' => date('c'), 'message' => ''],
    true
);

if ($result['status'] === 204 || $result['status'] === 200) {
    echo json_encode(['success' => true]);
} else {
    http_response_code(500); echo json_encode(['error' => 'Delete failed']);
}
