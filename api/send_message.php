<?php
require_once '../config.php';
header('Content-Type: application/json');

if (!is_logged_in()) { http_response_code(401); echo json_encode(['error'=>'Unauthorized']); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$input       = json_decode(file_get_contents('php://input'), true);
$message     = trim($input['message']     ?? '');
$receiver_id = trim($input['receiver_id'] ?? '');
$reply_to    = $input['reply_to']         ?? null;
$file_url    = $input['file_url']         ?? null;
$file_name   = $input['file_name']        ?? null;
$file_type   = $input['file_type']        ?? null;

if (empty($receiver_id)) { http_response_code(400); echo json_encode(['error'=>'receiver_id required']); exit; }
if (empty($message) && empty($file_url)) { http_response_code(400); echo json_encode(['error'=>'Message or file required']); exit; }
if (strlen($message) > 1000) { http_response_code(400); echo json_encode(['error'=>'Message too long']); exit; }

// CSRF check
$token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
if (!hash_equals($_SESSION['csrf_token'] ?? '', $token)) {
    http_response_code(403); echo json_encode(['error'=>'Invalid request']); exit;
}

$user = current_user();
$data = [
    'user_id'     => $user['id'],
    'username'    => $user['username'],
    'message'     => $message ?: '', // always string, never null
    'receiver_id' => $receiver_id,
    'status'      => 'sent',
];
if ($reply_to) $data['reply_to']  = $reply_to;
if ($file_url) $data['file_url']  = $file_url;
if ($file_name)$data['file_name'] = $file_name;
if ($file_type)$data['file_type'] = $file_type;

$result = supabase_request('messages', 'POST', $data, true);

if ($result['status'] === 201) {
    supabase_request('users?id=eq.' . $user['id'], 'PATCH', ['last_seen' => date('c')], true);
    echo json_encode(['success' => true, 'data' => $result['data'][0] ?? null]);
} else {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to send message']);
}
