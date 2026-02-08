export interface User {
  id: string;
  username: string;
  role: 'admin' | 'viewer';
}

export interface SystemStatus {
  online: boolean;
  lastUpdate: string;
  cpuUsage: number;
  memoryUsage: number;
}
