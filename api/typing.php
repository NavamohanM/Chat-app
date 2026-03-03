<?php
require_once '../config.php';
header('Content-Type: application/json');

if (!is_logged_in()) { http_response_code(401); echo json_encode(['error'=>'Unauthorized']); exit; }

$user       = current_user();
$receiver   = $_GET['to'] ?? '';
$isTyping   = ($_GET['typing'] ?? '0') === '1';

if (empty($receiver)) { http_response_code(400); echo json_encode(['error'=>'Missing to']); exit; }

// Update last_seen so we can derive online status
supabase_request('users?id=eq.' . $user['id'], 'PATCH', ['last_seen' => date('c')], true);

echo json_encode(['success' => true]);
