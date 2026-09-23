import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  if (typeof window === 'undefined') return null;
  if (!socket) {
    socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }
  return socket;
}

export function joinAdminRoom(role: string = 'Main Admin'): void {
  const s = getSocket();
  if (s) {
    s.emit('join_admin_room', role);
  }
}

export function joinUserRoom(userId: string): void {
  const s = getSocket();
  if (s && userId) {
    s.emit('join_user_room', userId);
  }
}
