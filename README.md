# QR Web Interface

A web-based interface for the QR (Runner) CLI tool that maintains PTY processes for streaming input and output directly from the web.

## Features

- Web-based interface for running terminal sessions
- Authentication system to protect access to terminal sessions
- Real-time terminal output streaming using Socket.IO
- Interactive terminal input for user responses
- Responsive design that works on desktop and mobile devices

## Installation

```bash
# Navigate to the web directory
cd web

# Install dependencies
yarn install

# Build the project
yarn build
```

## Running the Web Interface

```bash
# Start the web server
yarn start

# Or for development with auto-reload
yarn dev
```

The web interface will be available at http://localhost:3000 by default.

## Authentication

The web interface includes a simple authentication system:

- Default credentials: username: `admin`, password: `password123`
- All terminal sessions are protected behind authentication
- Sessions are managed with secure HTTP-only cookies

## Architecture

The web implementation consists of:

1. **Express Server**: Handles HTTP requests, authentication, and serves static files
2. **Socket.IO**: Provides real-time bidirectional communication between the server and clients
3. **PTY Process Management**: Spawns and manages PTY processes for the QR CLI
4. **XTerm.js Frontend**: Provides a terminal emulator in the browser
5. **Authentication System**: Manages user authentication and session validation

## How It Works

1. Users authenticate through the login page
2. After authentication, users are presented with a simple interface with a "Start Terminal Session" button
3. When a session is started, the server spawns a PTY process running the QR CLI with default settings
4. Terminal output from the CLI is streamed to the client in real-time via Socket.IO
5. User input from the web interface is sent to the PTY process
6. The PTY process maintains the interactive nature of the CLI

## Development

### Project Structure

```
web/
├── src/
│   ├── server.ts       # Express and Socket.IO server
│   ├── auth.ts         # Authentication manager
│   └── types.ts        # TypeScript type definitions
├── public/
│   ├── css/
│   │   └── styles.css  # Main stylesheet
│   ├── js/
│   │   └── main.js     # Client-side JavaScript
│   ├── index.html      # Main HTML page
│   └── login.html      # Login page
├── dist/               # Compiled JavaScript files
├── package.json
└── tsconfig.json
```

### Adding XTerm.js Dependencies

You'll need to download the XTerm.js library and its addons to the `public/js` directory:

```bash
# Create the directories if they don't exist
mkdir -p public/js public/css

# Download XTerm.js and addons
curl -L https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js -o public/js/xterm.js
curl -L https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css -o public/css/xterm.css
curl -L https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js -o public/js/xterm-addon-fit.js
curl -L https://cdn.jsdelivr.net/npm/xterm-addon-web-links@0.9.0/lib/xterm-addon-web-links.js -o public/js/xterm-addon-web-links.js
```

## License

MIT
