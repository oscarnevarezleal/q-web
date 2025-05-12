"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedSessionManager = void 0;
const pty = __importStar(require("@homebridge/node-pty-prebuilt-multiarch"));
const events_1 = require("events");
const path_1 = __importDefault(require("path"));
class EnhancedSessionManager extends events_1.EventEmitter {
    constructor(cliPath) {
        super();
        this.sessions = new Map();
        this.sessionBuffers = new Map();
        this.sessionListeners = new Map();
        this.cliPath = path_1.default.resolve(cliPath);
    }
    /**
     * Create a new session with the given configuration
     */
    createSession(sessionId, config) {
        if (this.sessions.has(sessionId)) {
            throw new Error(`Session with ID ${sessionId} already exists`);
        }
        const { problem, workers, rounds = 3 } = config;
        // Create a buffer for this session
        this.sessionBuffers.set(sessionId, []);
        this.sessionListeners.set(sessionId, new Set());
        // Build the command arguments
        const args = [
            'run',
            '--problem', problem,
            '--rounds', rounds.toString(),
            '--workers', ...workers
        ];
        console.log(`Starting QR session with args:`, args);
        console.log(`CLI path: ${this.cliPath}`);
        // Spawn the PTY process with tmux
        const ptyProcess = pty.spawn('script', ['-q', '-c', 'q chat', '/dev/null'], {
            name: 'xterm-256color',
            cols: 120,
            rows: 40,
            cwd: process.env.HOME,
            env: Object.assign(Object.assign({}, process.env), { TERM: 'xterm-256color', FORCE_COLOR: '1' }),
            handleFlowControl: true
        });
        // Create and store the session
        const session = {
            pty: ptyProcess,
            problem,
            workers,
            rounds,
            startTime: new Date()
        };
        this.sessions.set(sessionId, session);
        // Capture output and store in buffer
        ptyProcess.onData((data) => {
            console.log(`[Session ${sessionId}] Output:`, data.length > 100 ? data.substring(0, 100) + '...' : data);
            // Store in buffer
            const buffer = this.sessionBuffers.get(sessionId) || [];
            buffer.push(data);
            // Keep buffer at a reasonable size
            if (buffer.length > 1000) {
                buffer.shift();
            }
            this.sessionBuffers.set(sessionId, buffer);
            // Notify all attached listeners
            const listeners = this.sessionListeners.get(sessionId);
            if (listeners) {
                listeners.forEach(listener => {
                    try {
                        listener(data);
                    }
                    catch (error) {
                        console.error(`Error notifying listener for session ${sessionId}:`, error);
                    }
                });
            }
        });
        // Handle PTY exit
        ptyProcess.onExit(({ exitCode, signal }) => {
            console.log(`Session ${sessionId} exited with code ${exitCode}${signal ? ` (signal ${signal})` : ''}`);
            // Notify listeners of session end
            this.emit('session-ended', sessionId, { exitCode, signal });
            // Clean up
            this.sessions.delete(sessionId);
            // Keep the buffer for reconnection
        });
        return session;
    }
    /**
     * Attach a client to an existing session
     */
    attachToSession(sessionId, onData) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return false;
        }
        // Send the buffer contents to catch up
        const buffer = this.sessionBuffers.get(sessionId) || [];
        buffer.forEach(data => {
            try {
                onData(data);
            }
            catch (error) {
                console.error(`Error sending buffer data to listener for session ${sessionId}:`, error);
            }
        });
        // Add listener for new data
        const listeners = this.sessionListeners.get(sessionId);
        if (listeners) {
            listeners.add(onData);
        }
        else {
            this.sessionListeners.set(sessionId, new Set([onData]));
        }
        return true;
    }
    /**
     * Detach a client from a session
     */
    detachFromSession(sessionId, onData) {
        const listeners = this.sessionListeners.get(sessionId);
        if (listeners) {
            listeners.delete(onData);
            return true;
        }
        return false;
    }
    /**
     * Send input to a session
     */
    sendInput(sessionId, data) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return false;
        }
        try {
            console.log(`[Session ${sessionId}] Input:`, data);
            console.debug('hex bytes →', Buffer.from(data).toString('hex'));
            session.pty.write(data);
            return true;
        }
        catch (error) {
            console.error(`Error writing to session ${sessionId}:`, error);
            return false;
        }
    }
    /**
     * Get an existing session by ID
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    /**
     * Terminate a session by ID
     */
    terminateSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            try {
                session.pty.kill();
                this.sessions.delete(sessionId);
                return true;
            }
            catch (error) {
                console.error(`Error terminating session ${sessionId}:`, error);
                return false;
            }
        }
        return false;
    }
    /**
     * Terminate all active sessions
     */
    terminateAll() {
        for (const [sessionId, session] of Array.from(this.sessions.entries())) {
            try {
                session.pty.kill();
            }
            catch (error) {
                console.error(`Error terminating session ${sessionId}:`, error);
            }
        }
        this.sessions.clear();
    }
    /**
     * Get all active session IDs
     */
    getActiveSessions() {
        return Array.from(this.sessions.keys());
    }
    /**
     * Get the number of active sessions
     */
    getActiveSessionCount() {
        return this.sessions.size;
    }
}
exports.EnhancedSessionManager = EnhancedSessionManager;
