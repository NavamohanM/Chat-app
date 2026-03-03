<?php
require_once '../config.php';
header('Content-Type: application/json');

if (!is_logged_in()) { http_response_code(401); echo json_encode(['error'=>'Unauthorized']); exit; }

$me       = current_user();
$other_id = $_GET['with']   ?? null;
$limit    = min((int)($_GET['limit'] ?? 60), 100);
$after    = $_GET['after']  ?? null;
$before   = $_GET['before'] ?? null;

if (!$other_id) { http_response_code(400); echo json_encode(['error'=>'Missing ?with=']); exit; }

$fields = 'id,user_id,username,message,created_at,receiver_id,file_url,file_name,file_type,reply_to,deleted_at,status,read_at';
$extra  = '';
if ($after)  $extra .= '&created_at=gt.' . urlencode($after);
if ($before) $extra .= '&created_at=lt.' . urlencode($before);

$base = 'messages?select=' . $fields . '&order=created_at.asc&limit=' . $limit;

$q1 = supabase_request($base . '&user_id=eq.' . $me['id']    . '&receiver_id=eq.' . $other_id . $extra, 'GET', [], true);
$q2 = supabase_request($base . '&user_id=eq.' . $other_id    . '&receiver_id=eq.' . $me['id'] . $extra, 'GET', [], true);

if ($q1['status'] !== 200 || $q2['status'] !== 200) {
    http_response_code(500);
    echo json_encode(['error'=>'Fetch failed','detail'=> $q1['status']!==200?$q1['data']:$q2['data']]);
    exit;
}

$all = array_merge($q1['data'] ?? [], $q2['data'] ?? []);
usort($all, fn($a,$b) => strcmp($a['created_at'], $b['created_at']));
if (count($all) > $limit) $all = array_slice($all, -$limit);

// Fetch reply_to data for messages that have it
$replyIds = array_filter(array_unique(array_column($all, 'reply_to')));
$replyMap = [];
if (!empty($replyIds)) {
    $rq = supabase_request('messages?select=id,username,message,file_type&id=in.(' . implode(',', $replyIds) . ')', 'GET', [], true);
    if ($rq['status'] === 200 && !empty($rq['data'])) {
        foreach ($rq['data'] as $rm) {
            $replyMap[$rm['id']] = $rm;
        }
    }
}

// Attach reply data and mark incoming messages as delivered
$unreadIds = [];
foreach ($all as &$msg) {
    if ($msg['reply_to'] && isset($replyMap[$msg['reply_to']])) {
        $msg['_replyData'] = $replyMap[$msg['reply_to']];
    }
    // Mark messages sent to me as delivered if still 'sent'
    if ($msg['receiver_id'] === $me['id'] && ($msg['status'] === 'sent' || !$msg['status'])) {
        $unreadIds[] = $msg['id'];
        $msg['status'] = 'delivered';
    }
}
unset($msg);

// Batch mark as delivered
if (!empty($unreadIds)) {
    foreach ($unreadIds as $uid) {
        supabase_request('messages?id=eq.' . $uid, 'PATCH', ['status' => 'delivered'], true);
    }
}

echo json_encode(['success' => true, 'data' => $all]);
