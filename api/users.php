<?php
require_once '../config.php';
header('Content-Type: application/json');

if (!is_logged_in()) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

$me = current_user();

$result = supabase_request(
    'users?select=id,username,avatar_color,last_seen&id=neq.' . $me['id'] . '&order=username.asc',
    'GET', [], true
);

if ($result['status'] === 200) {
    echo json_encode(['success' => true, 'data' => $result['data']]);
} else {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to fetch users']);
}
