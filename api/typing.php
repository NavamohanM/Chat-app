<?php
require_once '../config.php';
header('Content-Type: application/json');

if (!is_logged_in()) { http_response_code(401); echo json_encode(['error'=>'Unauthorized']); exit; }

$user = current_user();

// Update last_seen for online status heartbeat
supabase_request('users?id=eq.' . $user['id'], 'PATCH', ['last_seen' => date('c')], true);

echo json_encode(['success' => true]);
