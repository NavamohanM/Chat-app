<?php
require_once '../includes/db.php';

$username = $_POST['username'];
$message = $_POST['message'];

if ($username && $message) {
    $stmt = $pdo->prepare('INSERT INTO messages (username, message) VALUES (?, ?)');
    $stmt->execute([$username, $message]);
}

header('Location: ../index.php');
