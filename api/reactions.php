<?php
require_once '../config.php';
header('Content-Type: application/json');
api_auth_check();

$user   = current_user();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    $input      = json_decode(file_get_contents('php://input'), true);
    $message_id = $input['message_id'] ?? '';
    $emoji      = $input['emoji']      ?? '';

    if (!$message_id || !$emoji) { http_response_code(400); echo json_encode(['error'=>'message_id and emoji required']); exit; }

    // Check if reaction already exists (toggle)
    $existing = supabase_request(
        'reactions?message_id=eq.' . urlencode($message_id) . '&user_id=eq.' . $user['id'] . '&emoji=eq.' . urlencode($emoji),
        'GET', [], true
    );

    if (!empty($existing['data'])) {
        // Remove reaction
        $rid = $existing['data'][0]['id'];
        supabase_request('reactions?id=eq.' . $rid, 'DELETE', [], true);
        echo json_encode(['success' => true, 'action' => 'removed']);
    } else {
        // Add reaction
        $result = supabase_request('reactions', 'POST', [
            'message_id' => $message_id,
            'user_id'    => $user['id'],
            'username'   => $user['username'],
            'emoji'      => $emoji,
        ], true);
        echo json_encode(['success' => $result['status'] === 201, 'action' => 'added', 'data' => $result['data'][0] ?? null]);
    }

} elseif ($method === 'GET') {
    // Get all reactions for a list of message IDs
    $ids = $_GET['ids'] ?? '';
    if (!$ids) { echo json_encode(['success' => true, 'data' => []]); exit; }

    $result = supabase_request(
        'reactions?message_id=in.(' . urlencode($ids) . ')&select=id,message_id,user_id,username,emoji',
        'GET', [], true
    );
    echo json_encode(['success' => true, 'data' => $result['data'] ?? []]);
}
