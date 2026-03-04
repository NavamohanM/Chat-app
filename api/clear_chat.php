<?php
require_once '../config.php';
header('Content-Type: application/json');
api_auth_check();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$input    = json_decode(file_get_contents('php://input'), true);
$peerId   = $input['peer_id'] ?? '';
$user     = current_user();

if (empty($peerId)) { http_response_code(400); echo json_encode(['error'=>'peer_id required']); exit; }

$now = date('c');

// Soft-delete all messages sent by me to peer
$r1 = supabase_request(
    'messages?user_id=eq.' . $user['id'] . '&receiver_id=eq.' . $peerId . '&deleted_at=is.null',
    'PATCH', ['deleted_at' => $now, 'message' => ''], true
);

// Soft-delete all messages sent by peer to me
$r2 = supabase_request(
    'messages?user_id=eq.' . $peerId . '&receiver_id=eq.' . $user['id'] . '&deleted_at=is.null',
    'PATCH', ['deleted_at' => $now, 'message' => ''], true
);

echo json_encode(['success' => true]);
