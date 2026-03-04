<?php
require_once '../config.php';
header('Content-Type: application/json');
api_auth_check();

$user  = current_user();
$limit = min((int)($_GET['limit'] ?? 20), 50);

// Fetch calls where I was caller or receiver, most recent first
$q1 = supabase_request(
    'calls?select=id,caller_id,receiver_id,type,status,created_at,ended_at&caller_id=eq.' . $user['id'] . '&order=created_at.desc&limit=' . $limit,
    'GET', [], true
);
$q2 = supabase_request(
    'calls?select=id,caller_id,receiver_id,type,status,created_at,ended_at&receiver_id=eq.' . $user['id'] . '&order=created_at.desc&limit=' . $limit,
    'GET', [], true
);

$all = array_merge($q1['data'] ?? [], $q2['data'] ?? []);
usort($all, fn($a, $b) => strcmp($b['created_at'], $a['created_at']));
$all = array_slice($all, 0, $limit);

echo json_encode(['success' => true, 'data' => $all]);
