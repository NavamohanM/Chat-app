<?php
require_once '../config.php';
header('Content-Type: application/json');

if (!is_logged_in()) { http_response_code(401); echo json_encode(['error'=>'Unauthorized']); exit; }

$method = $_SERVER['REQUEST_METHOD'];
$user   = current_user();
$input  = json_decode(file_get_contents('php://input'), true) ?? [];

if ($method === 'POST') {
    $action = $input['action'] ?? '';

    if ($action === 'initiate') {
        // Start a call
        $result = supabase_request('calls', 'POST', [
            'caller_id'   => $user['id'],
            'receiver_id' => $input['receiver_id'],
            'type'        => $input['type'] ?? 'voice',
            'status'      => 'ringing',
            'offer'       => $input['offer'] ?? null,
        ], true);
        echo json_encode(['success' => $result['status'] === 201, 'data' => $result['data'][0] ?? null]);

    } elseif ($action === 'answer') {
        $callId = $input['call_id'];
        $result = supabase_request('calls?id=eq.' . $callId, 'PATCH', [
            'status' => 'active',
            'answer' => $input['answer'] ?? null,
        ], true);
        echo json_encode(['success' => true]);

    } elseif ($action === 'end') {
        $callId = $input['call_id'];
        supabase_request('calls?id=eq.' . $callId, 'PATCH', [
            'status'   => 'ended',
            'ended_at' => date('c'),
        ], true);
        echo json_encode(['success' => true]);

    } elseif ($action === 'decline') {
        $callId = $input['call_id'];
        supabase_request('calls?id=eq.' . $callId, 'PATCH', ['status' => 'declined'], true);
        echo json_encode(['success' => true]);

    } elseif ($action === 'ice') {
        // Store ICE candidate (append to offer field as JSON array)
        $callId    = $input['call_id'];
        $candidate = $input['candidate'];
        $call      = supabase_request('calls?id=eq.' . $callId . '&select=caller_id,offer,answer', 'GET', [], true);
        if (!empty($call['data'][0])) {
            $field   = ($call['data'][0]['caller_id'] ?? '') === $user['id'] ? 'offer' : 'answer';
            $current = json_decode($call['data'][0][$field] ?? '{}', true);
            $current['ice'][] = $candidate;
            supabase_request('calls?id=eq.' . $callId, 'PATCH', [$field => json_encode($current)], true);
        }
        echo json_encode(['success' => true]);
    }

} elseif ($method === 'GET') {
    $action = $_GET['action'] ?? '';

    if ($action === 'get_ice') {
        // Return ICE candidates stored by the OTHER party
        $callId = (int)($_GET['call_id'] ?? 0);
        $call   = supabase_request('calls?id=eq.' . $callId . '&select=caller_id,offer,answer', 'GET', [], true);
        if (empty($call['data'][0])) { echo json_encode(['success'=>false]); exit; }
        $row   = $call['data'][0];
        // Caller fetches answer-ICE; receiver fetches offer-ICE
        $field = ($row['caller_id'] === $user['id']) ? 'answer' : 'offer';
        $data  = json_decode($row[$field] ?? '{}', true);
        echo json_encode(['success' => true, 'data' => $data['ice'] ?? []]);
    } else {
        // Poll for active call directed to me
        $result = supabase_request(
            'calls?receiver_id=eq.' . $user['id'] . '&status=eq.ringing&order=created_at.desc&limit=1',
            'GET', [], true
        );
        echo json_encode(['success' => true, 'data' => $result['data'] ?? []]);
    }
}
