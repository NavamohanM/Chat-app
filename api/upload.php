<?php
require_once '../config.php';
header('Content-Type: application/json');

if (!is_logged_in()) { http_response_code(401); echo json_encode(['error'=>'Unauthorized']); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

// Rate limit: 20 uploads per hour per user
$user = current_user();
if (!rate_limit('upload_' . $user['id'], 20, 3600)) {
    http_response_code(429); echo json_encode(['error'=>'Too many uploads. Please wait.']); exit;
}

if (empty($_FILES['file'])) {
    http_response_code(400); echo json_encode(['error'=>'No file uploaded']); exit;
}

$file     = $_FILES['file'];
$maxSize  = 20 * 1024 * 1024; // 20MB
$allowed  = ['image/jpeg','image/png','image/gif','image/webp','video/mp4',
             'application/pdf','application/zip','text/plain',
             'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

if ($file['size'] > $maxSize) {
    http_response_code(400); echo json_encode(['error'=>'File too large (max 20MB)']); exit;
}

$mime = mime_content_type($file['tmp_name']);
if (!in_array($mime, $allowed)) {
    http_response_code(400); echo json_encode(['error'=>'File type not allowed']); exit;
}

$ext      = pathinfo($file['name'], PATHINFO_EXTENSION);
$filename = uniqid('media_', true) . '.' . strtolower($ext);
$content  = file_get_contents($file['tmp_name']);

// Upload to Supabase Storage
$url     = SUPABASE_URL . '/storage/v1/object/chat-media/' . $filename;
$headers = [
    'Authorization: Bearer ' . SUPABASE_SERVICE_KEY,
    'apikey: ' . SUPABASE_SERVICE_KEY,
    'Content-Type: ' . $mime,
    'x-upsert: false',
];

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'POST');
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_POSTFIELDS, $content);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
$resp     = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode === 200 || $httpCode === 201) {
    $publicUrl = SUPABASE_URL . '/storage/v1/object/public/chat-media/' . $filename;
    echo json_encode([
        'success' => true,
        'url'     => $publicUrl,
        'name'    => $file['name'],
        'type'    => $mime,
        'size'    => $file['size'],
    ]);
} else {
    error_log('[Upload failed] HTTP ' . $httpCode . ' → ' . $resp);
    http_response_code(500);
    echo json_encode(['error' => 'Upload failed. Please try again.']);
}
