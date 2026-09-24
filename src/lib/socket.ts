import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  if (typeof window === 'undefined') return null;
  if (!socket) {
    try {
      socket = io(window.location.origin, {
        transports: ['websocket', 'polling'],
        autoConnect: true,
        reconnection: false, // Don't loop continuously if serverless
        timeout: 4000,
      });

      socket.on('connect_error', () => {
        // Silently disconnect on environments without WebSocket support (Vercel serverless)
        if (socket && socket.connected === false) {
          socket.disconnect();
        }
      });
    } catch {
      socket = null;
    }
  }
  return socket;
}

export function joinAdminRoom(role: string = 'Main Admin'): void {
  const s = getSocket();
  if (s && s.connected) {
    s.emit('join_admin_room', role);
  }
}

export function joinUserRoom(userId: string): void {
  const s = getSocket();
  if (s && s.connected && userId) {
    s.emit('join_user_room', userId);
  }
}
