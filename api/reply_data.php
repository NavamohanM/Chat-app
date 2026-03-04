<?php
require_once '../config.php';
header('Content-Type: application/json');

if (!is_logged_in()) { http_response_code(401); echo json_encode(['error'=>'Unauthorized']); exit; }

$id = $_GET['id'] ?? '';
if (empty($id)) { http_response_code(400); echo json_encode(['error'=>'id required']); exit; }

$r = supabase_request('messages?select=id,username,message,file_type&id=eq.' . urlencode($id), 'GET', [], true);

if ($r['status'] !== 200 || empty($r['data'])) {
    echo json_encode(['success' => false, 'data' => null]);
    exit;
}

echo json_encode(['success' => true, 'data' => $r['data'][0]]);
