<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chat Application</title>
    <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css">
    <link rel="stylesheet" href="assets/css/styles.css">
</head>
<body>
    <?php include ('header.php') ?>
    <div class="container">
        <div class="chat-box">
            <div id="messages"></div>
        </div>
        <form id="message-form" action="php/send_message.php" method="POST">
            <div class="form-group">
                <input type="text" class="form-control" name="username" placeholder="Enter your name" required>
            </div>
            <div class="form-group">
                <input type="text" class="form-control" name="message" placeholder="Enter your message" required>
            </div>
            <button type="submit" class="btn btn-primary">Send</button>
        </form>
    </div>
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js"></script>
    <script src="assets/js/script.js"></script>
</body>
</html>
