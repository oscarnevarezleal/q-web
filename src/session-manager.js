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
exports.SessionManager = void 0;
const pty = __importStar(require("@homebridge/node-pty-prebuilt-multiarch"));
const events_1 = require("events");
const path_1 = __importDefault(require("path"));
class SessionManager extends events_1.EventEmitter {
    constructor(cliPath) {
        super();
        this.sessions = new Map();
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
        // Build the command arguments
        const args = [
            'run',
            '--problem', problem,
            '--rounds', rounds.toString(),
            '--workers', ...workers
        ];
        console.log(`Starting QR session with args:`, args);
        console.log(`CLI path: ${this.cliPath}`);
        // For testing purposes, use a simple bash command to verify terminal output
        // const ptyProcess = pty.spawn('bash', ['-c', 'echo "Testing PTY connection"; sleep 1; echo "Line 2"; sleep 1; echo "Line 3"; echo "Type something and press Enter:"; bash'], {
        const ptyProcess = pty.spawn('q', ['chat'], {
            name: 'xterm-color',
            cols: 120,
            rows: 40,
            env: Object.assign(Object.assign({}, process.env), { DEBUG: "*" })
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
        // Debug: Set up a periodic message to test PTY input
        const intervalId = setInterval(() => {
            try {
                console.log(`[Session ${sessionId}] Sending periodic test message`);
                ptyProcess.write("hello\n");
            }
            catch (error) {
                console.error('Error writing test to PTY:', error);
            }
        }, 3000);
        // Store the interval ID so we can clear it when the session ends
        session.intervalId = intervalId;
        // Handle PTY exit
        ptyProcess.onExit(({ exitCode, signal }) => {
            console.log(`Session ${sessionId} exited with code ${exitCode}${signal ? ` (signal ${signal})` : ''}`);
            // Clear the interval when the session ends
            if (session.intervalId) {
                clearInterval(session.intervalId);
            }
            this.emit('session-ended', sessionId, { exitCode, signal });
            this.sessions.delete(sessionId);
        });
        return session;
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
exports.SessionManager = SessionManager;
