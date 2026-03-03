# Chat Application

This repository contains the source code for a **Chat Application**, developed using **HTML**, **CSS**, **JavaScript**, **PHP**, and **XAMPP** for back-end server integration. The application demonstrates real-time messaging functionality and provides a user-friendly interface for chat interactions.

## Features

- **User Authentication**: Secure login and registration system.
- **Real-time Messaging**: Send and receive messages in real-time.
- **Responsive Design**: Works seamlessly across devices.
- **Database Integration**: Uses MySQL for storing user data and messages.

## Tech Stack

- **Front-End**: HTML, CSS, JavaScript
- **Back-End**: PHP
- **Database**: MySQL (via XAMPP)
- **Environment**: XAMPP (Apache + MySQL)

## Setup Instructions

Follow these steps to set up and run the project locally:

### Prerequisites

1. Install [XAMPP](https://www.apachefriends.org/index.html) on your system.
2. Clone this repository to your local machine.

```bash
git clone https://github.com/yourusername/chat-application.git
cd chat-application
```

### Configuration

1. **Database Setup**:
   - Open the XAMPP Control Panel and start Apache and MySQL.
   - Access `phpMyAdmin` by visiting `http://localhost/phpmyadmin` in your browser.
   - Create a new database (e.g., `chat_app`) and import the provided SQL file (`database/chat_app.sql`) located in the repository.

2. **Update Configuration**:
   - Edit the `config.php` file in the project root and update the database credentials:

```php
<?php
$host = 'localhost';
$user = 'root';
$password = ''; // Default password for XAMPP
$dbname = 'chat_app';
?>
```

### Running the Application

1. Place the project folder in the `htdocs` directory of your XAMPP installation (e.g., `C:/xampp/htdocs/chat-application`).
2. Open your browser and navigate to `http://localhost/chat-application`.
3. Use the application to register new users and start chatting!

## Folder Structure

```
chat-application/
├── css/                # Stylesheets
├── js/                 # JavaScript files
├── includes/           # PHP includes (e.g., database connection, utilities)
├── database/           # Database setup files (SQL scripts)
├── index.php           # Entry point for the application
├── login.php           # Login functionality
├── register.php        # Registration functionality
├── chat.php            # Chat interface
├── config.php          # Database configuration
└── README.md           # Project documentation
```

## Screenshots

Add screenshots of your project here to showcase the UI and functionality.

## Future Enhancements

- Add support for file sharing (images, documents, etc.).
- Enhance security with password hashing and input validation.
- Implement user presence indicators (online/offline status).
- Introduce group chat functionality.

## Contributing

Contributions are welcome! Please fork this repository and create a pull request for any enhancements or bug fixes.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

Feel free to contact me for any queries or suggestions.

## Author

**Navamohan M**

- GitHub:https:/github.com/NavamohanM/
- Email:navamohan5219@gmail.com
