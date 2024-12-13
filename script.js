$(document).ready(function() {
    function fetchMessages() {
        $.ajax({
            url: 'php/fetch_messages.php',
            method: 'GET',
            success: function(data) {
                $('#messages').html(data);
            }
        });
    }

    setInterval(fetchMessages, 1000);

    $('#message-form').submit(function(event) {
        event.preventDefault();
        var formData = $(this).serialize();

        $.post('php/send_message.php', formData, function() {
            fetchMessages();
            $('#message-form')[0].reset();
        });
    });
});
