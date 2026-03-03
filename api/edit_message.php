<?php
require_once '../config.php';
header('Content-Type: application/json');
api_auth_check();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$input   = json_decode(file_get_contents('php://input'), true);
$msgId   = $input['message_id'] ?? '';
$newText = trim($input['message'] ?? '');
$user    = current_user();

if (empty($msgId) || empty($newText)) { http_response_code(400); echo json_encode(['error'=>'Missing fields']); exit; }
if (strlen($newText) > 1000) { echo json_encode(['error'=>'Message too long']); exit; }

// Verify ownership and not deleted
$check = supabase_request('messages?id=eq.' . $msgId . '&user_id=eq.' . $user['id'] . '&deleted_at=is.null&select=id,created_at', 'GET', [], true);
if (empty($check['data'])) { http_response_code(403); echo json_encode(['error'=>'Cannot edit this message']); exit; }

// Only allow editing within 15 minutes
$created = new DateTime($check['data'][0]['created_at']);
$diff    = (new DateTime())->getTimestamp() - $created->getTimestamp();
if ($diff > 900) { echo json_encode(['error'=>'Cannot edit messages older than 15 minutes']); exit; }

$result = supabase_request('messages?id=eq.' . $msgId, 'PATCH', [
    'message'   => $newText,
    'edited_at' => date('c'),
], true);

if ($result['status'] === 200) {
    echo json_encode(['success' => true]);
} else {
    http_response_code(500);
    echo json_encode(['error' => 'Edit failed']);
}
