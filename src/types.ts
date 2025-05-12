export interface SessionConfig {
  problem?: string;
  workers: string[];
  rounds?: number;
}

export interface WorkerProfiles {
  [key: string]: string;
}

export interface Session {
  id: string;
  config: SessionConfig;
  pty: any;
  startTime: Date;
}

export interface SessionEndEvent {
  exitCode: number;
  message?: string;
}
