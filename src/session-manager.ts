import * as pty from '@homebridge/node-pty-prebuilt-multiarch';
import { EventEmitter } from 'events';
import path from 'path';
import { Session, SessionConfig } from './types';

export class SessionManager extends EventEmitter {
  private sessions: Map<string, Session> = new Map();
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
    
    const { workers } = config;
    
    console.log(`Starting QR session with worker: ${workers[0]}`);
    console.log(`CLI path: ${this.cliPath}`);
    
    const ptyProcess = pty.spawn('q', ['chat'], {
      name: 'xterm-color',
      cols: 120,
      rows: 40,
      env: {...process.env, DEBUG:"*"}
    });
    
    // Create and store the session
    const session: Session = {
      id: sessionId,
      config,
      pty: ptyProcess,
      startTime: new Date()
    };
    
    this.sessions.set(sessionId, session);
    
    // Handle PTY exit
    ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`Session ${sessionId} exited with code ${exitCode}${signal ? ` (signal ${signal})` : ''}`);
      
      this.emit('session-ended', sessionId, { exitCode, signal });
      this.sessions.delete(sessionId);
    });
    
    return session;
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
