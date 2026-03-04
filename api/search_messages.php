<?php
require_once '../config.php';
header('Content-Type: application/json');
api_auth_check();

$me    = current_user();
$q     = trim($_GET['q']    ?? '');
$with  = $_GET['with']      ?? null;
$limit = min((int)($_GET['limit'] ?? 20), 50);

if (strlen($q) < 2) { echo json_encode(['success'=>true,'data',[]]); exit; }

$fields = 'id,user_id,username,message,created_at,receiver_id,file_name,file_type,deleted_at';
$search = urlencode('%' . $q . '%');

if ($with) {
    // Search within a specific conversation
    $base = 'messages?select=' . $fields . '&deleted_at=is.null&message=ilike.' . $search . '&order=created_at.desc&limit=' . $limit;
    $q1 = supabase_request($base . '&user_id=eq.' . $me['id'] . '&receiver_id=eq.' . $with, 'GET', [], true);
    $q2 = supabase_request($base . '&user_id=eq.' . $with . '&receiver_id=eq.' . $me['id'], 'GET', [], true);
    $all = array_merge($q1['data'] ?? [], $q2['data'] ?? []);
} else {
    // Search all my conversations
    $q1 = supabase_request('messages?select=' . $fields . '&deleted_at=is.null&message=ilike.' . $search . '&user_id=eq.' . $me['id'] . '&order=created_at.desc&limit=' . $limit, 'GET', [], true);
    $q2 = supabase_request('messages?select=' . $fields . '&deleted_at=is.null&message=ilike.' . $search . '&receiver_id=eq.' . $me['id'] . '&order=created_at.desc&limit=' . $limit, 'GET', [], true);
    $all = array_merge($q1['data'] ?? [], $q2['data'] ?? []);
}

usort($all, fn($a,$b) => strcmp($b['created_at'], $a['created_at']));
$all = array_slice($all, 0, $limit);

echo json_encode(['success' => true, 'data' => $all, 'query' => $q]);
