<?php
require_once '../includes/db.php';

$stmt = $pdo->query('SELECT * FROM messages ORDER BY created_at DESC');
$messages = $stmt->fetchAll();

foreach ($messages as $message) {
    echo '<div class="message">';
    echo '<strong>' . htmlspecialchars($message['username']) . ':</strong> ';
    echo htmlspecialchars($message['message']);
    echo '<span class="timestamp">' . $message['created_at'] . '</span>';
    echo '</div>';
}
?>
