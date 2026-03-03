<?php
require_once '../config.php';

header('Content-Type: application/json');

if (!is_logged_in()) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

echo json_encode(['success' => true, 'user' => current_user()]);
