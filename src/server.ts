import express from 'express';
import http from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { EnhancedSessionManager } from './enhanced-session-manager';
import { SessionConfig } from './types';
import cookieParser from 'cookie-parser';
import { authManager } from './auth';

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server);

// Path to the CLI entry point
const cliPath = path.resolve(__dirname, '../../dist/index.js');
console.log('CLI path:', cliPath);
console.log('Current directory:', process.cwd());

// Initialize session manager
const sessionManager = new EnhancedSessionManager(cliPath);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Authentication middleware
const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const sessionId = req.cookies?.sessionId;
  
  if (!sessionId || !authManager.validateSession(sessionId)) {
    return res.redirect('/login');
  }
  
  next();
};

// Define public assets that don't require authentication
const publicAssets = [
  '/login',
  '/login.html',
  '/css/styles.css',
  '/css/xterm.css',
  '/js/xterm.js',
  '/js/xterm-addon-fit.js',
  '/js/xterm-addon-web-links.js',
  '/favicon.ico'
];

// Login routes
app.get('/login', (req, res) => {
  // If already authenticated, redirect to home
  const sessionId = req.cookies?.sessionId;
  if (sessionId && authManager.validateSession(sessionId)) {
    return res.redirect('/');
  }
  
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }
  
  if (authManager.authenticateUser(username, password)) {
    const sessionId = authManager.createSession(username);
    res.cookie('sessionId', sessionId, { 
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
    res.status(200).json({ success: true });
  } else {
    res.status(401).json({ message: 'Invalid username or password' });
  }
});

app.post('/logout', (req, res) => {
  const sessionId = req.cookies?.sessionId;
  if (sessionId) {
    authManager.removeSession(sessionId);
    res.clearCookie('sessionId');
  }
  res.redirect('/login');
});

// Protected routes - define before static middleware
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Custom middleware to protect static files
app.use((req, res, next) => {
  // Allow access to login page and its resources without authentication
  if (publicAssets.some(asset => req.path === asset || req.path.startsWith('/css/') || req.path.startsWith('/js/'))) {
    return next();
  }
  
  // Require authentication for all other static files
  requireAuth(req, res, next);
});

// Serve static files after authentication check
app.use(express.static(path.join(__dirname, '../public')));

// API endpoint to get current user
app.get('/api/user', requireAuth, (req, res) => {
  const sessionId = req.cookies?.sessionId;
  const username = authManager.validateSession(sessionId);
  
  if (username) {
    res.json({ username });
  } else {
    res.status(401).json({ message: 'Not authenticated' });
  }
});

// Socket.IO authentication middleware
io.use((socket, next) => {
  const sessionId = socket.handshake.auth.sessionId || 
                    socket.request.headers.cookie?.split(';')
                      .find(c => c.trim().startsWith('sessionId='))
                      ?.split('=')[1];
  
  if (!sessionId || !authManager.validateSession(sessionId)) {
    return next(new Error('Authentication failed'));
  }
  
  next();
});

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Handle starting a new QR session
  socket.on('start-session', (config: SessionConfig) => {
    try {
      // Create a new session with default worker if none specified
      if (!config.workers || config.workers.length === 0) {
        config.workers = ['q']; // Default to 'q' worker
      }
      
      const session = sessionManager.createSession(socket.id, config);
      
      // Attach this client to the session
      sessionManager.attachToSession(socket.id, (data) => {
        socket.emit('terminal-output', data.toString());
      });
      
      socket.emit('session-started', { id: socket.id });
    } catch (error) {
      console.error('Error starting session:', error);
      socket.emit('error', { message: `Failed to start session: ${error instanceof Error ? error.message : String(error)}` });
    }
  });
  
  // Handle input from client
  socket.on('terminal-input', (data: string) => {
    if (!sessionManager.sendInput(socket.id, data)) {
      socket.emit('error', { message: 'No active session found' });
    }
  });
  
  // Handle client disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // Detach from session but don't terminate it
    sessionManager.detachFromSession(socket.id, () => {});
    // For now, also terminate the session when the client disconnects
    sessionManager.terminateSession(socket.id);
  });
  
  // Handle explicit session termination
  socket.on('terminate-session', () => {
    if (sessionManager.terminateSession(socket.id)) {
      socket.emit('session-ended', { exitCode: 0, message: 'Session terminated by user' });
    } else {
      socket.emit('error', { message: 'No active session found or error terminating session' });
    }
  });
  
  // Handle terminal resize
  socket.on('resize-terminal', ({ cols, rows }) => {
    const session = sessionManager.getSession(socket.id);
    if (session) {
      try {
        session.pty.resize(cols, rows);
      } catch (error) {
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
