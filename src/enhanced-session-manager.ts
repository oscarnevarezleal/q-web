import * as pty from '@homebridge/node-pty-prebuilt-multiarch';
import { EventEmitter } from 'events';
import path from 'path';
import { Session, SessionConfig } from './types';

export class EnhancedSessionManager extends EventEmitter {
  private sessions: Map<string, Session> = new Map();
  private sessionBuffers: Map<string, string[]> = new Map();
  private sessionListeners: Map<string, Set<(data: string) => void>> = new Map();
  private cliPath: string;

  constructor(cliPath: string) {
    super();
    this.cliPath = path.resolve(cliPath);
  }

  /**
   * Create a new session with the given configuration
   */
  createSession(sessionId: string, config: SessionConfig): Session {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session with ID ${sessionId} already exists`);
    }

    const { workers, rounds = 3 } = config;

    // Create a buffer for this session
    this.sessionBuffers.set(sessionId, []);
    this.sessionListeners.set(sessionId, new Set());

    console.log(`Starting QR session with worker: ${workers[0]}`);
    console.log(`CLI path: ${this.cliPath}`);

    // Spawn the PTY process with tmux
    const ptyProcess = pty.spawn(
      'script',
      ['-q', '/dev/null', 'q', 'chat', '-v'],
      {
        name: 'xterm-256color',
        cols: 120,
        rows: 40,
        cwd: process.env.HOME,
        env: { ...process.env, TERM: 'xterm-256color' },
        handleFlowControl: true                 // let raw Ctrl-S/Q pass
      }
    );

    // Create and store the session
    const session: Session = {
      id: sessionId,
      config,
      pty: ptyProcess,
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
          } catch (error) {
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
  attachToSession(sessionId: string, onData: (data: string) => void): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Send the buffer contents to catch up
    const buffer = this.sessionBuffers.get(sessionId) || [];
    buffer.forEach(data => {
      try {
        onData(data);
      } catch (error) {
        console.error(`Error sending buffer data to listener for session ${sessionId}:`, error);
      }
    });

    // Add listener for new data
    const listeners = this.sessionListeners.get(sessionId);
    if (listeners) {
      listeners.add(onData);
    } else {
      this.sessionListeners.set(sessionId, new Set([onData]));
    }

    return true;
  }

  /**
   * Detach a client from a session
   */
  detachFromSession(sessionId: string, onData: (data: string) => void): boolean {
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
  sendInput(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    try {
      console.log(`[Session ${sessionId}] Input:`, data);
      console.debug('hex bytes →', Buffer.from(data).toString('hex'));
      session.pty.write(data);
      return true;
    } catch (error) {
      console.error(`Error writing to session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Get an existing session by ID
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Terminate a session by ID
   */
  terminateSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        session.pty.kill();
        this.sessions.delete(sessionId);
        return true;
      } catch (error) {
        console.error(`Error terminating session ${sessionId}:`, error);
        return false;
      }
    }
    return false;
  }

  /**
   * Terminate all active sessions
   */
  terminateAll(): void {
    for (const [sessionId, session] of Array.from(this.sessions.entries())) {
      try {
        session.pty.kill();
      } catch (error) {
        console.error(`Error terminating session ${sessionId}:`, error);
      }
    }
    this.sessions.clear();
  }

  /**
   * Get all active session IDs
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Get the number of active sessions
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }
}
