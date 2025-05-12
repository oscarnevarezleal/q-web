"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const socket_io_1 = require("socket.io");
const enhanced_session_manager_1 = require("./enhanced-session-manager");
// Initialize Express app and HTTP server
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server);
// Path to the CLI entry point
const cliPath = path_1.default.resolve(__dirname, '../../dist/index.js');
console.log('CLI path:', cliPath);
console.log('Current directory:', process.cwd());
// Initialize session manager
const sessionManager = new enhanced_session_manager_1.EnhancedSessionManager(cliPath);
// Predefined worker profiles
const predefinedWorkerProfiles = {
    'q': 'AWS Q',
    'q-easy': 'AWS Q (Easy Mode)',
    'q-hard': 'AWS Q (Hard Mode)',
    'list-files': 'Lists files in the current directory with details',
    'current-dir': 'Prints the current working directory',
    'show-date': 'Shows the current date and time',
    'git-status': 'Shows brief git status',
    'whoami': 'Shows the current user'
};
// Serve static files
app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../public/index.html'));
});
// API endpoint to get worker profiles
app.get('/api/worker-profiles', (req, res) => {
    res.json(predefinedWorkerProfiles);
});
// API endpoint to get active sessions
app.get('/api/sessions', (req, res) => {
    const sessions = sessionManager.getActiveSessions();
    res.json({
        count: sessions.length,
        sessions
    });
});
// Socket.IO connection handler
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    // Handle starting a new QR session
    socket.on('start-session', (config) => {
        try {
            // Create a new session
            const session = sessionManager.createSession(socket.id, config);
            // Attach this client to the session
            sessionManager.attachToSession(socket.id, (data) => {
                socket.emit('terminal-output', data.toString());
            });
            socket.emit('session-started', { id: socket.id });
        }
        catch (error) {
            console.error('Error starting session:', error);
            socket.emit('error', { message: `Failed to start session: ${error instanceof Error ? error.message : String(error)}` });
        }
    });
    // Handle input from client
    socket.on('terminal-input', (data) => {
        if (!sessionManager.sendInput(socket.id, data)) {
            socket.emit('error', { message: 'No active session found' });
        }
    });
    // Handle client disconnection
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        // Detach from session but don't terminate it
        sessionManager.detachFromSession(socket.id, () => { });
        // For now, also terminate the session when the client disconnects
        sessionManager.terminateSession(socket.id);
    });
    // Handle explicit session termination
    socket.on('terminate-session', () => {
        if (sessionManager.terminateSession(socket.id)) {
            socket.emit('session-ended', { exitCode: 0, message: 'Session terminated by user' });
        }
        else {
            socket.emit('error', { message: 'No active session found or error terminating session' });
        }
    });
    // Get available worker profiles
    socket.on('get-worker-profiles', () => {
        socket.emit('worker-profiles', predefinedWorkerProfiles);
    });
    // Handle terminal resize
    socket.on('resize-terminal', ({ cols, rows }) => {
        const session = sessionManager.getSession(socket.id);
        if (session) {
            try {
                session.pty.resize(cols, rows);
            }
            catch (error) {
                console.error('Error resizing terminal:', error);
            }
        }
    });
});
// Handle session ended events from session manager
sessionManager.on('session-ended', (sessionId, event) => {
    const socket = io.sockets.sockets.get(sessionId);
    if (socket) {
        socket.emit('session-ended', event);
    }
});
// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    sessionManager.terminateAll();
    server.close(() => {
        console.log('Server shut down');
        process.exit(0);
    });
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
