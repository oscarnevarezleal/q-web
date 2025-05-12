import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// In a real application, you would use a database
// This is a simple in-memory store for demonstration purposes
interface User {
  username: string;
  passwordHash: string;
  salt: string;
}

class AuthManager {
  private users: Map<string, User> = new Map();
  private sessions: Map<string, string> = new Map(); // sessionId -> username
  
  constructor() {
    // Add a default user for testing
    this.addUser('admin', '2025DEVChallenge');
  }
  
  private generateSalt(): string {
    return crypto.randomBytes(16).toString('hex');
  }
  
  private hashPassword(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  }
  
  public addUser(username: string, password: string): void {
    const salt = this.generateSalt();
    const passwordHash = this.hashPassword(password, salt);
    
    this.users.set(username, {
      username,
      passwordHash,
      salt
    });
  }
  
  public authenticateUser(username: string, password: string): boolean {
    const user = this.users.get(username);
    if (!user) return false;
    
    const hash = this.hashPassword(password, user.salt);
    return hash === user.passwordHash;
  }
  
  public createSession(username: string): string {
    const sessionId = crypto.randomBytes(32).toString('hex');
    this.sessions.set(sessionId, username);
    return sessionId;
  }
  
  public validateSession(sessionId: string): string | null {
    return this.sessions.get(sessionId) || null;
  }
  
  public removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
  
  // Middleware for protecting routes
  public requireAuth(req: Request, res: Response, next: NextFunction): void {
    const sessionId = req.cookies?.sessionId;
    
    if (!sessionId || !this.validateSession(sessionId)) {
      res.redirect('/login');
      return;
    }
    
    next();
  }
}

export const authManager = new AuthManager();
