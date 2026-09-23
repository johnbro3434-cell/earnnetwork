import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { setMfsSocketIO } from './mfsService';

let io: SocketIOServer | null = null;
let onlineUserCount = 0;

export function initSocketIO(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  setMfsSocketIO(io);

  io.on('connection', (socket: Socket) => {
    onlineUserCount++;
    emitAdminDashboardUpdated({ onlineUsers: onlineUserCount });

    socket.on('join_user_room', (userId: string) => {
      if (userId) {
        socket.join(`user:${userId}`);
      }
    });

    socket.on('join_admin_room', (adminRole: string) => {
      socket.join('admins');
      if (adminRole === 'Finance Admin' || adminRole === 'Main Admin') {
        socket.join('finance-admins');
      }
    });

    socket.on('disconnect', () => {
      onlineUserCount = Math.max(0, onlineUserCount - 1);
      emitAdminDashboardUpdated({ onlineUsers: onlineUserCount });
    });
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}

export function getOnlineUserCount(): number {
  return Math.max(1, onlineUserCount);
}

// Real-Time Event Dispatchers (Strictly Locked Events)
export function emitWalletUpdated(userId: string, walletData: any) {
  if (!io) return;
  io.to(`user:${userId}`).emit('wallet.updated', walletData);
  io.to('admins').emit('wallet.updated', { userId, ...walletData });
}

export function emitDepositStatusChanged(userId: string, depositData: any) {
  if (!io) return;
  io.to(`user:${userId}`).emit('deposit.status.changed', depositData);
  io.to('finance-admins').emit('deposit.status.changed', depositData);
  io.to('admins').emit('deposit.status.changed', depositData);
}

export function emitWithdrawStatusChanged(userId: string, withdrawData: any) {
  if (!io) return;
  io.to(`user:${userId}`).emit('withdraw.status.changed', withdrawData);
  io.to('finance-admins').emit('withdraw.status.changed', withdrawData);
  io.to('admins').emit('withdraw.status.changed', withdrawData);
}

export function emitNotificationNew(userId: string, notification: any) {
  if (!io) return;
  io.to(`user:${userId}`).emit('notification.new', notification);
}

export function emitReferralCommission(userId: string, commissionData: any) {
  if (!io) return;
  io.to(`user:${userId}`).emit('referral.commission', commissionData);
  io.to('admins').emit('referral.commission', commissionData);
}

export function emitTaskCompleted(userId: string, taskData: any) {
  if (!io) return;
  io.to(`user:${userId}`).emit('task.completed', taskData);
}

export function emitCampaignUpdated(campaignData: any) {
  if (!io) return;
  io.emit('campaign.updated', campaignData);
}

export function emitHolidayUpdated(holidayData: any) {
  if (!io) return;
  io.emit('holiday.updated', holidayData);
}

export function emitBrandingUpdated(settingsData: any) {
  if (!io) return;
  io.emit('branding.updated', settingsData);
}

export function emitAdminDashboardUpdated(metrics?: any) {
  if (!io) return;
  io.to('admins').emit('admin.dashboard.updated', metrics || {});
}

export function emitDepositNew(depositData: any) {
  if (!io) return;
  io.to('finance-admins').emit('deposit.new', depositData);
  io.to('admins').emit('deposit.new', depositData);
  emitAdminDashboardUpdated();
}

export function emitWithdrawNew(withdrawData: any) {
  if (!io) return;
  io.to('finance-admins').emit('withdraw.new', withdrawData);
  io.to('admins').emit('withdraw.new', withdrawData);
  emitAdminDashboardUpdated();
}

export function emitUserRegistered(userData: any) {
  if (!io) return;
  io.to('admins').emit('user.registered', userData);
  emitAdminDashboardUpdated();
}
