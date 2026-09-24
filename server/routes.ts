import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v2 as cloudinary } from 'cloudinary';
import {
  getStore,
  saveStore,
  saveStoreAsync,
  initMongoSync,
  reloadStoreFromMongoIfStale,
  recordWalletLedgerEntry,
  recordFinancialAuditLog,
  isTrxUnique,
} from './db';
import {
  emitWalletUpdated,
  emitDepositStatusChanged,
  emitWithdrawStatusChanged,
  emitNotificationNew,
  emitReferralCommission,
  emitTaskCompleted,
  emitCampaignUpdated,
  emitHolidayUpdated,
  emitBrandingUpdated,
  emitAdminDashboardUpdated,
  getOnlineUserCount,
} from './socket';
import {
  User,
  Wallet,
  Transaction,
  DepositRequest,
  WithdrawRequest,
  TaskHistory,
  ReferralCommission,
  AppNotification,
  ActivityLog,
  AdminUser,
  SupportTicket,
  SupportMessage,
  HomeSlider,
  VideoTask,
  Package,
  SystemHealthInfo,
  PaymentNumber,
  SmsTransaction,
  VerifyDevice,
  MfsVerificationSettings,
  VerificationLog,
  FraudLog,
  WalletTransactionLedger,
  AuditLog,
  ApkVersionRecord,
  WithdrawCard,
  SalaryTier,
  SalarySettings,
} from '../src/types';
import {
  attemptAutoVerification,
  checkPendingDepositsForIncomingSms,
  logVerification,
  logFraud,
  getDefaultMfsSettings,
  retryFailedSmsQueue,
} from './mfsService';
import { parseMfsSms, cleanBdPhone } from './smsParser';
import {
  authRateLimiter,
  financialRateLimiter,
  isValidPositiveAmount,
} from './security';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'earnhub-bd-v20-locked-secret-key-2026';

// Concurrency mutex locks for critical financial transactions
const activeTaskLocks = new Set<string>();
const activeWithdrawLocks = new Set<string>();

// Helper: BD Phone validation
function isValidBdPhone(phone: string): boolean {
  const clean = phone.replace(/[\s-]/g, '');
  return /^(?:\+8801|8801|01)[3-9]\d{8}$/.test(clean);
}

function normalizeBdPhone(phone: string): string {
  let clean = phone.replace(/[\s-]/g, '');
  if (clean.startsWith('+88')) clean = clean.substring(3);
  if (clean.startsWith('88')) clean = clean.substring(2);
  return clean;
}

// Authentication Middleware with Live DB Status & Ban Enforcement
export async function authenticateUser(req: Request, res: Response, next: () => void) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : (req.cookies && req.cookies.token);

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Please login' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; phone: string; isAdmin?: boolean; role?: string; name?: string };
    let store = getStore();

    if (decoded.isAdmin) {
      let adminRec = (store.adminUsers || []).find(a => a.id === decoded.id || a.phone === decoded.phone);
      if (!adminRec) {
        await reloadStoreFromMongoIfStale(true).catch(() => {});
        store = getStore();
        adminRec = (store.adminUsers || []).find(a => a.id === decoded.id || a.phone === decoded.phone);
      }
      if (adminRec && adminRec.status === 'disabled') {
        return res.status(403).json({ error: 'Admin account is disabled' });
      }
      (req as any).user = decoded;
      (req as any).admin = decoded;
      return next();
    }

    let dbUser = store.users.find(u => u.id === decoded.id || (decoded.phone && u.phone === decoded.phone));
    if (!dbUser) {
      await reloadStoreFromMongoIfStale(true).catch(() => {});
      store = getStore();
      dbUser = store.users.find(u => u.id === decoded.id || (decoded.phone && u.phone === decoded.phone));
    }

    if (dbUser) {
      if (dbUser.status === 'suspended' || dbUser.isBanned || (dbUser as any).isLockedOut) {
        return res.status(403).json({ error: 'আপনার অ্যাকাউন্টটি সাময়িকভাবে স্থগিত (Suspended/Banned) করা হয়েছে।' });
      }
      (req as any).user = { ...decoded, id: dbUser.id, phone: dbUser.phone, role: dbUser.role };
    } else {
      (req as any).user = decoded;
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid token' });
  }
}

// Admin Auth Middleware
export function authenticateAdmin(req: Request, res: Response, next: () => void) {
  authenticateUser(req, res, () => {
    const user = (req as any).user;
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: 'Access denied: Admin privileges required' });
    }
    (req as any).admin = user;
    next();
  });
}

// ==========================================
// PUBLIC & AUTH ROUTES
// ==========================================

// Validate Referral Code (Real-time DB verification endpoint)
router.get(['/auth/validate-referral', '/api/auth/validate-referral'], (req: Request, res: Response) => {
  const rawCode = ((req.query.code as string) || '').trim();
  if (!rawCode) {
    return res.json({ valid: false, message: 'রেফার কোড প্রদান করুন।' });
  }

  const cleanRefCode = rawCode.toUpperCase();
  const store = getStore();

  const officialCodes = [
    'EHBD1001',
    'EARNHUB20',
    (store.settings as any)?.defaultReferralCode,
  ].filter(Boolean).map((c: string) => c.toUpperCase());

  if (officialCodes.includes(cleanRefCode)) {
    return res.json({
      valid: true,
      isOfficial: true,
      sponsorName: 'Official System Sponsor (হেড অফিস)',
      sponsorRole: 'Head Office',
    });
  }

  const uplineUser = store.users.find(
    u => u.referralCode && u.referralCode.toUpperCase() === cleanRefCode
  );

  if (!uplineUser) {
    return res.json({
      valid: false,
      message: 'ভুয়া বা অস্তিত্বহীন রেফার কোড! ডাটাবেসে এই রেফার কোডের কোনো ইউজার নেই।',
    });
  }

  if (uplineUser.status === 'suspended') {
    return res.json({
      valid: false,
      message: 'এই রেফারারের অ্যাকাউন্ট সাময়িকভাবে স্থগিত বা নিষ্ক্রিয় রয়েছে।',
    });
  }

  const maskedPhone = uplineUser.phone.length >= 11
    ? uplineUser.phone.slice(0, 3) + '****' + uplineUser.phone.slice(-4)
    : uplineUser.phone;

  return res.json({
    valid: true,
    isOfficial: false,
    sponsorName: (uplineUser as any).name ? (uplineUser as any).name : `সক্রিয় মেম্বার (${maskedPhone})`,
    sponsorPhone: maskedPhone,
    sponsorRole: uplineUser.role || 'Member',
  });
});

// Register
router.post('/auth/register', authRateLimiter, async (req: Request, res: Response) => {
  const { phone, password, referralCode, deviceFingerprint } = req.body;

  if (!phone || !password) {
    return res.status(400).json({ error: 'মোবাইল নম্বর এবং পাসওয়ার্ড প্রদান করা আবশ্যক।' });
  }

  if (!isValidBdPhone(phone)) {
    return res.status(400).json({ error: 'সঠিক ১১ ডিজিটের বাংলাদেশি মোবাইল নম্বর প্রদান করুন (যেমন: 017xxxxxxxx)।' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।' });
  }

  const normalizedPhone = normalizeBdPhone(phone);
  let store = getStore();

  let existingUser = store.users.find(u => u.phone === normalizedPhone);
  if (!existingUser) {
    await reloadStoreFromMongoIfStale(true).catch(() => {});
    store = getStore();
    existingUser = store.users.find(u => u.phone === normalizedPhone);
  }
  if (existingUser) {
    return res.status(400).json({ error: 'এই মোবাইল নম্বরটি দিয়ে ইতিমধ্যে অ্যাকাউন্ট খোলা হয়েছে।' });
  }

  // Referral code validation (MANDATORY: strictly block fake or nonexistent referral codes)
  if (!referralCode || !referralCode.trim()) {
    return res.status(400).json({
      error: 'রেফার কোড আবশ্যক! রেফার কোড ছাড়া অ্যাকাউন্ট তৈরি করা সম্ভব নয়।',
    });
  }

  const cleanRefCode = referralCode.trim().toUpperCase();
  const officialCodes = [
    'EHBD1001',
    'EARNHUB20',
    (store.settings as any)?.defaultReferralCode,
  ].filter(Boolean).map((c: string) => c.toUpperCase());
  const isOfficialCode = officialCodes.includes(cleanRefCode);

  let uplineUser = store.users.find(
    u => u.referralCode && u.referralCode.toUpperCase() === cleanRefCode
  );

  if (!uplineUser && !isOfficialCode) {
    await reloadStoreFromMongoIfStale(true).catch(() => {});
    store = getStore();
    uplineUser = store.users.find(
      u => u.referralCode && u.referralCode.toUpperCase() === cleanRefCode
    );
  }

  if (!uplineUser && !isOfficialCode) {
    return res.status(400).json({
      error: 'ভুয়া বা অস্তিত্বহীন রেফার কোড! শুধুমাত্র ডাটাবেসের বৈধ ও সক্রিয় ইউজারের রেফার কোড গ্রহণযোগ্য।',
    });
  }

  if (uplineUser && uplineUser.status === 'suspended') {
    return res.status(400).json({
      error: 'এই রেফার কোডের মালিকের অ্যাকাউন্টটি সাময়িকভাবে স্থগিত বা নিষ্ক্রিয় রয়েছে। অনুগ্রহ করে অন্য সক্রিয় রেফার কোড ব্যবহার করুন।',
    });
  }

  if (uplineUser && uplineUser.phone === normalizedPhone) {
    return res.status(400).json({
      error: 'নিজের মোবাইল নম্বর বা নিজের রেফার কোড দিয়ে রেফারেল একাউন্ট খোলা সম্ভব নয়।',
    });
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);
  const userId = `user_${Date.now()}`;
  const generatedRefCode = `EH${normalizedPhone.slice(-4)}${Math.floor(100 + Math.random() * 900)}`;
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '103.205.71.1';
  const fp = deviceFingerprint || `fp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // Free trial: 4 Days, 25 TK daily income, 100 TK max trial income
  const newUser: User = {
    id: userId,
    phone: normalizedPhone,
    passwordHash,
    role: 'Member',
    referralCode: generatedRefCode,
    referredBy: uplineUser ? uplineUser.referralCode : undefined,
    createdAt: new Date().toISOString(),
    status: 'active',
    isTrial: true,
    trialStartDate: new Date().toISOString(),
    trialDaysUsed: 0,
    trialTotalEarned: 0,
    trialMissedDays: 0,
    trialExpired: false,
    activePackageId: 'pkg_trial',
    packageActivatedAt: new Date().toISOString(),
    withdrawSetupDone: false,
    deviceFingerprint: fp,
    lastLoginIp: clientIp,
    lastLoginAt: new Date().toISOString(),
  };

  const newWallet: Wallet = {
    userId,
    balance: 0,
    totalDeposit: 0,
    totalWithdraw: 0,
    totalEarned: 0,
    todayIncome: 0,
    referralIncome: 0,
    giftIncome: 0,
    salaryIncome: 0,
    updatedAt: new Date().toISOString(),
  };

  // Device Fingerprint recording
  let dfRecord = store.deviceFingerprints.find(d => d.deviceFingerprint === fp);
  if (dfRecord) {
    if (!dfRecord.associatedUserIds.includes(userId)) {
      dfRecord.associatedUserIds.push(userId);
    }
    dfRecord.lastSeenAt = new Date().toISOString();
    dfRecord.lastSeenIp = clientIp;
  } else {
    store.deviceFingerprints.push({
      deviceFingerprint: fp,
      associatedUserIds: [userId],
      trialWithdrawalCompleted: false,
      lastSeenIp: clientIp,
      lastSeenAt: new Date().toISOString(),
    });
  }

  // Welcome notification
  store.notifications.push({
    id: `notif_${Date.now()}`,
    userId,
    type: 'task',
    title: 'Welcome to EarnNetwork BD!',
    message: 'Your 4-Day Free Trial is now active. Complete 1 video task today to earn 25 TK.',
    isRead: false,
    createdAt: new Date().toISOString(),
  });

  store.users.push(newUser);
  store.wallets.push(newWallet);
  await saveStoreAsync();

  emitAdminDashboardUpdated();

  const token = jwt.sign(
    { id: newUser.id, phone: newUser.phone, isAdmin: false, role: newUser.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 7 * 86400000 });

  const { passwordHash: _, ...safeUser } = newUser;
  return res.json({ token, user: safeUser, wallet: newWallet });
});

// Login
router.post('/auth/login', authRateLimiter, async (req: Request, res: Response) => {
  const { phone, password, deviceFingerprint } = req.body;

  if (!phone || !password) {
    return res.status(400).json({ error: 'মোবাইল নম্বর এবং পাসওয়ার্ড প্রদান করা আবশ্যক।' });
  }

  const normalizedPhone = normalizeBdPhone(phone);
  let store = getStore();

  // Check admin users first (by normalized phone, raw phone, or username)
  const trimmedPhone = phone.trim().toLowerCase();
  let admin = store.adminUsers.find(
    a => a.phone === normalizedPhone ||
         a.phone === phone.trim() ||
         (a.username && a.username.toLowerCase() === trimmedPhone)
  );

  if (!admin) {
    await reloadStoreFromMongoIfStale(true).catch(() => {});
    store = getStore();
    admin = store.adminUsers.find(
      a => a.phone === normalizedPhone ||
           a.phone === phone.trim() ||
           (a.username && a.username.toLowerCase() === trimmedPhone)
    );
  }

  if (admin && bcrypt.compareSync(password, admin.passwordHash)) {
    const token = jwt.sign(
      { id: admin.id, phone: admin.phone, isAdmin: true, role: admin.role, name: admin.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 86400000 });
    return res.json({
      token,
      isAdmin: true,
      admin: { id: admin.id, phone: admin.phone, name: admin.name, role: admin.role, permissions: admin.permissions },
    });
  }

  // Check regular users
  let user = store.users.find(u => u.phone === normalizedPhone);
  if (!user) {
    await reloadStoreFromMongoIfStale(true).catch(() => {});
    store = getStore();
    user = store.users.find(u => u.phone === normalizedPhone);
  }

  if (!user || !user.passwordHash || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'মোবাইল নম্বর অথবা পাসওয়ার্ড সঠিক নয়।' });
  }

  if (user.status === 'suspended') {
    return res.status(403).json({ error: 'আপনার অ্যাকাউন্টটি সাময়িকভাবে স্থগিত বা নিষ্ক্রিয় করা হয়েছে। অ্যাডমিনের সাথে যোগাযোগ করুন।' });
  }

  // Update login data
  user.lastLoginAt = new Date().toISOString();
  user.lastLoginIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '103.205.71.1';
  if (deviceFingerprint) {
    user.deviceFingerprint = deviceFingerprint;
  }
  await saveStoreAsync();

  const wallet = store.wallets.find(w => w.userId === user.id);

  const token = jwt.sign(
    { id: user.id, phone: user.phone, isAdmin: false, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 7 * 86400000 });

  const { passwordHash: _, withdrawPasswordHash: __, ...safeUser } = user;
  return res.json({ token, isAdmin: false, user: safeUser, wallet });
});

// Me
router.get('/auth/me', authenticateUser, (req: Request, res: Response) => {
  const tokenUser = (req as any).user;
  const store = getStore();

  if (tokenUser.isAdmin) {
    const admin = store.adminUsers.find(a => a.id === tokenUser.id);
    if (!admin) return res.status(404).json({ error: 'Admin not found' });
    return res.json({
      isAdmin: true,
      admin: { id: admin.id, phone: admin.phone, name: admin.name, role: admin.role, permissions: admin.permissions },
    });
  }

  const user = store.users.find(u => u.id === tokenUser.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const wallet = store.wallets.find(w => w.userId === user.id);
  const activePackage = store.packages.find(p => p.id === user.activePackageId);

  const { passwordHash: _, withdrawPasswordHash: __, ...safeUser } = user;

  let uplineInfo = null;
  if (user.referredBy) {
    const upline = store.users.find(u => u.referralCode === user.referredBy);
    if (upline) {
      uplineInfo = {
        referralCode: upline.referralCode,
        phone: upline.phone,
        role: upline.role,
      };
    }
  }
  (safeUser as any).uplineInfo = uplineInfo;

  return res.json({
    isAdmin: false,
    user: safeUser,
    wallet,
    activePackage,
    withdrawSetupDone: user.withdrawSetupDone,
  });
});

// Logout
router.post('/auth/logout', (req: Request, res: Response) => {
  res.clearCookie('token');
  return res.json({ success: true, message: 'Logged out successfully' });
});

// Change Password
router.post('/auth/change-password', authenticateUser, (req: Request, res: Response) => {
  const tokenUser = (req as any).user;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।' });
  }

  const store = getStore();
  const user = store.users.find(u => u.id === tokenUser.id);
  if (!user || !user.passwordHash || !bcrypt.compareSync(currentPassword, user.passwordHash)) {
    return res.status(400).json({ error: 'বর্তমান পাসওয়ার্ডটি সঠিক নয়।' });
  }

  const salt = bcrypt.genSaltSync(10);
  user.passwordHash = bcrypt.hashSync(newPassword, salt);
  saveStore();

  return res.json({ success: true, message: 'পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে।' });
});

// ==========================================
// WITHDRAW SETUP (LOCKED - ONCE ONLY)
// ==========================================
router.post('/wallet/withdraw-setup', authenticateUser, (req: Request, res: Response) => {
  const tokenUser = (req as any).user;
  const { paymentMethod, withdrawNumber, withdrawPassword } = req.body;

  if (!paymentMethod || !withdrawNumber || !withdrawPassword) {
    return res.status(400).json({ error: 'পেমেন্ট মেথড, উইথড্র নম্বর এবং উইথড্র পাসওয়ার্ড প্রদান করা আবশ্যক।' });
  }

  if (paymentMethod !== 'bKash' && paymentMethod !== 'Nagad') {
    return res.status(400).json({ error: 'পেমেন্ট মেথড হিসেবে বিকাশ (bKash) অথবা নগদ (Nagad) নির্বাচন করুন।' });
  }

  if (!isValidBdPhone(withdrawNumber)) {
    return res.status(400).json({ error: 'সঠিক ১১ ডিজিটের বাংলাদেশি মোবাইল নম্বর প্রদান করুন।' });
  }

  const normalizedWithdrawNumber = normalizeBdPhone(withdrawNumber);
  const store = getStore();
  const user = store.users.find(u => u.id === tokenUser.id);
  if (!user) return res.status(404).json({ error: 'ইউজার পাওয়া যায়নি।' });

  if (user.withdrawSetupDone) {
    return res.status(400).json({ error: 'উইথড্র সেটআপ স্থায়ীভাবে লক করা এবং এটি শুধু একবারই পরিবর্তনযোগ্য।' });
  }

  // Withdraw Number unique globally rule: Same number cannot be used by another account
  const duplicateNumberUser = store.users.find(
    u => u.id !== user.id && u.withdrawNumber === normalizedWithdrawNumber
  );
  if (duplicateNumberUser) {
    return res.status(400).json({
      error: 'এই উইথড্র নম্বরটি ইতিমধ্যে অন্য একটি অ্যাকাউন্টে ব্যবহার করা হয়েছে। প্রতিটি অ্যাকাউন্টের জন্য ভিন্ন উইথড্র নম্বর আবশ্যক।',
    });
  }

  const salt = bcrypt.genSaltSync(10);
  user.withdrawMethod = paymentMethod;
  user.withdrawNumber = normalizedWithdrawNumber;
  user.withdrawPasswordHash = bcrypt.hashSync(withdrawPassword, salt);
  user.withdrawSetupDone = true;

  saveStore();

  return res.json({
    success: true,
    message: 'Withdraw account setup completed and permanently locked.',
    withdrawMethod: user.withdrawMethod,
    withdrawNumber: user.withdrawNumber,
  });
});

// ==========================================
// VIDEO TASK SYSTEM (LOCKED: 10s Countdown)
// ==========================================
router.get('/tasks/today', authenticateUser, async (req: Request, res: Response) => {
  const tokenUser = (req as any).user;
  let store = getStore();
  let user = store.users.find(u => u.id === tokenUser.id || (tokenUser.phone && u.phone === tokenUser.phone));
  if (!user) {
    await reloadStoreFromMongoIfStale(true).catch(() => {});
    store = getStore();
    user = store.users.find(u => u.id === tokenUser.id || (tokenUser.phone && u.phone === tokenUser.phone));
  }
  if (!user) return res.status(404).json({ error: 'User not found' });

  const todayStr = new Date().toISOString().split('T')[0];
  const dayOfWeek = new Date().getDay(); // 0 is Sunday

  // Sunday off-day check
  const isSundayOff = store.settings.sundayIsOffDay && dayOfWeek === 0;

  // Holiday check
  const activeHoliday = store.holidays.find(h => h.date === todayStr && h.tasksDisabled);

  if (isSundayOff || activeHoliday) {
    return res.json({
      tasksDisabled: true,
      reason: activeHoliday
        ? `Official Holiday: ${activeHoliday.name}. ${activeHoliday.reason}`
        : 'Sunday Maintenance Day: Daily task servers are resting today.',
      tasks: [],
      completedCount: 0,
      totalAllowed: 0,
      todayEarned: 0,
    });
  }

  // Free trial expiration check
  if (user.isTrial) {
    if (user.trialExpired || user.trialDaysUsed >= 4) {
      return res.json({
        tasksDisabled: true,
        reason: 'Your 4-day free trial has expired. Purchase Bronze, Golden, or Diamond package to continue earning.',
        tasks: [],
        completedCount: 0,
        totalAllowed: 0,
        todayEarned: user.trialTotalEarned,
        isTrialExpired: true,
      });
    }
  }

  const pkg = store.packages.find(p => p.id === (user.activePackageId || 'pkg_trial')) || store.packages[0];

  // Completed tasks today
  const todayTasks = store.taskHistories.filter(
    th => th.userId === user.id && th.completedAt.startsWith(todayStr)
  );

  const completedCount = todayTasks.length;
  const totalAllowed = pkg.videosPerDay;
  const remainingCount = Math.max(0, totalAllowed - completedCount);

  const completedTaskIds = new Set(todayTasks.map(th => th.taskId));

  // Return available video tasks
  return res.json({
    tasksDisabled: false,
    package: pkg,
    completedCount,
    totalAllowed,
    remainingCount,
    todayEarned: todayTasks.reduce((acc, t) => acc + t.rewardEarned, 0),
    tasks: store.videoTasks.map(vt => ({
      ...vt,
      durationSeconds: 10, // Strictly locked to 10 seconds!
      rewardAmount: pkg.incomePerVideo,
      isCompletedToday: completedTaskIds.has(vt.id),
    })),
  });
});

// Complete Video Task (Reward After Countdown)
router.post('/tasks/complete', financialRateLimiter, authenticateUser, async (req: Request, res: Response) => {
  const tokenUser = (req as any).user;
  const { taskId, watchDurationSeconds } = req.body;

  // Strict 10-second check
  if (!watchDurationSeconds || watchDurationSeconds < 9.5) {
    return res.status(400).json({ error: 'পুরো ১০ সেকেন্ড ভিডিওটি দেখা আবশ্যক।' });
  }

  // Mutex lock to prevent double-claim race condition
  if (activeTaskLocks.has(tokenUser.id)) {
    return res.status(429).json({ error: 'একটি টাস্ক বর্তমানে প্রক্রিয়াধীন রয়েছে। অনুগ্রহ করে অপেক্ষা করুন।' });
  }

  activeTaskLocks.add(tokenUser.id);

  try {
    let store = getStore();
    let user = store.users.find(u => u.id === tokenUser.id || (tokenUser.phone && u.phone === tokenUser.phone));
    const targetUserId = user ? user.id : '';
    let wallet = targetUserId ? store.wallets.find(w => w.userId === targetUserId) : null;
    if (!user || !wallet) {
      await reloadStoreFromMongoIfStale(true).catch(() => {});
      store = getStore();
      user = store.users.find(u => u.id === tokenUser.id || (tokenUser.phone && u.phone === tokenUser.phone));
      const recheckedUserId = user ? user.id : '';
      wallet = recheckedUserId ? store.wallets.find(w => w.userId === recheckedUserId) : null;
    }

    if (!user || !wallet) {
      activeTaskLocks.delete(tokenUser.id);
      return res.status(404).json({ error: 'ইউজার বা ওয়ালেট পাওয়া যায়নি।' });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const pkg = store.packages.find(p => p.id === (user.activePackageId || 'pkg_trial')) || store.packages[0];

    // Check today completed count
    const todayTasks = store.taskHistories.filter(
      th => th.userId === user.id && th.completedAt.startsWith(todayStr)
    );

    if (todayTasks.length >= pkg.videosPerDay) {
      activeTaskLocks.delete(tokenUser.id);
      return res.status(400).json({ error: `আজকের দৈনিক ভিডিও টাস্কের সীমা পূর্ণ হয়েছে (${pkg.name} প্যাকেজে প্রতিদিন ${pkg.videosPerDay}টি ভিডিও)।` });
    }

    const reward = pkg.incomePerVideo;

    // Free trial limits: Daily income 25 TK, Max total 100 TK
    if (user.isTrial) {
      if (user.trialTotalEarned + reward > 100) {
        activeTaskLocks.delete(tokenUser.id);
        return res.status(400).json({ error: 'ফ্রি ট্রায়ালের সর্বোচ্চ উপার্জনের সীমা (১০০ টাকা) পূর্ণ হয়েছে।' });
      }
      user.trialTotalEarned += reward;
      if (todayTasks.length === 0) {
        user.trialDaysUsed += 1;
      }
    }

    // Wallet update
    wallet.balance += reward;
    wallet.totalEarned += reward;
    wallet.todayIncome += reward;
    wallet.updatedAt = new Date().toISOString();

    // Task history
    const historyItem: TaskHistory = {
      id: `th_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: user.id,
      taskId: taskId || 'task_vid_1',
      packageId: pkg.id,
      rewardEarned: reward,
      completedAt: new Date().toISOString(),
      ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '103.205.71.1',
    };
    store.taskHistories.push(historyItem);

    // Transaction passbook entry
    store.transactions.push({
      id: `tx_${Date.now()}`,
      userId: user.id,
      type: 'task_reward',
      amount: reward,
      description: `10s Video Task Reward (${pkg.name})`,
      balanceAfter: wallet.balance,
      createdAt: new Date().toISOString(),
      referenceId: historyItem.id,
    });

    // Video Commission for upline ONLY for PAID USERS
    if (!user.isTrial && user.referredBy) {
      const uplineA = store.users.find(u => u.referralCode === user.referredBy);
      if (uplineA && !uplineA.isTrial) {
        const commA = (reward * store.settings.levelAPercentage) / 100;
        const walletA = store.wallets.find(w => w.userId === uplineA.id);
        if (walletA) {
          walletA.balance += commA;
          walletA.referralIncome += commA;
          walletA.totalEarned += commA;
          walletA.updatedAt = new Date().toISOString();

          store.referralCommissions.push({
            id: `refcomm_${Date.now()}`,
            fromUserId: user.id,
            fromUserPhone: user.phone,
            toUserId: uplineA.id,
            level: 'A',
            type: 'video_commission',
            percentage: store.settings.levelAPercentage,
            commissionAmount: commA,
            createdAt: new Date().toISOString(),
          });

          emitWalletUpdated(uplineA.id, walletA);
          emitReferralCommission(uplineA.id, {
            amount: commA,
            from: user.phone,
            level: 'A',
            type: 'Video Commission',
          });
        }

        // Level B upline
        if (uplineA.referredBy) {
          const uplineB = store.users.find(u => u.referralCode === uplineA.referredBy);
          if (uplineB && !uplineB.isTrial) {
            const commB = (reward * store.settings.levelBPercentage) / 100;
            const walletB = store.wallets.find(w => w.userId === uplineB.id);
            if (walletB) {
              walletB.balance += commB;
              walletB.referralIncome += commB;
              walletB.totalEarned += commB;
              walletB.updatedAt = new Date().toISOString();
              emitWalletUpdated(uplineB.id, walletB);
            }
          }
        }
      }
    }

    await saveStoreAsync();

    // Socket.IO real-time triggers
    emitWalletUpdated(user.id, wallet);
    emitTaskCompleted(user.id, {
      reward,
      newBalance: wallet.balance,
      completedToday: todayTasks.length + 1,
      totalAllowed: pkg.videosPerDay,
    });

    return res.json({
      success: true,
      rewardEarned: reward,
      newBalance: wallet.balance,
      completedToday: todayTasks.length + 1,
      remainingCount: Math.max(0, pkg.videosPerDay - (todayTasks.length + 1)),
    });
  } finally {
    activeTaskLocks.delete(tokenUser.id);
  }
});

// ==========================================
// WALLET & DEPOSIT SYSTEM
// ==========================================
router.get('/wallet/overview', authenticateUser, (req: Request, res: Response) => {
  const tokenUser = (req as any).user;
  const store = getStore();
  const wallet = store.wallets.find(w => w.userId === tokenUser.id);
  const user = store.users.find(u => u.id === tokenUser.id);

  if (!wallet || !user) return res.status(404).json({ error: 'Wallet not found' });

  const activePackage = store.packages.find(p => p.id === user.activePackageId);

  return res.json({
    wallet,
    user: {
      phone: user.phone,
      role: user.role,
      isTrial: user.isTrial,
      trialTotalEarned: user.trialTotalEarned,
      trialDaysUsed: user.trialDaysUsed,
      withdrawSetupDone: user.withdrawSetupDone,
      withdrawMethod: user.withdrawMethod,
      withdrawNumber: user.withdrawNumber,
    },
    activePackage,
    settings: {
      withdrawOpeningHour: store.settings.withdrawOpeningHour,
      withdrawClosingHour: store.settings.withdrawClosingHour,
      withdrawGloballyEnabled: store.settings.withdrawGloballyEnabled,
    },
  });
});

// Passbook
router.get('/wallet/passbook', authenticateUser, (req: Request, res: Response) => {
  const tokenUser = (req as any).user;
  const store = getStore();
  const transactions = store.transactions
    .filter(t => t.userId === tokenUser.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return res.json({ transactions });
});

// Deposit Numbers (Randomized assignment with copy button)
router.get('/wallet/payment-numbers', authenticateUser, (req: Request, res: Response) => {
  const store = getStore();
  const activeNumbers = store.paymentNumbers.filter(pn => pn.isActive);
  return res.json({ paymentNumbers: activeNumbers });
});

// Create Deposit Request (Min 100 TK, Max 25,000 TK)
router.post('/wallet/deposit', financialRateLimiter, authenticateUser, (req: Request, res: Response) => {
  const tokenUser = (req as any).user;
  const { amount, paymentMethod, assignedNumber, senderNumber, transactionId, screenshotUrl } = req.body;

  if (!isValidPositiveAmount(amount, 100, 25000)) {
    return res.status(400).json({ error: 'ডিপোজিট পরিমাণ ১০০ টাকা থেকে ২৫,০০০ টাকার মধ্যে হতে হবে।' });
  }

  const depositAmount = Number(amount);

  if (!paymentMethod || (paymentMethod !== 'bKash' && paymentMethod !== 'Nagad')) {
    return res.status(400).json({ error: 'পেমেন্ট মেথড হিসেবে বিকাশ (bKash) অথবা নগদ (Nagad) নির্বাচন করা আবশ্যক।' });
  }

  if (!senderNumber || !isValidBdPhone(senderNumber)) {
    return res.status(400).json({ error: 'সঠিক প্রেরক (Sender) ১১ ডিজিটের মোবাইল নম্বর প্রদান করুন।' });
  }

  if (!transactionId || transactionId.trim().length < 6) {
    return res.status(400).json({ error: 'সঠিক ট্রানজেকশন আইডি (TrxID) প্রদান করুন (কমপক্ষে ৬ অক্ষর)।' });
  }

  const store = getStore();
  const user = store.users.find(u => u.id === tokenUser.id);
  if (!user) return res.status(404).json({ error: 'ইউজার পাওয়া যায়নি।' });

  const normalizedTrx = transactionId.trim().toUpperCase();
  const normalizedSender = normalizeBdPhone(senderNumber);

  // PATCH 1 & 5: Check duplicate TrxID across all existing deposits and verified SMS
  const duplicateTrx = store.deposits.find(
    d => d.transactionId.toUpperCase() === normalizedTrx
  );
  if (duplicateTrx || !isTrxUnique(normalizedTrx, paymentMethod)) {
    logFraud({
      type: 'duplicate_trx',
      severity: 'high',
      trxId: normalizedTrx,
      userId: user.id,
      userPhone: user.phone,
      senderNumber: normalizedSender,
      details: `Duplicate TrxID submitted: ${normalizedTrx}. Already registered on the platform.`,
    });
    return res.status(400).json({ error: 'এই ট্রানজেকশন আইডি (TrxID) ইতিপূর্বে প্ল্যাটফর্মে জমা বা ক্রেডিট করা হয়েছে।' });
  }

  // PATCH 5: Duplicate Deposit Protection (Pending with same Amount and Sender Number)
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  const duplicatePending = store.deposits.find(
    d =>
      d.status === 'pending' &&
      d.amount === depositAmount &&
      normalizeBdPhone(d.senderNumber) === normalizedSender &&
      new Date(d.createdAt).getTime() > tenMinutesAgo
  );
  if (duplicatePending) {
    logFraud({
      type: 'duplicate_deposit_spam',
      severity: 'medium',
      trxId: normalizedTrx,
      userId: user.id,
      userPhone: user.phone,
      senderNumber: normalizedSender,
      details: `Duplicate pending deposit rejected: same amount (৳${depositAmount}) and sender (${normalizedSender}) within 10 minutes.`,
    });
    return res.status(400).json({
      error: 'একই পরিমাণ ও একই প্রেরক নম্বরের একটি ডিপোজিট রিকোয়েস্ট প্রক্রিয়াধীন রয়েছে। অনুগ্রহ করে ভেরিফিকেশন সম্পন্ন হওয়া পর্যন্ত অপেক্ষা করুন।',
    });
  }

  const depositReq: DepositRequest = {
    id: `dep_${Date.now()}`,
    userId: user.id,
    userPhone: user.phone,
    amount: depositAmount,
    paymentMethod,
    assignedNumber: assignedNumber || (paymentMethod === 'bKash' ? '01712345678' : '01823456789'),
    senderNumber: normalizeBdPhone(senderNumber),
    transactionId: transactionId.trim().toUpperCase(),
    screenshotUrl: screenshotUrl || '',
    status: 'pending',
    verificationType: 'auto', // Default is auto-verification as mandated
    createdAt: new Date().toISOString(),
  };

  // Update payment number volume count
  const pn = store.paymentNumbers.find(p => p.number === depositReq.assignedNumber);
  if (pn) {
    pn.usageCount += 1;
    pn.currentDailyVolume += depositAmount;
  }

  store.deposits.push(depositReq);
  saveStore();

  // ATTEMPT INSTANT AUTO-VERIFICATION
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const outcome = attemptAutoVerification(depositReq, clientIp);

  if (outcome.autoVerified) {
    return res.json({
      success: true,
      autoVerified: true,
      status: 'approved',
      message: outcome.message,
      deposit: depositReq,
    });
  }

  emitDepositStatusChanged(user.id, depositReq);
  emitAdminDashboardUpdated();

  return res.json({
    success: true,
    autoVerified: false,
    status: depositReq.status,
    message: outcome.message || 'Deposit submitted. Waiting for incoming SMS from payment gateway.',
    deposit: depositReq,
  });
});

// Deposit History
router.get('/wallet/deposit-history', authenticateUser, (req: Request, res: Response) => {
  const tokenUser = (req as any).user;
  const store = getStore();
  const history = store.deposits
    .filter(d => d.userId === tokenUser.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return res.json({ deposits: history });
});

// ==========================================
// WITHDRAW SYSTEM (LOCKED RULES & CARDS)
// ==========================================
router.get('/wallet/withdraw-history', authenticateUser, (req: Request, res: Response) => {
  const tokenUser = (req as any).user;
  const store = getStore();
  const history = store.withdraws
    .filter(w => w.userId === tokenUser.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return res.json({ withdraws: history });
});

// Dynamic Withdraw Cards for Users
router.get('/withdraw-cards', (req: Request, res: Response) => {
  const store = getStore();
  const cards = (store.withdrawCards || [])
    .filter(c => c.enabled)
    .sort((a, b) => a.order - b.order || a.amount - b.amount);
  return res.json({ withdrawCards: cards });
});

// Request Withdraw
router.post('/wallet/withdraw', financialRateLimiter, authenticateUser, (req: Request, res: Response) => {
  const tokenUser = (req as any).user;
  const { amount, withdrawPassword, deviceFingerprint } = req.body;

  if (!isValidPositiveAmount(amount, 100, 50000)) {
    return res.status(400).json({ error: 'উইথড্র পরিমাণ সঠিক ও ধনাত্মক সংখ্যা হতে হবে।' });
  }

  const withdrawAmount = Number(amount);

  // Mutex lock for atomic balance deduction (Anti-race condition)
  if (activeWithdrawLocks.has(tokenUser.id)) {
    return res.status(429).json({ error: 'একটি উইথড্রল রিকোয়েস্ট বর্তমানে প্রক্রিয়াধীন রয়েছে। অনুগ্রহ করে অপেক্ষা করুন।' });
  }

  activeWithdrawLocks.add(tokenUser.id);

  try {
    const store = getStore();
    const user = store.users.find(u => u.id === tokenUser.id);
    const wallet = store.wallets.find(w => w.userId === tokenUser.id);

    if (!user || !wallet) {
      activeWithdrawLocks.delete(tokenUser.id);
      return res.status(404).json({ error: 'ইউজার বা ওয়ালেট পাওয়া যায়নি।' });
    }

    // Check withdraw setup done
    if (!user.withdrawSetupDone || !user.withdrawPasswordHash || !user.withdrawNumber || !user.withdrawMethod) {
      activeWithdrawLocks.delete(tokenUser.id);
      return res.status(400).json({ error: 'প্রথমে আপনার উইথড্র মেথড এবং উইথড্র পাসওয়ার্ড সেটআপ সম্পন্ন করুন।' });
    }

    // Global withdraw disable check
    if (!store.settings.withdrawGloballyEnabled) {
      activeWithdrawLocks.delete(tokenUser.id);
      return res.status(400).json({ error: 'সিস্টেম রক্ষণাবেক্ষণের জন্য উইথড্র সাময়িকভাবে বন্ধ আছে।' });
    }

    // Opening hours check
    const currentHour = new Date().getHours();
    if (
      currentHour < store.settings.withdrawOpeningHour ||
      currentHour >= store.settings.withdrawClosingHour
    ) {
      activeWithdrawLocks.delete(tokenUser.id);
      return res.status(400).json({
        error: `উইথড্র সেবা প্রতিদিন সকাল ${store.settings.withdrawOpeningHour}:00 থেকে সন্ধ্যা ${store.settings.withdrawClosingHour}:00 পর্যন্ত চালু থাকে।`,
      });
    }

    // Verify withdraw password
    if (!withdrawPassword || !bcrypt.compareSync(withdrawPassword, user.withdrawPasswordHash)) {
      activeWithdrawLocks.delete(tokenUser.id);
      return res.status(400).json({ error: 'উইথড্র পাসওয়ার্ড সঠিক নয়।' });
    }

    // Daily one withdraw rule
    const todayStr = new Date().toISOString().split('T')[0];
    const userTodayWithdraws = store.withdraws.filter(
      w => w.userId === user.id && w.createdAt.startsWith(todayStr) && w.status !== 'rejected'
    );
    if (userTodayWithdraws.length >= 1) {
      activeWithdrawLocks.delete(tokenUser.id);
      return res.status(400).json({ error: 'প্রতি ক্যালেন্ডার দিনে সর্বোচ্চ ১টি উইথড্র রিকোয়েস্ট অনুমোদিত।' });
    }

    // Free User Withdrawal Rule:
    const isFreeUser = Boolean(user.isTrial || !user.activePackageId || user.activePackageId === 'pkg_trial');
    const isFreeWithdrawPermitted = Boolean(store.settings.allowFreeUserWithdrawal || user.freeWithdrawAllowed);

    if (isFreeUser && !isFreeWithdrawPermitted) {
      activeWithdrawLocks.delete(tokenUser.id);
      return res.status(403).json({
        error: 'আপনার নিয়োগ ব্যবস্থাপকের সঙ্গে যোগাযোগ করুন',
        freeWithdrawBlocked: true,
        contactSupport: true,
        contactReferral: true,
        referredBy: user.referredBy || null,
      });
    }

    // Dynamic Withdraw Cards check from Admin Managed Cards
    const activeCards = (store.withdrawCards || []).filter(c => c.enabled);
    const matchedCard = activeCards.find(c => c.amount === withdrawAmount);

    if (!matchedCard) {
      activeWithdrawLocks.delete(tokenUser.id);
      const availableAmounts = activeCards.map(c => `৳${c.amount}`).join(', ');
      return res.status(400).json({
        error: `অনুগ্রহ করে অনুমোদিত সক্রিয় উইথড্র কার্ড নির্বাচন করুন। সক্রিয় কার্ডসমূহ: ${availableAmounts || 'কোনো কার্ড সক্রিয় নেই'}।`,
      });
    }

    let isTrialWithdraw = false;
    if (isFreeUser) {
      if (matchedCard.isTrialAllowed || withdrawAmount === 100) {
        isTrialWithdraw = true;
        const fp = deviceFingerprint || user.deviceFingerprint;
        const dfRecord = store.deviceFingerprints.find(d => d.deviceFingerprint === fp);
        if (dfRecord && dfRecord.trialWithdrawalCompleted) {
          activeWithdrawLocks.delete(tokenUser.id);
          return res.status(400).json({
            error: 'ডিভাইস সুরক্ষা সতর্কতা: এই ডিভাইস থেকে ইতিমধ্যে ১টি ফ্রি ট্রায়াল উইথড্রল সম্পন্ন হয়েছে।',
          });
        }
      }
    }

    if (wallet.balance < withdrawAmount) {
      activeWithdrawLocks.delete(tokenUser.id);
      return res.status(400).json({ error: `আপনার ওয়ালেটে পর্যাপ্ত ব্যালেন্স নেই। বর্তমান ব্যালেন্স: ${wallet.balance.toFixed(2)} টাকা।` });
    }

    // Withdraw Fee = 10% (LOCKED)
    const fee = (withdrawAmount * 10) / 100;
    const netAmount = withdrawAmount - fee;

    // Deduct balance instantly
    wallet.balance -= withdrawAmount;
    wallet.totalWithdraw += withdrawAmount;
    wallet.updatedAt = new Date().toISOString();

    const withdrawReq: WithdrawRequest = {
      id: `wdr_${Date.now()}`,
      userId: user.id,
      userPhone: user.phone,
      amount: withdrawAmount,
      fee,
      netAmount,
      paymentMethod: user.withdrawMethod,
      withdrawNumber: user.withdrawNumber,
      status: 'pending',
      isTrialWithdraw,
      deviceFingerprint: deviceFingerprint || user.deviceFingerprint,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      timeline: [
        {
          step: 'pending',
          timestamp: new Date().toISOString(),
          note: `Withdrawal request of ${withdrawAmount} TK submitted to ${user.withdrawMethod} ${user.withdrawNumber}`,
        },
      ],
    };

    store.withdraws.push(withdrawReq);

    // If trial withdraw, mark device fingerprint
    if (isTrialWithdraw) {
      const fp = deviceFingerprint || user.deviceFingerprint;
      let dfRecord = store.deviceFingerprints.find(d => d.deviceFingerprint === fp);
      if (dfRecord) {
        dfRecord.trialWithdrawalCompleted = true;
        dfRecord.trialWithdrawalDate = new Date().toISOString();
        dfRecord.trialWithdrawalAmount = 100;
      }
    }

    // Passbook entry
    store.transactions.push({
      id: `tx_${Date.now()}`,
      userId: user.id,
      type: 'withdraw',
      amount: -withdrawAmount,
      fee,
      description: `Withdraw Request to ${user.withdrawMethod} (${netAmount} TK after 10% fee)`,
      balanceAfter: wallet.balance,
      createdAt: new Date().toISOString(),
      referenceId: withdrawReq.id,
    });

    saveStore();

    emitWalletUpdated(user.id, wallet);
    emitWithdrawStatusChanged(user.id, withdrawReq);
    emitAdminDashboardUpdated();

    return res.json({
      success: true,
      message: 'Withdrawal request submitted successfully.',
      withdraw: withdrawReq,
      newBalance: wallet.balance,
    });
  } finally {
    activeWithdrawLocks.delete(tokenUser.id);
  }
});

// ==========================================
// PACKAGE PURCHASE (ONLY WALLET BALANCE!)
// ==========================================
router.get('/packages', (req: Request, res: Response) => {
  const store = getStore();
  const activePackages = store.packages.filter(p => p.enabled && p.id !== 'pkg_trial');
  return res.json({ packages: activePackages });
});

router.post('/packages/purchase', authenticateUser, (req: Request, res: Response) => {
  const tokenUser = (req as any).user;
  const { packageId } = req.body;

  const store = getStore();
  const user = store.users.find(u => u.id === tokenUser.id);
  const wallet = store.wallets.find(w => w.userId === tokenUser.id);
  const pkg = store.packages.find(p => p.id === packageId && p.enabled);

  if (!user || !wallet) return res.status(404).json({ error: 'ইউজার বা ওয়ালেট পাওয়া যায়নি।' });
  if (!pkg) return res.status(404).json({ error: 'নির্বাচিত প্যাকেজটি বর্তমানে উপলব্ধ নেই।' });

  if (pkg.price <= 0) {
    return res.status(400).json({ error: 'ভুল প্যাকেজ নির্বাচন।' });
  }

  // Rule: Packages purchased ONLY using Wallet Balance!
  if (wallet.balance < pkg.price) {
    return res.status(400).json({
      error: `প্যাকেজ কেনার জন্য পর্যাপ্ত ওয়ালেট ব্যালেন্স নেই। প্যাকেজের মূল্য ৳${pkg.price.toLocaleString()} টাকা, আপনার বর্তমান ব্যালেন্স ৳${wallet.balance.toLocaleString()} টাকা। অনুগ্রহ করে প্রথমে ওয়ালেটে ডিপোজিট করুন।`,
    });
  }

  // Wallet deducted instantly
  wallet.balance -= pkg.price;
  wallet.updatedAt = new Date().toISOString();

  // Package activated instantly after purchase
  user.activePackageId = pkg.id;
  user.packageActivatedAt = new Date().toISOString();
  user.isTrial = false; // Becomes paid user!
  user.trialExpired = true;

  // If user role was Member, upgrade to Manager if higher tier
  if (pkg.price >= 22500 && user.role === 'Member') {
    user.role = 'Manager';
  }

  // Transaction passbook entry
  store.transactions.push({
    id: `tx_${Date.now()}`,
    userId: user.id,
    type: 'package_purchase',
    amount: -pkg.price,
    description: `Purchased ${pkg.name} Package (${pkg.dailyIncome} TK daily / ${pkg.videosPerDay} videos)`,
    balanceAfter: wallet.balance,
    createdAt: new Date().toISOString(),
    referenceId: pkg.id,
  });

  // Referral package commission for uplines
  if (user.referredBy) {
    const uplineA = store.users.find(u => u.referralCode === user.referredBy);
    if (uplineA) {
      const bonusA = (pkg.price * store.settings.levelAPercentage) / 100;
      const walletA = store.wallets.find(w => w.userId === uplineA.id);
      if (walletA) {
        walletA.balance += bonusA;
        walletA.referralIncome += bonusA;
        walletA.totalEarned += bonusA;
        walletA.updatedAt = new Date().toISOString();

        store.referralCommissions.push({
          id: `ref_pkg_${Date.now()}`,
          fromUserId: user.id,
          fromUserPhone: user.phone,
          toUserId: uplineA.id,
          level: 'A',
          type: 'package_bonus',
          percentage: store.settings.levelAPercentage,
          commissionAmount: bonusA,
          createdAt: new Date().toISOString(),
        });

        store.transactions.push({
          id: `tx_${Date.now()}_ref`,
          userId: uplineA.id,
          type: 'referral_bonus',
          amount: bonusA,
          description: `Level A Referral Bonus from ${user.phone} (${pkg.name} purchase)`,
          balanceAfter: walletA.balance,
          createdAt: new Date().toISOString(),
        });

        emitWalletUpdated(uplineA.id, walletA);
        emitReferralCommission(uplineA.id, {
          amount: bonusA,
          from: user.phone,
          level: 'A',
          type: 'Package Purchase Bonus',
        });
      }
    }
  }

  // Notification
  store.notifications.push({
    id: `notif_${Date.now()}`,
    userId: user.id,
    type: 'task',
    title: `${pkg.name} Package Activated!`,
    message: `Congratulations! Your ${pkg.name} package is active. You can now watch ${pkg.videosPerDay} videos daily for ${pkg.dailyIncome} TK.`,
    isRead: false,
    createdAt: new Date().toISOString(),
  });

  saveStore();

  emitWalletUpdated(user.id, wallet);
  emitNotificationNew(user.id, store.notifications[store.notifications.length - 1]);
  emitAdminDashboardUpdated();

  return res.json({
    success: true,
    message: `${pkg.name} package purchased and activated successfully!`,
    activePackage: pkg,
    newBalance: wallet.balance,
  });
});

// ==========================================
// REFERRAL SYSTEM
// ==========================================
router.get('/referral/summary', authenticateUser, (req: Request, res: Response) => {
  const tokenUser = (req as any).user;
  const store = getStore();
  const user = store.users.find(u => u.id === tokenUser.id);
  const wallet = store.wallets.find(w => w.userId === tokenUser.id);
  if (!user || !wallet) return res.status(404).json({ error: 'User not found' });

  // Level A members: directly referred by user.referralCode
  const levelAUsers = store.users.filter(u => u.referredBy === user.referralCode);
  const levelACodes = levelAUsers.map(u => u.referralCode);

  // Level B members
  const levelBUsers = store.users.filter(u => u.referredBy && levelACodes.includes(u.referredBy));
  const levelBCodes = levelBUsers.map(u => u.referralCode);

  // Level C members
  const levelCUsers = store.users.filter(u => u.referredBy && levelBCodes.includes(u.referredBy));

  const mapMember = (m: User, level: 'A' | 'B' | 'C') => {
    const pkg = store.packages.find(p => p.id === m.activePackageId);
    const comms = store.referralCommissions
      .filter(c => c.toUserId === user.id && c.fromUserId === m.id)
      .reduce((acc, c) => acc + c.commissionAmount, 0);

    return {
      userId: m.id,
      phone: `${m.phone.slice(0, 4)}***${m.phone.slice(-3)}`,
      role: m.role,
      level,
      joinedAt: m.createdAt,
      activePackageName: pkg ? pkg.name : (m.isTrial ? 'Free Trial' : 'None'),
      commissionEarnedForUpline: comms,
    };
  };

  const commissions = store.referralCommissions
    .filter(c => c.toUserId === user.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Salary requirements progress:
  // Active team members needed: Manager (10), Senior Manager (25), VIP (50)
  const paidTeamMembersCount = [...levelAUsers, ...levelBUsers, ...levelCUsers].filter(u => !u.isTrial).length;
  let salaryTarget = 10;
  let salaryRole = 'Manager (5,000 TK/mo)';
  if (paidTeamMembersCount >= 25) {
    salaryTarget = 50;
    salaryRole = 'VIP (25,000 TK/mo)';
  } else if (paidTeamMembersCount >= 10) {
    salaryTarget = 25;
    salaryRole = 'Senior Manager (12,000 TK/mo)';
  }

  return res.json({
    referralCode: user.referralCode,
    totalReferralEarnings: wallet.referralIncome,
    teamCounts: {
      total: levelAUsers.length + levelBUsers.length + levelCUsers.length,
      levelA: levelAUsers.length,
      levelB: levelBUsers.length,
      levelC: levelCUsers.length,
      paidCount: paidTeamMembersCount,
    },
    percentages: {
      levelA: store.settings.levelAPercentage,
      levelB: store.settings.levelBPercentage,
      levelC: store.settings.levelCPercentage,
    },
    teamMembers: [
      ...levelAUsers.map(u => mapMember(u, 'A')),
      ...levelBUsers.map(u => mapMember(u, 'B')),
      ...levelCUsers.map(u => mapMember(u, 'C')),
    ],
    commissions: commissions.slice(0, 20),
    salaryProgress: {
      currentCount: paidTeamMembersCount,
      targetCount: salaryTarget,
      percentage: Math.min(100, Math.round((paidTeamMembersCount / salaryTarget) * 100)),
      nextRole: salaryRole,
    },
  });
});

router.get('/referral/team', authenticateUser, (req: Request, res: Response) => {
  const tokenUser = (req as any).user;
  const store = getStore();
  const user = store.users.find(u => u.id === tokenUser.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Level A members: directly referred by user.referralCode
  const levelAUsers = store.users.filter(u => u.referredBy === user.referralCode);
  const levelACodes = levelAUsers.map(u => u.referralCode);

  // Level B members
  const levelBUsers = store.users.filter(u => u.referredBy && levelACodes.includes(u.referredBy));
  const levelBCodes = levelBUsers.map(u => u.referralCode);

  // Level C members
  const levelCUsers = store.users.filter(u => u.referredBy && levelBCodes.includes(u.referredBy));

  const formatMember = (m: User) => {
    const pkg = store.packages.find(p => p.id === m.activePackageId);
    return {
      id: m.id,
      phone: m.phone,
      role: m.role,
      hasActivePackage: Boolean(m.activePackageId && !m.isTrial),
      packageName: pkg ? pkg.name : (m.isTrial ? 'Free Trial' : 'None'),
      isTrial: Boolean(m.isTrial),
      createdAt: m.createdAt,
    };
  };

  return res.json({
    levelA: levelAUsers.map(formatMember),
    levelB: levelBUsers.map(formatMember),
    levelC: levelCUsers.map(formatMember),
  });
});

// ==========================================
// PROMOTIONS & CAMPAIGNS
// ==========================================
router.get('/promotions', (req: Request, res: Response) => {
  const store = getStore();
  const activeCampaigns = store.campaigns.filter(c => c.isActive);
  return res.json({ campaigns: activeCampaigns });
});

router.post('/promotions/claim-code', authenticateUser, (req: Request, res: Response) => {
  const tokenUser = (req as any).user;
  const { code } = req.body;

  if (!code) return res.status(400).json({ error: 'প্রমো কোড প্রদান করা আবশ্যক।' });

  const store = getStore();
  const user = store.users.find(u => u.id === tokenUser.id);
  const wallet = store.wallets.find(w => w.userId === tokenUser.id);
  if (!user || !wallet) return res.status(404).json({ error: 'ইউজার বা ওয়ালেট পাওয়া যায়নি।' });

  const promo = store.promoCodes.find(
    p => p.code.toUpperCase() === code.trim().toUpperCase() && p.isActive
  );

  if (!promo) {
    return res.status(400).json({ error: 'প্রমো কোডটি সঠিক নয় অথবা এর মেয়াদ শেষ হয়ে গেছে।' });
  }

  if (promo.currentUsage >= promo.maxUsage) {
    return res.status(400).json({ error: 'এই প্রমো কোড ব্যবহারের সর্বোচ্চ সীমা শেষ হয়েছে।' });
  }

  // Check if user already claimed this promo
  const alreadyClaimed = store.transactions.find(
    t => t.userId === user.id && t.type === 'promo_code' && t.referenceId === promo.id
  );
  if (alreadyClaimed) {
    return res.status(400).json({ error: 'আপনি ইতিমধ্যে এই প্রমো কোডটি গ্রহণ করেছেন।' });
  }

  promo.currentUsage += 1;
  wallet.balance += promo.rewardAmount;
  wallet.giftIncome += promo.rewardAmount;
  wallet.totalEarned += promo.rewardAmount;
  wallet.updatedAt = new Date().toISOString();

  store.transactions.push({
    id: `tx_${Date.now()}`,
    userId: user.id,
    type: 'promo_code',
    amount: promo.rewardAmount,
    description: `Promo Code Redeemed: ${promo.code}`,
    balanceAfter: wallet.balance,
    createdAt: new Date().toISOString(),
    referenceId: promo.id,
  });

  store.notifications.push({
    id: `notif_${Date.now()}`,
    userId: user.id,
    type: 'gift',
    title: 'Promo Reward Credited!',
    message: `${promo.rewardAmount} TK added to your wallet from promo code ${promo.code}.`,
    isRead: false,
    createdAt: new Date().toISOString(),
  });

  saveStore();

  emitWalletUpdated(user.id, wallet);
  emitNotificationNew(user.id, store.notifications[store.notifications.length - 1]);

  return res.json({
    success: true,
    message: `Promo code redeemed! +${promo.rewardAmount} TK credited to your wallet.`,
    rewardAmount: promo.rewardAmount,
    newBalance: wallet.balance,
  });
});

// Notifications
router.get('/notifications', authenticateUser, (req: Request, res: Response) => {
  const tokenUser = (req as any).user;
  const store = getStore();
  const list = store.notifications
    .filter(n => n.userId === tokenUser.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return res.json({ notifications: list });
});

router.post('/notifications/mark-read', authenticateUser, (req: Request, res: Response) => {
  const tokenUser = (req as any).user;
  const store = getStore();
  store.notifications
    .filter(n => n.userId === tokenUser.id)
    .forEach(n => {
      n.isRead = true;
    });
  saveStore();
  return res.json({ success: true });
});

// Settings & Branding
router.get('/settings/public', (req: Request, res: Response) => {
  const store = getStore();
  return res.json({
    settings: store.settings,
    todayIsHoliday: store.holidays.some(
      h => h.date === new Date().toISOString().split('T')[0] && h.tasksDisabled
    ),
    onlineUsers: getOnlineUserCount(),
  });
});

// ==========================================
// ADMIN CRM ENTERPRISE API ROUTES
// ==========================================

// 1. Admin Dashboard Live Cards
router.get('/admin/dashboard-stats', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();

  const totalUsers = store.users.length;
  const activeUsers = store.users.filter(u => u.status === 'active').length;
  const freeTrialUsers = store.users.filter(u => u.isTrial).length;
  const activePaidUsers = store.users.filter(u => !u.isTrial && u.activePackageId).length;

  const totalDeposit = store.deposits
    .filter(d => d.status === 'approved')
    .reduce((acc, d) => acc + d.amount, 0);

  const totalWithdraw = store.withdraws
    .filter(w => w.status === 'paid' || w.status === 'approved')
    .reduce((acc, w) => acc + w.amount, 0);

  const withdrawFeeRevenue = store.withdraws
    .filter(w => w.status === 'paid' || w.status === 'approved')
    .reduce((acc, w) => acc + w.fee, 0);

  const totalReferralBonus = store.referralCommissions.reduce((acc, r) => acc + r.commissionAmount, 0);

  const todayStr = new Date().toISOString().split('T')[0];
  const todayRevenue = store.deposits
    .filter(d => d.status === 'approved' && d.createdAt.startsWith(todayStr))
    .reduce((acc, d) => acc + d.amount, 0);

  return res.json({
    stats: {
      totalUsers,
      activeUsers,
      freeTrialUsers,
      activePaidUsers,
      totalDeposit,
      totalWithdraw,
      withdrawFeeRevenue,
      totalReferralBonus,
      todayRevenue,
      onlineUsers: getOnlineUserCount(),
    },
    pendingDepositsCount: store.deposits.filter(d => d.status === 'pending').length,
    pendingWithdrawsCount: store.withdraws.filter(w => w.status === 'pending').length,
    recentDeposits: store.deposits.slice(-5).reverse(),
    recentWithdraws: store.withdraws.slice(-5).reverse(),
  });
});

// 2. User CRM: Search & Detail
router.get('/admin/users', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const { search, role, status } = req.query;

  let filtered = [...store.users];

  if (search && typeof search === 'string') {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(u => u.phone.includes(q) || u.referralCode.toLowerCase().includes(q));
  }

  if (role && typeof role === 'string' && role !== 'all') {
    filtered = filtered.filter(u => u.role === role);
  }

  if (status && typeof status === 'string' && status !== 'all') {
    filtered = filtered.filter(u => u.status === status);
  }

  const enriched = filtered.map(u => {
    const wallet = store.wallets.find(w => w.userId === u.id);
    const pkg = store.packages.find(p => p.id === u.activePackageId);
    return {
      id: u.id,
      phone: u.phone,
      role: u.role,
      status: u.status,
      referralCode: u.referralCode,
      referredBy: u.referredBy,
      isTrial: u.isTrial,
      freeWithdrawAllowed: Boolean(u.freeWithdrawAllowed),
      trialDaysUsed: u.trialDaysUsed,
      activePackageName: pkg ? pkg.name : (u.isTrial ? 'Free Trial' : 'None'),
      balance: wallet ? wallet.balance : 0,
      totalDeposit: wallet ? wallet.totalDeposit : 0,
      totalWithdraw: wallet ? wallet.totalWithdraw : 0,
      deviceFingerprint: u.deviceFingerprint,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    };
  });

  return res.json({ users: enriched });
});

// User CRM Profile Detail - Complete Dossier
router.get('/admin/users/:id', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const user = store.users.find(u => u.id === req.params.id || u.phone === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const wallet = store.wallets.find(w => w.userId === user.id) || {
    userId: user.id,
    balance: 0,
    pendingBalance: 0,
    totalDeposit: 0,
    totalWithdraw: 0,
    taskIncome: 0,
    referralIncome: 0,
    giftIncome: 0,
    salaryIncome: 0,
  };

  const deposits = store.deposits
    .filter(d => d.userId === user.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const withdraws = store.withdraws
    .filter(w => w.userId === user.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const userTransactions = (store.transactions || [])
    .filter(t => t.userId === user.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 30);

  const pkg = store.packages.find(p => p.id === user.activePackageId);

  // 3-Tier Referral Tree Computation
  // Level A: Directly referred by user.referralCode
  const levelAUsers = store.users.filter(u => u.referredBy === user.referralCode);
  const levelACodes = levelAUsers.map(u => u.referralCode);

  // Level B: Referred by Level A members
  const levelBUsers = store.users.filter(u => u.referredBy && levelACodes.includes(u.referredBy));
  const levelBCodes = levelBUsers.map(u => u.referralCode);

  // Level C: Referred by Level B members
  const levelCUsers = store.users.filter(u => u.referredBy && levelBCodes.includes(u.referredBy));

  const formatTeamMember = (m: User, levelTag: 'A' | 'B' | 'C') => {
    const memberPkg = store.packages.find(p => p.id === m.activePackageId);
    const memberWallet = store.wallets.find(w => w.userId === m.id);
    return {
      id: m.id,
      phone: m.phone,
      role: m.role || 'Member',
      level: levelTag,
      isTrial: m.isTrial,
      packageName: memberPkg ? memberPkg.name : (m.isTrial ? 'Free Trial' : 'No Package'),
      balance: memberWallet ? memberWallet.balance : 0,
      totalDeposit: memberWallet ? memberWallet.totalDeposit : 0,
      joinedAt: m.createdAt,
      status: m.isBanned ? 'banned' : (m.status || 'active'),
    };
  };

  const levelAList = levelAUsers.map(m => formatTeamMember(m, 'A'));
  const levelBList = levelBUsers.map(m => formatTeamMember(m, 'B'));
  const levelCList = levelCUsers.map(m => formatTeamMember(m, 'C'));

  const totalCommissions = (store.referralCommissions || [])
    .filter(c => c.toUserId === user.id)
    .reduce((acc, c) => acc + (c.commissionAmount || 0), 0);

  const approvedDepositsTotal = deposits
    .filter(d => d.status === 'approved')
    .reduce((sum, d) => sum + d.amount, 0);

  const approvedWithdrawsTotal = withdraws
    .filter(w => w.status === 'approved' || w.status === 'paid')
    .reduce((sum, w) => sum + w.amount, 0);

  const pendingDepositsTotal = deposits
    .filter(d => d.status === 'pending')
    .reduce((sum, d) => sum + d.amount, 0);

  const pendingWithdrawsTotal = withdraws
    .filter(w => w.status === 'pending')
    .reduce((sum, w) => sum + w.amount, 0);

  const { passwordHash: _, withdrawPasswordHash: __, ...safeUser } = user;

  return res.json({
    user: {
      ...safeUser,
      activePackageName: pkg ? pkg.name : (user.isTrial ? 'Free Trial' : 'None'),
      withdrawSetupDone: Boolean(user.withdrawSetupDone || (user.withdrawMethod && user.withdrawNumber)),
      hasWithdrawPassword: Boolean(user.withdrawPasswordHash),
    },
    wallet,
    activePackage: pkg || null,
    financialSummary: {
      totalDeposited: approvedDepositsTotal,
      totalWithdrawn: approvedWithdrawsTotal,
      pendingDepositAmount: pendingDepositsTotal,
      pendingWithdrawAmount: pendingWithdrawsTotal,
      depositCount: deposits.length,
      withdrawCount: withdraws.length,
      taskIncome: wallet.taskIncome || 0,
      referralIncome: wallet.referralIncome || 0,
      giftIncome: wallet.giftIncome || 0,
      salaryIncome: wallet.salaryIncome || 0,
      totalCommissionEarned: totalCommissions,
    },
    withdrawAccount: {
      paymentMethod: user.withdrawMethod || null,
      withdrawNumber: user.withdrawNumber || null,
      isConfigured: Boolean(user.withdrawMethod && user.withdrawNumber),
      isPasswordProtected: Boolean(user.withdrawPasswordHash),
    },
    referralBreakdown: {
      levelA: { count: levelAList.length, members: levelAList },
      levelB: { count: levelBList.length, members: levelBList },
      levelC: { count: levelCList.length, members: levelCList },
      totalTeamCount: levelAList.length + levelBList.length + levelCList.length,
      totalCommissionEarned: totalCommissions,
    },
    recentDeposits: deposits.slice(0, 15),
    recentWithdrawals: withdraws.slice(0, 15),
    recentTransactions: userTransactions,
  });
});

// Admin User Actions: Balance adjustment, role change, status toggle, withdraw reset
router.post('/admin/users/:id/action', authenticateAdmin, (req: Request, res: Response) => {
  const adminUser = (req as any).user || (req as any).admin || { id: 'admin', name: 'Admin' };
  const store = getStore();
  const user = store.users.find(u => u.id === req.params.id || u.phone === req.params.id);
  const wallet = user ? store.wallets.find(w => w.userId === user.id) : null;
  if (!user || !wallet) return res.status(404).json({ error: 'User or wallet not found' });

  const { action, amount, reason, role, newPassword, packageId } = req.body;

  if (action === 'add_balance') {
    const val = Number(amount);
    if (!val || val <= 0) return res.status(400).json({ error: 'Valid positive amount required' });
    wallet.balance += val;
    wallet.giftIncome = (wallet.giftIncome || 0) + val;
    wallet.updatedAt = new Date().toISOString();

    store.transactions.push({
      id: `tx_${Date.now()}`,
      userId: user.id,
      type: 'gift',
      amount: val,
      description: `Admin Credit: ${reason || 'Administrative adjustment'}`,
      balanceAfter: wallet.balance,
      createdAt: new Date().toISOString(),
    });

    store.notifications.push({
      id: `notif_${Date.now()}`,
      userId: user.id,
      type: 'gift',
      title: 'Wallet Balance Added by Admin',
      message: `${val} TK has been added to your wallet. Reason: ${reason || 'Admin Credit'}.`,
      isRead: false,
      createdAt: new Date().toISOString(),
    });

    emitWalletUpdated(user.id, wallet);
    emitNotificationNew(user.id, store.notifications[store.notifications.length - 1]);
  } else if (action === 'deduct_balance') {
    const val = Number(amount);
    if (!val || val <= 0 || wallet.balance < val) {
      return res.status(400).json({ error: 'Invalid deduction amount or exceeds user balance' });
    }
    wallet.balance -= val;
    wallet.updatedAt = new Date().toISOString();

    store.transactions.push({
      id: `tx_${Date.now()}`,
      userId: user.id,
      type: 'withdraw',
      amount: -val,
      description: `Admin Deduction: ${reason || 'Administrative correction'}`,
      balanceAfter: wallet.balance,
      createdAt: new Date().toISOString(),
    });

    emitWalletUpdated(user.id, wallet);
  } else if (action === 'assign_role') {
    if (!role) return res.status(400).json({ error: 'Role is required' });
    user.role = role;
  } else if (action === 'toggle_status' || action === 'toggle_ban') {
    user.isBanned = !user.isBanned;
    user.status = user.isBanned ? 'suspended' : 'active';
  } else if (action === 'toggle_free_withdraw') {
    user.freeWithdrawAllowed = !user.freeWithdrawAllowed;
  } else if (action === 'reset_withdraw_account') {
    user.withdrawMethod = undefined as any;
    user.withdrawNumber = undefined as any;
    user.withdrawPasswordHash = undefined as any;
    user.withdrawSetupDone = false;
  } else if (action === 'assign_package') {
    if (!packageId) return res.status(400).json({ error: 'Package ID required' });
    const targetPkg = store.packages.find(p => p.id === packageId);
    if (!targetPkg) return res.status(404).json({ error: 'Package not found' });
    user.activePackageId = targetPkg.id;
    user.isTrial = false;
  } else if (action === 'reset_password') {
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const salt = bcrypt.genSaltSync(10);
    user.passwordHash = bcrypt.hashSync(newPassword, salt);
  }

  // Audit activity log
  store.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name || 'Admin',
    action: `User Action: ${action}`,
    target: user.phone,
    details: reason || `Updated user ${user.phone} (${action})`,
    timestamp: new Date().toISOString(),
  });

  saveStore();
  emitAdminDashboardUpdated();

  return res.json({ success: true, message: `Action ${action} executed successfully`, user, wallet });
});

// Explicit toggle for free withdraw permission for a single user
router.post('/admin/users/:id/toggle-free-withdraw', authenticateAdmin, (req: Request, res: Response) => {
  const adminUser = (req as any).user;
  const store = getStore();
  const user = store.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.freeWithdrawAllowed = !user.freeWithdrawAllowed;

  store.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name || 'Admin',
    action: `Toggle Free Withdraw: ${user.freeWithdrawAllowed ? 'Allowed' : 'Disallowed'}`,
    target: user.phone,
    details: `Toggled free user withdraw permission for ${user.phone} to ${user.freeWithdrawAllowed}`,
    timestamp: new Date().toISOString(),
  });

  saveStore();
  emitAdminDashboardUpdated();

  return res.json({
    success: true,
    message: `User ${user.phone} - Free withdraw permission ${user.freeWithdrawAllowed ? 'ENABLED' : 'DISABLED'}`,
    freeWithdrawAllowed: user.freeWithdrawAllowed,
  });
});

// Admin User Adjust Balance
router.post('/admin/users/:id/balance', authenticateAdmin, (req: Request, res: Response) => {
  const adminUser = (req as any).user || (req as any).admin || { id: 'admin', name: 'Admin' };
  const store = getStore();
  const user = store.users.find(u => u.id === req.params.id);
  const wallet = store.wallets.find(w => w.userId === req.params.id);
  if (!user || !wallet) return res.status(404).json({ error: 'User or wallet not found' });

  const { amount, action, reason } = req.body;
  const val = Number(amount);
  if (!val || val <= 0) return res.status(400).json({ error: 'Valid positive amount required' });

  const isAdd = action === 'add' || action === 'add_balance';
  const isDeduct = action === 'deduct' || action === 'deduct_balance';

  if (!isAdd && !isDeduct) {
    return res.status(400).json({ error: 'Action must be add or deduct' });
  }

  const balanceBefore = wallet.balance;

  if (isAdd) {
    wallet.balance += val;
    wallet.giftIncome = (wallet.giftIncome || 0) + val;
    wallet.updatedAt = new Date().toISOString();

    store.transactions.push({
      id: `tx_${Date.now()}`,
      userId: user.id,
      type: 'gift',
      amount: val,
      description: `Admin Credit: ${reason || 'Administrative adjustment'}`,
      balanceAfter: wallet.balance,
      createdAt: new Date().toISOString(),
    });

    store.notifications.push({
      id: `notif_${Date.now()}`,
      userId: user.id,
      type: 'gift',
      title: 'Wallet Balance Added by Admin',
      message: `${val} TK has been added to your wallet. Reason: ${reason || 'Admin Credit'}.`,
      isRead: false,
      createdAt: new Date().toISOString(),
    });
  } else {
    if (wallet.balance < val) {
      return res.status(400).json({ error: 'Deduction amount exceeds user balance' });
    }
    wallet.balance -= val;
    wallet.updatedAt = new Date().toISOString();

    store.transactions.push({
      id: `tx_${Date.now()}`,
      userId: user.id,
      type: 'withdraw',
      amount: -val,
      description: `Admin Deduction: ${reason || 'Administrative correction'}`,
      balanceAfter: wallet.balance,
      createdAt: new Date().toISOString(),
    });

    store.notifications.push({
      id: `notif_${Date.now()}`,
      userId: user.id,
      type: 'withdraw',
      title: 'Wallet Balance Deducted by Admin',
      message: `${val} TK was deducted from your wallet. Reason: ${reason || 'Administrative correction'}.`,
      isRead: false,
      createdAt: new Date().toISOString(),
    });
  }

  store.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name || 'Admin',
    action: isAdd ? 'Credit Balance' : 'Deduct Balance',
    target: user.phone,
    details: `${isAdd ? '+' : '-'}${val} TK. Reason: ${reason || 'None'}. Previous: ${balanceBefore}, New: ${wallet.balance}`,
    timestamp: new Date().toISOString(),
  });

  saveStore();
  emitWalletUpdated(user.id, wallet);
  emitNotificationNew(user.id, store.notifications[store.notifications.length - 1]);
  emitAdminDashboardUpdated();

  return res.json({ success: true, wallet, message: `Balance successfully ${isAdd ? 'credited' : 'deducted'}` });
});

// Admin User Ban / Unban
router.post('/admin/users/:id/ban', authenticateAdmin, (req: Request, res: Response) => {
  const adminUser = (req as any).user || (req as any).admin || { id: 'admin', name: 'Admin' };
  const store = getStore();
  const user = store.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const isBanned = req.body.isBanned !== undefined ? Boolean(req.body.isBanned) : !user.isBanned;
  user.isBanned = isBanned;
  user.status = isBanned ? 'suspended' : 'active';

  store.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name || 'Admin',
    action: isBanned ? 'Ban User' : 'Unban User',
    target: user.phone,
    details: `User ${user.phone} was ${isBanned ? 'banned' : 'unbanned'} by ${adminUser.name || 'Admin'}`,
    timestamp: new Date().toISOString(),
  });

  saveStore();
  emitAdminDashboardUpdated();

  return res.json({
    success: true,
    message: `User ${user.phone} has been ${isBanned ? 'banned' : 'unbanned'}.`,
    user,
  });
});

// 3. Deposit Manager: Approve, Reject, Manual Verify
router.get('/admin/deposits', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const { status } = req.query;
  let list = [...store.deposits];
  if (status && typeof status === 'string' && status !== 'all') {
    list = list.filter(d => d.status === status);
  }
  return res.json({ deposits: list.reverse() });
});

router.get('/admin/deposits/pending', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const list = store.deposits.filter(d => d.status === 'pending');
  return res.json({ deposits: list.reverse() });
});

function handleDepositReview(req: Request, res: Response, targetStatus?: string) {
  const adminUser = (req as any).user || (req as any).admin || { id: 'admin', name: 'Admin' };
  const store = getStore();
  const deposit = store.deposits.find(d => d.id === req.params.id);
  if (!deposit) return res.status(404).json({ error: 'Deposit request not found' });

  const status = targetStatus || req.body.status;
  const rejectedReason = req.body.reason || req.body.rejectedReason;

  if (status !== 'approved' && status !== 'rejected') {
    return res.status(400).json({ error: 'Status must be approved or rejected' });
  }

  deposit.status = status;
  deposit.reviewedAt = new Date().toISOString();
  deposit.reviewedBy = adminUser.name || 'Admin';

  const user = store.users.find(u => u.id === deposit.userId);
  const wallet = store.wallets.find(w => w.userId === deposit.userId);

  if (status === 'approved' && wallet) {
    const balanceBefore = wallet.balance;
    wallet.balance += deposit.amount;
    wallet.totalDeposit += deposit.amount;
    wallet.updatedAt = new Date().toISOString();
    const balanceAfter = wallet.balance;

    recordWalletLedgerEntry({
      userId: deposit.userId,
      transactionType: 'Deposit Verification',
      amount: deposit.amount,
      balanceBefore,
      balanceAfter,
      reason: 'Deposit Verification (Manual Review Approved)',
      referenceId: deposit.id,
      createdBy: adminUser.name || 'Finance Admin',
      status: 'completed',
    });

    recordFinancialAuditLog({
      adminId: adminUser.id || 'admin',
      userId: deposit.userId,
      action: 'DEPOSIT_MANUAL_APPROVED',
      oldBalance: balanceBefore,
      newBalance: balanceAfter,
      reference: `Deposit:${deposit.id}|TrxID:${deposit.transactionId}`,
      ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1',
    });

    store.transactions.push({
      id: `tx_${Date.now()}`,
      userId: deposit.userId,
      type: 'deposit',
      amount: deposit.amount,
      description: `${deposit.paymentMethod} Deposit Approved (TrxID: ${deposit.transactionId})`,
      balanceAfter: wallet.balance,
      createdAt: new Date().toISOString(),
      referenceId: deposit.id,
    });

    store.notifications.push({
      id: `notif_${Date.now()}`,
      userId: deposit.userId,
      type: 'deposit',
      title: 'Deposit Approved!',
      message: `Your ${deposit.paymentMethod} deposit of ${deposit.amount} TK has been approved and added to your wallet balance.`,
      isRead: false,
      createdAt: new Date().toISOString(),
    });

    emitWalletUpdated(deposit.userId, wallet);
    emitNotificationNew(deposit.userId, store.notifications[store.notifications.length - 1]);
  } else if (status === 'rejected') {
    deposit.rejectedReason = rejectedReason || 'Transaction could not be verified';
    store.notifications.push({
      id: `notif_${Date.now()}`,
      userId: deposit.userId,
      type: 'deposit',
      title: 'Deposit Rejected',
      message: `Your deposit of ${deposit.amount} TK was rejected. Reason: ${deposit.rejectedReason}`,
      isRead: false,
      createdAt: new Date().toISOString(),
    });
    emitNotificationNew(deposit.userId, store.notifications[store.notifications.length - 1]);
  }

  // Audit activity log
  store.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name || 'Admin',
    action: `Deposit Review: ${status}`,
    target: deposit.transactionId,
    details: `${status} ${deposit.amount} TK for ${deposit.userPhone}`,
    timestamp: new Date().toISOString(),
  });

  saveStore();

  emitDepositStatusChanged(deposit.userId, deposit);
  emitAdminDashboardUpdated();

  return res.json({ success: true, deposit });
}

router.post('/admin/deposits/:id/review', authenticateAdmin, (req: Request, res: Response) => {
  return handleDepositReview(req, res);
});

router.post('/admin/deposits/:id/approve', authenticateAdmin, (req: Request, res: Response) => {
  return handleDepositReview(req, res, 'approved');
});

router.post('/admin/deposits/:id/reject', authenticateAdmin, (req: Request, res: Response) => {
  return handleDepositReview(req, res, 'rejected');
});

// 4. Withdraw Manager: Approve, Reject, Paid
router.get('/admin/withdraws', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const { status } = req.query;
  let list = [...store.withdraws];
  if (status && typeof status === 'string' && status !== 'all') {
    list = list.filter(w => w.status === status);
  }
  return res.json({ withdraws: list.reverse() });
});

router.get('/admin/withdraws/pending', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const list = store.withdraws.filter(w => w.status === 'pending');
  return res.json({ withdraws: list.reverse() });
});

function handleWithdrawAction(req: Request, res: Response, targetStatus?: string) {
  const adminUser = (req as any).user || (req as any).admin || { id: 'admin', name: 'Admin' };
  const store = getStore();
  const withdraw = store.withdraws.find(w => w.id === req.params.id);
  if (!withdraw) return res.status(404).json({ error: 'Withdraw request not found' });

  const status = targetStatus || req.body.status;
  const rejectedReason = req.body.reason || req.body.rejectedReason;
  const note = req.body.payoutTrxId
    ? `Paid by admin. TrxID: ${req.body.payoutTrxId}`
    : (req.body.note || `Status updated to ${status} by ${adminUser.name || 'Admin'}`);

  if (!['approved', 'paid', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be approved, paid, or rejected' });
  }

  withdraw.status = status;
  withdraw.updatedAt = new Date().toISOString();

  withdraw.timeline.push({
    step: status,
    timestamp: new Date().toISOString(),
    note,
  });

  if (status === 'rejected') {
    withdraw.rejectedReason = rejectedReason || 'Withdrawal rejected by finance administration';
    const wallet = store.wallets.find(w => w.userId === withdraw.userId);
    if (wallet) {
      wallet.balance += withdraw.amount;
      wallet.totalWithdraw -= withdraw.amount;
      wallet.updatedAt = new Date().toISOString();

      store.transactions.push({
        id: `tx_${Date.now()}`,
        userId: withdraw.userId,
        type: 'gift',
        amount: withdraw.amount,
        description: `Refund for Rejected Withdraw #${withdraw.id}`,
        balanceAfter: wallet.balance,
        createdAt: new Date().toISOString(),
      });

      emitWalletUpdated(withdraw.userId, wallet);
    }

    store.notifications.push({
      id: `notif_${Date.now()}`,
      userId: withdraw.userId,
      type: 'withdraw',
      title: 'Withdrawal Request Rejected',
      message: `Your withdrawal of ${withdraw.amount} TK was rejected. Amount has been refunded. Reason: ${withdraw.rejectedReason}`,
      isRead: false,
      createdAt: new Date().toISOString(),
    });
    emitNotificationNew(withdraw.userId, store.notifications[store.notifications.length - 1]);
  } else if (status === 'paid') {
    store.notifications.push({
      id: `notif_${Date.now()}`,
      userId: withdraw.userId,
      type: 'withdraw',
      title: 'Withdrawal Completed & Paid!',
      message: `Your ${withdraw.netAmount} TK has been sent via ${withdraw.paymentMethod} to ${withdraw.withdrawNumber}. ${note ? `(${note})` : ''}`,
      isRead: false,
      createdAt: new Date().toISOString(),
    });
    emitNotificationNew(withdraw.userId, store.notifications[store.notifications.length - 1]);
  }

  // Audit activity log
  store.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name || 'Admin',
    action: `Withdraw Action: ${status}`,
    target: withdraw.withdrawNumber,
    details: `${status} ${withdraw.amount} TK to ${withdraw.userPhone}. Note: ${note}`,
    timestamp: new Date().toISOString(),
  });

  saveStore();

  emitWithdrawStatusChanged(withdraw.userId, withdraw);
  emitAdminDashboardUpdated();

  return res.json({ success: true, withdraw });
}

router.post('/admin/withdraws/:id/action', authenticateAdmin, (req: Request, res: Response) => {
  return handleWithdrawAction(req, res);
});

router.post('/admin/withdraws/:id/approve', authenticateAdmin, (req: Request, res: Response) => {
  return handleWithdrawAction(req, res, 'approved');
});

router.post('/admin/withdraws/:id/pay', authenticateAdmin, (req: Request, res: Response) => {
  return handleWithdrawAction(req, res, 'paid');
});

router.post('/admin/withdraws/:id/reject', authenticateAdmin, (req: Request, res: Response) => {
  return handleWithdrawAction(req, res, 'rejected');
});

// 4.1. Withdraw Cards Manager: CRUD (Create, Read, Edit, Delete, Toggle Active)
router.get('/admin/withdraw-cards', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const cards = [...(store.withdrawCards || [])].sort((a, b) => a.order - b.order || a.amount - b.amount);
  return res.json({ withdrawCards: cards });
});

router.post('/admin/withdraw-cards', authenticateAdmin, (req: Request, res: Response) => {
  const adminUser = (req as any).user;
  const store = getStore();
  const { amount, label, badge, badgeColor, minRole, isTrialAllowed, enabled, order, description } = req.body;

  const cardAmount = Number(amount);
  if (!cardAmount || cardAmount <= 0) {
    return res.status(400).json({ error: 'সঠিক পজিটিভ উইথড্র পরিমাণ (TK) প্রদান করুন।' });
  }

  // Check if card with same amount exists
  const existing = store.withdrawCards?.find(c => c.amount === cardAmount);
  if (existing) {
    return res.status(400).json({ error: `৳${cardAmount} টাকার উইথড্র কার্ড ইতিপূর্বে তৈরি করা রয়েছে (ID: ${existing.id})।` });
  }

  const newCard: WithdrawCard = {
    id: `wcard_${Date.now()}`,
    amount: cardAmount,
    label: label || `৳${cardAmount} পেআউট কার্ড`,
    badge: badge || (cardAmount >= 10000 ? 'VIP ONLY' : cardAmount >= 5000 ? 'POPULAR' : 'INSTANT'),
    badgeColor: badgeColor || (cardAmount >= 10000 ? 'amber' : cardAmount >= 5000 ? 'purple' : 'emerald'),
    minRole: minRole || 'Member',
    isTrialAllowed: isTrialAllowed !== undefined ? Boolean(isTrialAllowed) : (cardAmount === 100),
    enabled: enabled !== undefined ? Boolean(enabled) : true,
    order: Number(order) || (store.withdrawCards ? store.withdrawCards.length + 1 : 1),
    description: description || `ব্যবহারকারীদের জন্য ৳${cardAmount} টাকা উইথড্র কার্ড`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!store.withdrawCards) {
    store.withdrawCards = [];
  }
  store.withdrawCards.push(newCard);

  store.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name || 'Admin',
    action: 'Create Withdraw Card',
    target: `৳${cardAmount}`,
    details: `Created new withdraw card of ৳${cardAmount} (Label: ${newCard.label})`,
    timestamp: new Date().toISOString(),
  });

  saveStore();
  emitAdminDashboardUpdated();

  return res.json({ success: true, message: `৳${cardAmount} টাকার নতুন উইথড্র কার্ড সফলভাবে তৈরি হয়েছে।`, withdrawCard: newCard });
});

router.put('/admin/withdraw-cards/:id', authenticateAdmin, (req: Request, res: Response) => {
  const adminUser = (req as any).user;
  const store = getStore();
  const card = store.withdrawCards?.find(c => c.id === req.params.id);
  if (!card) return res.status(404).json({ error: 'উইথড্র কার্ড পাওয়া যায়নি।' });

  const { amount, label, badge, badgeColor, minRole, isTrialAllowed, enabled, order, description } = req.body;

  if (amount !== undefined) {
    const newAmt = Number(amount);
    if (!newAmt || newAmt <= 0) {
      return res.status(400).json({ error: 'সঠিক পজিটিভ উইথড্র পরিমাণ (TK) প্রদান করুন।' });
    }
    // Check duplicate amount on other cards
    const duplicate = store.withdrawCards?.find(c => c.amount === newAmt && c.id !== card.id);
    if (duplicate) {
      return res.status(400).json({ error: `৳${newAmt} টাকার অন্য একটি উইথড্র কার্ড রয়েছে।` });
    }
    card.amount = newAmt;
  }

  if (label !== undefined) card.label = label;
  if (badge !== undefined) card.badge = badge;
  if (badgeColor !== undefined) card.badgeColor = badgeColor;
  if (minRole !== undefined) card.minRole = minRole;
  if (isTrialAllowed !== undefined) card.isTrialAllowed = Boolean(isTrialAllowed);
  if (enabled !== undefined) card.enabled = Boolean(enabled);
  if (order !== undefined) card.order = Number(order);
  if (description !== undefined) card.description = description;
  card.updatedAt = new Date().toISOString();

  store.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name || 'Admin',
    action: 'Update Withdraw Card',
    target: `৳${card.amount}`,
    details: `Updated withdraw card #${card.id} (Amount: ৳${card.amount}, Label: ${card.label})`,
    timestamp: new Date().toISOString(),
  });

  saveStore();
  emitAdminDashboardUpdated();

  return res.json({ success: true, message: `উইথড্র কার্ড সফলভাবে আপডেট করা হয়েছে।`, withdrawCard: card });
});

router.delete('/admin/withdraw-cards/:id', authenticateAdmin, (req: Request, res: Response) => {
  const adminUser = (req as any).user;
  const store = getStore();
  const index = (store.withdrawCards || []).findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'উইথড্র কার্ড পাওয়া যায়নি।' });

  const deleted = store.withdrawCards[index];
  store.withdrawCards.splice(index, 1);

  store.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name || 'Admin',
    action: 'Delete Withdraw Card',
    target: `৳${deleted.amount}`,
    details: `Deleted withdraw card #${deleted.id} of ৳${deleted.amount}`,
    timestamp: new Date().toISOString(),
  });

  saveStore();
  emitAdminDashboardUpdated();

  return res.json({ success: true, message: `৳${deleted.amount} টাকার উইথড্র কার্ড ডিলিট করা হয়েছে।` });
});

router.post('/admin/withdraw-cards/:id/toggle', authenticateAdmin, (req: Request, res: Response) => {
  const adminUser = (req as any).user;
  const store = getStore();
  const card = store.withdrawCards?.find(c => c.id === req.params.id);
  if (!card) return res.status(404).json({ error: 'উইথড্র কার্ড পাওয়া যায়নি।' });

  card.enabled = !card.enabled;
  card.updatedAt = new Date().toISOString();

  store.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name || 'Admin',
    action: `Toggle Withdraw Card: ${card.enabled ? 'Enabled' : 'Disabled'}`,
    target: `৳${card.amount}`,
    details: `Toggled withdraw card #${card.id} to ${card.enabled ? 'Active' : 'Inactive'}`,
    timestamp: new Date().toISOString(),
  });

  saveStore();
  emitAdminDashboardUpdated();

  return res.json({ success: true, message: `উইথড্র কার্ডটি ${card.enabled ? 'সক্রিয় (Active)' : 'নিষ্ক্রিয় (Inactive)'} করা হয়েছে।`, withdrawCard: card });
});

// 5. Package Manager: CRUD, Create, Edit, Delete & Toggle
router.get('/admin/packages', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  return res.json({ packages: store.packages });
});

router.post('/admin/packages', authenticateAdmin, (req: Request, res: Response) => {
  const { name, price, dailyIncome, videosPerDay, validityDays, badgeColor, enabled, isPopular } = req.body;
  if (!name || price === undefined || dailyIncome === undefined || !videosPerDay) {
    return res.status(400).json({ error: 'Package name, price, daily income, and daily videos count are required' });
  }

  const store = getStore();
  const vpd = Math.max(1, Number(videosPerDay));
  const income = Number(dailyIncome);
  const newPkg: Package = {
    id: `pkg_${Date.now()}`,
    name: name.trim(),
    price: Number(price),
    dailyIncome: income,
    videosPerDay: vpd,
    incomePerVideo: Math.round((income / vpd) * 100) / 100,
    validityDays: Number(validityDays) || 365,
    badgeColor: badgeColor || 'emerald',
    enabled: enabled !== undefined ? Boolean(enabled) : true,
    isPopular: Boolean(isPopular),
  };

  store.packages.push(newPkg);
  saveStore();
  return res.json({ success: true, package: newPkg });
});

router.post('/admin/packages/:id', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const pkg = store.packages.find(p => p.id === req.params.id);
  if (!pkg) return res.status(404).json({ error: 'Package not found' });

  const { name, price, dailyIncome, videosPerDay, validityDays, badgeColor, enabled, isPopular } = req.body;

  if (name !== undefined) pkg.name = name.trim();
  if (price !== undefined) pkg.price = Number(price);
  if (dailyIncome !== undefined) pkg.dailyIncome = Number(dailyIncome);
  if (videosPerDay !== undefined) {
    pkg.videosPerDay = Math.max(1, Number(videosPerDay));
  }
  if (pkg.dailyIncome && pkg.videosPerDay) {
    pkg.incomePerVideo = Math.round((pkg.dailyIncome / pkg.videosPerDay) * 100) / 100;
  }
  if (validityDays !== undefined) pkg.validityDays = Number(validityDays);
  if (badgeColor !== undefined) pkg.badgeColor = badgeColor;
  if (enabled !== undefined) pkg.enabled = Boolean(enabled);
  if (isPopular !== undefined) pkg.isPopular = Boolean(isPopular);

  saveStore();
  return res.json({ success: true, package: pkg });
});

router.post('/admin/packages/:id/update', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const pkg = store.packages.find(p => p.id === req.params.id);
  if (!pkg) return res.status(404).json({ error: 'Package not found' });

  const { name, price, dailyIncome, videosPerDay, validityDays, badgeColor, enabled, isPopular } = req.body;

  if (name !== undefined) pkg.name = name.trim();
  if (price !== undefined) pkg.price = Number(price);
  if (dailyIncome !== undefined) pkg.dailyIncome = Number(dailyIncome);
  if (videosPerDay !== undefined) {
    pkg.videosPerDay = Math.max(1, Number(videosPerDay));
  }
  if (pkg.dailyIncome && pkg.videosPerDay) {
    pkg.incomePerVideo = Math.round((pkg.dailyIncome / pkg.videosPerDay) * 100) / 100;
  }
  if (validityDays !== undefined) pkg.validityDays = Number(validityDays);
  if (badgeColor !== undefined) pkg.badgeColor = badgeColor;
  if (enabled !== undefined) pkg.enabled = Boolean(enabled);
  if (isPopular !== undefined) pkg.isPopular = Boolean(isPopular);

  saveStore();
  return res.json({ success: true, package: pkg });
});

router.post('/admin/packages/:id/toggle', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const pkg = store.packages.find(p => p.id === req.params.id);
  if (!pkg) return res.status(404).json({ error: 'Package not found' });

  pkg.enabled = !pkg.enabled;
  saveStore();
  return res.json({ success: true, package: pkg });
});

router.delete('/admin/packages/:id', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const idx = store.packages.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Package not found' });

  if (store.packages[idx].id === 'pkg_trial') {
    return res.status(400).json({ error: 'Cannot delete default Free Trial package' });
  }

  store.packages.splice(idx, 1);
  saveStore();
  return res.json({ success: true, message: 'Package deleted successfully' });
});

// 6. Referral & Salary Rules Manager
router.post('/admin/settings/referrals', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const { levelA, levelB, levelC } = req.body;

  if (levelA !== undefined) store.settings.levelAPercentage = Number(levelA);
  if (levelB !== undefined) store.settings.levelBPercentage = Number(levelB);
  if (levelC !== undefined) store.settings.levelCPercentage = Number(levelC);

  saveStore();
  return res.json({ success: true, settings: store.settings });
});

// 7. Campaigns & Promo Codes Manager
router.post('/admin/campaigns', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const { title, description, bannerUrl, type, startDate, endDate, isActive } = req.body;

  const campaign = {
    id: `camp_${Date.now()}`,
    title,
    description,
    bannerUrl: bannerUrl || 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1200&auto=format&fit=crop&q=80',
    type: type || 'banner',
    startDate: startDate || new Date().toISOString().split('T')[0],
    endDate: endDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    isActive: isActive !== undefined ? isActive : true,
  };

  store.campaigns.push(campaign);
  saveStore();
  emitCampaignUpdated(campaign);

  return res.json({ success: true, campaign });
});

router.get('/admin/campaigns', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  return res.json({ campaigns: store.campaigns });
});

router.post('/admin/campaigns', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const { title, image, description, startDate, endDate, isActive } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Campaign title is required' });
  }

  const campaign = {
    id: `camp_${Date.now()}`,
    title,
    image: image || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600',
    bannerUrl: image || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600',
    description: description || '',
    type: 'banner' as const,
    startDate: startDate || new Date().toISOString().split('T')[0],
    endDate: endDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    isActive: isActive !== undefined ? isActive : true,
  };

  store.campaigns.push(campaign);
  saveStore();
  emitCampaignUpdated(campaign);

  return res.json({ success: true, campaign });
});

router.get('/admin/promocodes', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  return res.json({ promoCodes: store.promoCodes });
});

router.post('/admin/promocodes', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const { code, rewardAmount, maxUsage, expiresAt } = req.body;

  if (!code || !rewardAmount) {
    return res.status(400).json({ error: 'Code and reward amount are required' });
  }

  const promoCode = {
    id: `promo_${Date.now()}`,
    code: code.trim().toUpperCase(),
    rewardAmount: Number(rewardAmount),
    maxUsage: Number(maxUsage) || 500,
    currentUsage: 0,
    expiresAt: expiresAt || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  store.promoCodes.push(promoCode);
  saveStore();

  return res.json({ success: true, promoCode });
});

router.get('/admin/holidays', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  return res.json({ holidays: store.holidays });
});

// 8. Gift Balance Manager (Reason required, notification required, history saved!)
router.post('/admin/gift-balance', authenticateAdmin, (req: Request, res: Response) => {
  const adminUser = (req as any).user;
  const { phone, amount, reason } = req.body;

  if (!phone || !amount || !reason) {
    return res.status(400).json({ error: 'Target phone, amount, and reason are strictly required' });
  }

  const normalizedPhone = normalizeBdPhone(phone);
  const store = getStore();
  const user = store.users.find(u => u.phone === normalizedPhone);
  const wallet = store.wallets.find(w => w.userId === (user ? user.id : ''));

  if (!user || !wallet) {
    return res.status(404).json({ error: 'User with this phone number was not found' });
  }

  const giftVal = Number(amount);
  wallet.balance += giftVal;
  wallet.giftIncome += giftVal;
  wallet.totalEarned += giftVal;
  wallet.updatedAt = new Date().toISOString();

  store.transactions.push({
    id: `tx_${Date.now()}`,
    userId: user.id,
    type: 'gift',
    amount: giftVal,
    description: `Official Gift Balance: ${reason}`,
    balanceAfter: wallet.balance,
    createdAt: new Date().toISOString(),
  });

  store.notifications.push({
    id: `notif_${Date.now()}`,
    userId: user.id,
    type: 'gift',
    title: 'Special Gift Balance Received!',
    message: `You received ${giftVal} TK gift balance in your wallet. Reason: ${reason}.`,
    isRead: false,
    createdAt: new Date().toISOString(),
  });

  store.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name || 'Admin',
    action: 'Gift Balance Awarded',
    target: user.phone,
    details: `${giftVal} TK awarded. Reason: ${reason}`,
    timestamp: new Date().toISOString(),
  });

  saveStore();

  emitWalletUpdated(user.id, wallet);
  emitNotificationNew(user.id, store.notifications[store.notifications.length - 1]);

  return res.json({ success: true, message: `Gift balance of ${giftVal} TK sent to ${user.phone}`, newBalance: wallet.balance });
});

// 9. Holiday Manager (Reason required, disable tasks, banner shown, real-time)
router.post('/admin/holidays', authenticateAdmin, (req: Request, res: Response) => {
  const { date, name, reason, tasksDisabled } = req.body;

  if (!date || !name || !reason) {
    return res.status(400).json({ error: 'Date, name, and reason are required for holidays' });
  }

  const store = getStore();
  const holiday = {
    id: `hol_${Date.now()}`,
    date,
    name,
    reason,
    tasksDisabled: tasksDisabled !== undefined ? Boolean(tasksDisabled) : true,
  };

  store.holidays.push(holiday);
  saveStore();

  emitHolidayUpdated(holiday);

  return res.json({ success: true, holiday });
});

// 10. Payment Number Manager
router.get('/admin/payment-numbers', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  return res.json({ paymentNumbers: store.paymentNumbers });
});

router.post('/admin/payment-numbers', authenticateAdmin, (req: Request, res: Response) => {
  const { method, number, accountType, dailyLimit } = req.body;
  if (!number || !isValidBdPhone(number)) {
    return res.status(400).json({ error: 'Valid Bangladesh phone number is required' });
  }

  const store = getStore();
  const pn = {
    id: `num_${Date.now()}`,
    method: method || 'bKash',
    number: normalizeBdPhone(number),
    accountType: accountType || 'Personal',
    isActive: true,
    usageCount: 0,
    dailyLimit: Number(dailyLimit) || 200000,
    currentDailyVolume: 0,
  };

  store.paymentNumbers.push(pn);
  saveStore();

  return res.json({ success: true, paymentNumber: pn });
});

router.post('/admin/payment-numbers/:id/toggle', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const pn = store.paymentNumbers.find(p => p.id === req.params.id);
  if (!pn) return res.status(404).json({ error: 'Number not found' });

  pn.isActive = !pn.isActive;
  saveStore();
  return res.json({ success: true, paymentNumber: pn });
});

router.put('/admin/payment-numbers/:id', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const num = store.paymentNumbers.find(p => p.id === req.params.id);
  if (!num) return res.status(404).json({ error: 'Payment number not found' });

  const { isActive, number, method, type } = req.body;
  if (isActive !== undefined) num.isActive = Boolean(isActive);
  if (number !== undefined && number.trim()) num.number = normalizeBdPhone(number);
  if (method !== undefined) num.method = method;
  if (type !== undefined) num.accountType = type;

  saveStore();
  emitAdminDashboardUpdated();
  return res.json({ success: true, paymentNumber: num });
});

// 11. Branding & Settings Manager
router.post('/admin/settings', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const {
    websiteName,
    tagline,
    logoUrl,
    mobileLogoUrl,
    whatsappNumber,
    telegramGroupUrl,
    telegramChannelUrl,
    facebookGroupUrl,
    youtubeTutorialUrl,
    appDownloadUrl,
    marqueeNotice,
    themePrimaryColor,
    footerText,
    minDepositAmount,
    maxDepositAmount,
    minWithdrawAmount,
    maxWithdrawAmount,
    withdrawFeePercentage,
    signupBonusAmount,
    withdrawOpeningHour,
    withdrawClosingHour,
    withdrawStartHour,
    withdrawEndHour,
    withdrawGloballyEnabled,
    isWithdrawDisabled,
    allowFreeUserWithdrawal,
    hybridDepositVerificationEnabled,
    maintenanceMode,
    levelAPercentage,
    levelBPercentage,
    levelCPercentage,
    dailyTaskResetHour,
    sundayIsOffDay,
  } = req.body;

  if (websiteName !== undefined) store.settings.websiteName = websiteName;
  if (tagline !== undefined) store.settings.tagline = tagline;
  if (logoUrl !== undefined) store.settings.logoUrl = logoUrl;
  if (mobileLogoUrl !== undefined) store.settings.mobileLogoUrl = mobileLogoUrl;
  if (whatsappNumber !== undefined) store.settings.whatsappNumber = whatsappNumber;
  if (telegramGroupUrl !== undefined) store.settings.telegramGroupUrl = telegramGroupUrl;
  if (telegramChannelUrl !== undefined) store.settings.telegramChannelUrl = telegramChannelUrl;
  if (facebookGroupUrl !== undefined) store.settings.facebookGroupUrl = facebookGroupUrl;
  if (youtubeTutorialUrl !== undefined) store.settings.youtubeTutorialUrl = youtubeTutorialUrl;
  if (appDownloadUrl !== undefined) store.settings.appDownloadUrl = appDownloadUrl;
  if (marqueeNotice !== undefined) store.settings.marqueeNotice = marqueeNotice;
  if (themePrimaryColor !== undefined) store.settings.themePrimaryColor = themePrimaryColor;
  if (footerText !== undefined) store.settings.footerText = footerText;

  if (minDepositAmount !== undefined) store.settings.minDepositAmount = Number(minDepositAmount);
  if (maxDepositAmount !== undefined) store.settings.maxDepositAmount = Number(maxDepositAmount);
  if (minWithdrawAmount !== undefined) store.settings.minWithdrawAmount = Number(minWithdrawAmount);
  if (maxWithdrawAmount !== undefined) store.settings.maxWithdrawAmount = Number(maxWithdrawAmount);
  if (withdrawFeePercentage !== undefined) store.settings.withdrawFeePercentage = Number(withdrawFeePercentage);
  if (signupBonusAmount !== undefined) store.settings.signupBonusAmount = Number(signupBonusAmount);

  const openingH = withdrawOpeningHour !== undefined ? Number(withdrawOpeningHour) : (withdrawStartHour !== undefined ? Number(withdrawStartHour) : undefined);
  if (openingH !== undefined) {
    store.settings.withdrawOpeningHour = openingH;
    store.settings.withdrawStartHour = openingH;
  }

  const closingH = withdrawClosingHour !== undefined ? Number(withdrawClosingHour) : (withdrawEndHour !== undefined ? Number(withdrawEndHour) : undefined);
  if (closingH !== undefined) {
    store.settings.withdrawClosingHour = closingH;
    store.settings.withdrawEndHour = closingH;
  }

  if (withdrawGloballyEnabled !== undefined) store.settings.withdrawGloballyEnabled = Boolean(withdrawGloballyEnabled);
  if (isWithdrawDisabled !== undefined) {
    store.settings.isWithdrawDisabled = Boolean(isWithdrawDisabled);
    store.settings.withdrawGloballyEnabled = !Boolean(isWithdrawDisabled);
  }
  if (allowFreeUserWithdrawal !== undefined) {
    store.settings.allowFreeUserWithdrawal = Boolean(allowFreeUserWithdrawal);
  }
  if (hybridDepositVerificationEnabled !== undefined) store.settings.hybridDepositVerificationEnabled = Boolean(hybridDepositVerificationEnabled);
  if (maintenanceMode !== undefined) store.settings.maintenanceMode = Boolean(maintenanceMode);
  if (levelAPercentage !== undefined) store.settings.levelAPercentage = Number(levelAPercentage);
  if (levelBPercentage !== undefined) store.settings.levelBPercentage = Number(levelBPercentage);
  if (levelCPercentage !== undefined) store.settings.levelCPercentage = Number(levelCPercentage);
  if (dailyTaskResetHour !== undefined) store.settings.dailyTaskResetHour = Number(dailyTaskResetHour);
  if (sundayIsOffDay !== undefined) store.settings.sundayIsOffDay = Boolean(sundayIsOffDay);

  saveStore();
  emitBrandingUpdated(store.settings);

  return res.json({ success: true, settings: store.settings });
});

router.post('/admin/settings/branding', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const { websiteName, tagline, logoUrl, mobileLogoUrl, whatsappNumber, themePrimaryColor, footerText, withdrawOpeningHour, withdrawClosingHour, withdrawGloballyEnabled, isWithdrawDisabled, allowFreeUserWithdrawal, hybridDepositVerificationEnabled, sundayIsOffDay } = req.body;

  if (websiteName !== undefined) store.settings.websiteName = websiteName;
  if (tagline !== undefined) store.settings.tagline = tagline;
  if (logoUrl !== undefined) store.settings.logoUrl = logoUrl;
  if (mobileLogoUrl !== undefined) store.settings.mobileLogoUrl = mobileLogoUrl;
  if (whatsappNumber !== undefined) store.settings.whatsappNumber = whatsappNumber;
  if (themePrimaryColor !== undefined) store.settings.themePrimaryColor = themePrimaryColor;
  if (footerText !== undefined) store.settings.footerText = footerText;
  if (withdrawOpeningHour !== undefined) store.settings.withdrawOpeningHour = Number(withdrawOpeningHour);
  if (withdrawClosingHour !== undefined) store.settings.withdrawClosingHour = Number(withdrawClosingHour);
  if (withdrawGloballyEnabled !== undefined) store.settings.withdrawGloballyEnabled = Boolean(withdrawGloballyEnabled);
  if (isWithdrawDisabled !== undefined) store.settings.isWithdrawDisabled = Boolean(isWithdrawDisabled);
  if (allowFreeUserWithdrawal !== undefined) store.settings.allowFreeUserWithdrawal = Boolean(allowFreeUserWithdrawal);
  if (hybridDepositVerificationEnabled !== undefined) store.settings.hybridDepositVerificationEnabled = Boolean(hybridDepositVerificationEnabled);
  if (sundayIsOffDay !== undefined) store.settings.sundayIsOffDay = Boolean(sundayIsOffDay);

  saveStore();
  emitBrandingUpdated(store.settings);

  return res.json({ success: true, settings: store.settings });
});

// Toggle Free User Withdraw Permission by user ID
router.post('/admin/users/:id/toggle-free-withdraw', authenticateAdmin, (req: Request, res: Response) => {
  const adminUser = (req as any).user;
  const store = getStore();
  const user = store.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.freeWithdrawAllowed = !user.freeWithdrawAllowed;

  store.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name || 'Admin',
    action: `Toggle Free Withdraw: ${user.freeWithdrawAllowed ? 'Enabled' : 'Disabled'}`,
    target: user.phone,
    details: `Free withdrawal permission ${user.freeWithdrawAllowed ? 'granted' : 'revoked'} for ${user.phone}`,
    timestamp: new Date().toISOString(),
  });

  if (user.freeWithdrawAllowed) {
    store.notifications.push({
      id: `notif_${Date.now()}`,
      userId: user.id,
      type: 'withdraw',
      title: 'Free Withdrawal Permission Granted!',
      message: 'Admin has enabled withdrawal permission for your free account. You can now request your withdrawal.',
      isRead: false,
      createdAt: new Date().toISOString(),
    });
    emitNotificationNew(user.id, store.notifications[store.notifications.length - 1]);
  }

  saveStore();
  emitAdminDashboardUpdated();

  return res.json({
    success: true,
    message: `Free withdrawal permission ${user.freeWithdrawAllowed ? 'enabled' : 'disabled'} for ${user.phone}`,
    freeWithdrawAllowed: user.freeWithdrawAllowed,
  });
});

// Helper: Configure Cloudinary dynamically from store or environment
function configureCloudinary(): boolean {
  const store = getStore();
  const cloudName = store.cloudinarySettings?.cloudName || process.env.CLOUDINARY_CLOUD_NAME || store.settings.cloudinaryCloudName;
  const apiKey = store.cloudinarySettings?.apiKey || process.env.CLOUDINARY_API_KEY || store.settings.cloudinaryApiKey;
  const apiSecret = store.cloudinarySettings?.apiSecret || process.env.CLOUDINARY_API_SECRET || store.settings.cloudinaryApiSecret;

  if (cloudName && apiKey && apiSecret && apiSecret !== '****************') {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
    return true;
  }
  return false;
}

// Universal Image Upload Endpoint (Cloudinary with graceful fallback)
router.post('/upload', async (req: Request, res: Response) => {
  try {
    const { image, folder } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Image data is required (base64 string or image URL).' });
    }

    const isCloudinaryReady = configureCloudinary();
    const store = getStore();

    if (isCloudinaryReady) {
      try {
        const uploadResult = await cloudinary.uploader.upload(image, {
          folder: folder || 'earnhub_bd_uploads',
          resource_type: 'auto',
        });

        return res.json({
          success: true,
          url: uploadResult.secure_url,
          publicId: uploadResult.public_id,
          format: uploadResult.format,
          bytes: uploadResult.bytes,
          provider: 'cloudinary',
          message: 'Image uploaded to Cloudinary successfully!',
        });
      } catch (cloudinaryErr: any) {
        console.warn('Cloudinary upload attempt failed:', cloudinaryErr?.message || cloudinaryErr);
        // Fallback: If it's already a valid external URL, return it
        if (typeof image === 'string' && (image.startsWith('http://') || image.startsWith('https://'))) {
          return res.json({
            success: true,
            url: image,
            provider: 'direct_url',
            warning: 'Cloudinary upload failed, retained original URL: ' + (cloudinaryErr?.message || ''),
          });
        }
        // Fallback: Return the data URI so user flow never breaks
        return res.json({
          success: true,
          url: image,
          provider: 'data_uri_fallback',
          warning: 'Stored as data URI because Cloudinary rejected the request: ' + (cloudinaryErr?.message || ''),
        });
      }
    } else {
      // Cloudinary is not configured yet with valid secret
      return res.json({
        success: true,
        url: image,
        provider: 'local_preview',
        warning: 'Cloudinary credentials are not fully configured in Admin Settings. Using direct image data.',
      });
    }
  } catch (err: any) {
    console.error('Upload route error:', err);
    return res.status(500).json({ error: err.message || 'Image processing failed' });
  }
});

// Cloudinary public configuration for client-side uploads (if preset is enabled)
router.get('/cloudinary/public-config', (req: Request, res: Response) => {
  const store = getStore();
  const cloudName = store.cloudinarySettings?.cloudName || process.env.CLOUDINARY_CLOUD_NAME || store.settings.cloudinaryCloudName || '';
  const uploadPreset = store.cloudinarySettings?.uploadPreset || process.env.CLOUDINARY_UPLOAD_PRESET || store.settings.cloudinaryUploadPreset || '';
  const apiKey = store.cloudinarySettings?.apiKey || process.env.CLOUDINARY_API_KEY || store.settings.cloudinaryApiKey || '';

  return res.json({
    cloudName,
    uploadPreset,
    apiKey,
    isConfigured: Boolean(cloudName && apiKey),
  });
});

// Get Cloudinary Settings (Admin only)
router.get('/admin/settings/cloudinary', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const cloudName = store.cloudinarySettings?.cloudName || process.env.CLOUDINARY_CLOUD_NAME || store.settings.cloudinaryCloudName || '';
  const apiKey = store.cloudinarySettings?.apiKey || process.env.CLOUDINARY_API_KEY || store.settings.cloudinaryApiKey || '';
  const hasSecret = Boolean(
    (store.cloudinarySettings?.apiSecret && store.cloudinarySettings.apiSecret !== '') ||
    process.env.CLOUDINARY_API_SECRET ||
    store.settings.cloudinaryApiSecret
  );
  const uploadPreset = store.cloudinarySettings?.uploadPreset || process.env.CLOUDINARY_UPLOAD_PRESET || store.settings.cloudinaryUploadPreset || '';

  return res.json({
    success: true,
    cloudinarySettings: {
      cloudName,
      apiKey,
      apiSecret: hasSecret ? '****************' : '',
      uploadPreset,
      isConfigured: Boolean(cloudName && apiKey && hasSecret),
    },
  });
});

// Update Cloudinary Settings (Admin only)
router.post('/admin/settings/cloudinary', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const admin = (req as any).admin;
  const { cloudName, apiKey, apiSecret, uploadPreset } = req.body;

  if (cloudName !== undefined) {
    store.cloudinarySettings.cloudName = cloudName.trim();
    store.settings.cloudinaryCloudName = cloudName.trim();
  }
  if (apiKey !== undefined) {
    store.cloudinarySettings.apiKey = apiKey.trim();
    store.settings.cloudinaryApiKey = apiKey.trim();
  }
  if (apiSecret && apiSecret.trim() !== '****************') {
    store.cloudinarySettings.apiSecret = apiSecret.trim();
    store.settings.cloudinaryApiSecret = apiSecret.trim();
  }
  if (uploadPreset !== undefined) {
    store.cloudinarySettings.uploadPreset = uploadPreset.trim();
    store.settings.cloudinaryUploadPreset = uploadPreset.trim();
  }

  store.cloudinarySettings.isConfigured = Boolean(
    store.cloudinarySettings.cloudName &&
    store.cloudinarySettings.apiKey &&
    store.cloudinarySettings.apiSecret &&
    store.cloudinarySettings.apiSecret !== '****************'
  );

  store.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: admin?.id || 'admin',
    adminName: admin?.name || 'Chief Admin',
    action: 'Configure Cloudinary Cloud Storage',
    target: store.cloudinarySettings.cloudName || 'Cloudinary',
    details: `Updated Cloudinary settings. Cloud Name: ${store.cloudinarySettings.cloudName}, Preset: ${store.cloudinarySettings.uploadPreset || 'None'}`,
    timestamp: new Date().toISOString(),
  });

  saveStore();
  return res.json({
    success: true,
    message: 'Cloudinary configuration saved successfully.',
    cloudinarySettings: {
      cloudName: store.cloudinarySettings.cloudName,
      apiKey: store.cloudinarySettings.apiKey,
      apiSecret: store.cloudinarySettings.apiSecret ? '****************' : '',
      uploadPreset: store.cloudinarySettings.uploadPreset,
      isConfigured: store.cloudinarySettings.isConfigured,
    },
  });
});

// Test Cloudinary Connection (Admin only)
router.post('/admin/cloudinary/test', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const store = getStore();
    const { cloudName, apiKey, apiSecret } = req.body;

    const targetCloudName = (cloudName || store.cloudinarySettings.cloudName || process.env.CLOUDINARY_CLOUD_NAME || '').trim();
    const targetApiKey = (apiKey || store.cloudinarySettings.apiKey || process.env.CLOUDINARY_API_KEY || '').trim();
    let targetApiSecret = (apiSecret || '').trim();

    if (!targetApiSecret || targetApiSecret === '****************') {
      targetApiSecret = store.cloudinarySettings.apiSecret || process.env.CLOUDINARY_API_SECRET || '';
    }

    if (!targetCloudName || !targetApiKey || !targetApiSecret || targetApiSecret === '****************') {
      return res.status(400).json({
        error: 'Cloud Name, API Key, and a valid API Secret are required to test the connection.',
      });
    }

    cloudinary.config({
      cloud_name: targetCloudName,
      api_key: targetApiKey,
      api_secret: targetApiSecret,
      secure: true,
    });

    const ping = await cloudinary.api.ping();

    return res.json({
      success: true,
      message: 'Cloudinary connection verified! Cloud name "' + targetCloudName + '" is active and authorized.',
      status: ping.status || 'ok',
    });
  } catch (err: any) {
    console.error('Cloudinary test error:', err);
    return res.status(400).json({
      error: 'Cloudinary connection failed: ' + (err.message || 'Invalid credentials or network issue'),
    });
  }
});

// 12. Fraud & Device Security Dashboard
router.get('/admin/fraud-dashboard', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  return res.json({
    deviceRecords: store.deviceFingerprints,
    trialWithdrawalCount: store.deviceFingerprints.filter(d => d.trialWithdrawalCompleted).length,
    multiAccountDevices: store.deviceFingerprints.filter(d => d.associatedUserIds.length > 1),
  });
});

// 13. Audit & Activity Logs
router.get(['/admin/logs', '/admin/activity-logs'], authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  return res.json({ logs: (store.activityLogs || []).slice(-100).reverse() });
});

// Global Admin Search
router.get('/admin/search', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const query = (req.query.q as string || '').trim().toLowerCase();
  if (!query) {
    return res.json({ results: { users: [], deposits: [], withdraws: [], tickets: [], promos: [] } });
  }

  const matchedUsers = store.users
    .filter(u => {
      const phoneMatch = u.phone.toLowerCase().includes(query);
      const refMatch = u.referralCode.toLowerCase().includes(query);
      const idMatch = u.id.toLowerCase().includes(query);
      return phoneMatch || refMatch || idMatch;
    })
    .slice(0, 15)
    .map(u => {
      const wallet = store.wallets.find(w => w.userId === u.id);
      const pkg = store.packages.find(p => p.id === u.activePackageId);
      return {
        id: u.id,
        phone: u.phone,
        name: `User ${u.phone.slice(-4)}`,
        balance: wallet ? wallet.balance : 0,
        activePackageId: pkg ? pkg.name : (u.isTrial ? 'Free Trial' : 'None'),
        referralCode: u.referralCode,
      };
    });

  const matchedDeposits = store.deposits
    .filter(d => {
      return (
        d.transactionId.toLowerCase().includes(query) ||
        d.userPhone.toLowerCase().includes(query) ||
        d.amount.toString().includes(query)
      );
    })
    .slice(0, 15);

  const matchedWithdraws = store.withdraws
    .filter(w => {
      return (
        w.withdrawNumber.toLowerCase().includes(query) ||
        w.userPhone.toLowerCase().includes(query) ||
        w.amount.toString().includes(query)
      );
    })
    .slice(0, 15);

  const matchedTickets = (store.supportTickets || [])
    .filter(t => {
      return (
        t.id.toLowerCase().includes(query) ||
        t.subject.toLowerCase().includes(query) ||
        t.userPhone.toLowerCase().includes(query)
      );
    })
    .slice(0, 15);

  const matchedPromos = (store.promoCodes || [])
    .filter(p => p.code.toLowerCase().includes(query))
    .slice(0, 15);

  return res.json({
    results: {
      users: matchedUsers,
      deposits: matchedDeposits,
      withdraws: matchedWithdraws,
      tickets: matchedTickets,
      promos: matchedPromos,
    },
  });
});

// Helper: Calculate user salary eligibility based on dynamic salary tiers
function calculateSalaryEligibility(user: User, tiers: SalaryTier[], allUsers: User[]) {
  // Direct Referrals (Level A)
  const directRefs = allUsers.filter((u) => u.referredBy === user.referralCode);
  const directPaidCount = directRefs.filter((u) => u.activePackageId && !u.isTrial).length;
  const directTotalCount = directRefs.length;

  // Level B (2nd Gen)
  const levelBRefs = allUsers.filter((u) => directRefs.some((dr) => dr.referralCode === u.referredBy));
  const levelBPaidCount = levelBRefs.filter((u) => u.activePackageId && !u.isTrial).length;

  // Level C (3rd Gen)
  const levelCRefs = allUsers.filter((u) => levelBRefs.some((lr) => lr.referralCode === u.referredBy));
  const levelCPaidCount = levelCRefs.filter((u) => u.activePackageId && !u.isTrial).length;

  const totalTeamPaidCount = directPaidCount + levelBPaidCount + levelCPaidCount;

  // Filter active tiers and sort descending by requiredReferrals
  const activeTiers = (tiers || [])
    .filter((t) => t.isActive !== false)
    .sort((a, b) => Number(b.requiredReferrals) - Number(a.requiredReferrals));

  for (const tier of activeTiers) {
    const reqCount = Number(tier.requiredReferrals) || 0;
    let userCount = directPaidCount;
    if (tier.referralType === 'total_paid') {
      userCount = totalTeamPaidCount;
    } else if (tier.referralType === 'direct_all') {
      userCount = directTotalCount;
    }

    if (userCount >= reqCount && reqCount > 0) {
      return {
        isEligible: true,
        tier,
        salaryAmount: Number(tier.salaryAmount) || 0,
        directPaidCount,
        directTotalCount,
        totalTeamPaidCount,
        effectiveCount: userCount,
      };
    }
  }

  return {
    isEligible: false,
    tier: null,
    salaryAmount: 0,
    directPaidCount,
    directTotalCount,
    totalTeamPaidCount,
    effectiveCount: directPaidCount,
  };
}

// 14. Monthly Salary Manager & Dynamic Tiers Endpoints
router.get(['/admin/salary/tiers', '/api/admin/salary/tiers'], authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const tiers: SalaryTier[] = store.salaryTiers || [];

  // Compute eligible counts for each tier
  const tiersWithStats = tiers.map((tier) => {
    let count = 0;
    store.users.forEach((user) => {
      const eligibility = calculateSalaryEligibility(user, tiers, store.users);
      if (eligibility.isEligible && eligibility.tier?.id === tier.id) {
        count++;
      }
    });
    return {
      ...tier,
      eligibleCount: count,
    };
  });

  const eligibleUsers = store.users
    .map((u) => {
      const eligibility = calculateSalaryEligibility(u, tiers, store.users);
      if (!eligibility.isEligible) return null;
      return {
        userId: u.id,
        phone: u.phone,
        role: u.role,
        tierId: eligibility.tier?.id,
        tierTitle: eligibility.tier?.roleName,
        salaryAmount: eligibility.salaryAmount,
        directPaidCount: eligibility.directPaidCount,
        totalTeamPaidCount: eligibility.totalTeamPaidCount,
        directTotalCount: eligibility.directTotalCount,
        effectiveCount: eligibility.effectiveCount,
      };
    })
    .filter(Boolean);

  const totalMonthlyLiability = eligibleUsers.reduce((sum, u: any) => sum + (u.salaryAmount || 0), 0);

  return res.json({
    success: true,
    tiers: tiersWithStats,
    eligibleCount: eligibleUsers.length,
    totalMonthlyLiability,
    eligibleUsers,
  });
});

router.post(['/admin/salary/tiers', '/api/admin/salary/tiers'], authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const admin = (req as any).admin || (req as any).user || { id: 'admin', name: 'Admin' };
  const { roleName, requiredReferrals, referralType, salaryAmount, badgeColor, description, isActive } = req.body;

  if (!roleName || !requiredReferrals || !salaryAmount) {
    return res.status(400).json({ error: 'Role name, required referrals, and salary amount are required.' });
  }

  if (!store.salaryTiers) {
    store.salaryTiers = [];
  }

  const newTier: SalaryTier = {
    id: `tier_${Date.now()}`,
    tierNumber: store.salaryTiers.length + 1,
    roleName: String(roleName).trim(),
    requiredReferrals: Math.max(1, Number(requiredReferrals)),
    referralType: referralType || 'direct_paid',
    salaryAmount: Math.max(10, Number(salaryAmount)),
    badgeColor: badgeColor || 'amber',
    description: description || `Min ${requiredReferrals} Active Referrals`,
    isActive: isActive !== false,
  };

  store.salaryTiers.push(newTier);

  store.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: admin.id || 'admin',
    adminName: admin.name || 'Admin',
    action: 'Create Salary Tier',
    target: newTier.roleName,
    details: `Added new salary tier: ${newTier.roleName} requiring ${newTier.requiredReferrals} (${newTier.referralType}) for ৳${newTier.salaryAmount}/mo.`,
    timestamp: new Date().toISOString(),
  });

  saveStore();
  return res.json({ success: true, tier: newTier, tiers: store.salaryTiers });
});

router.put(['/admin/salary/tiers/:id', '/api/admin/salary/tiers/:id'], authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const admin = (req as any).admin || (req as any).user || { id: 'admin', name: 'Admin' };
  const tier = (store.salaryTiers || []).find((t) => t.id === req.params.id);

  if (!tier) {
    return res.status(404).json({ error: 'Salary tier not found' });
  }

  const { roleName, requiredReferrals, referralType, salaryAmount, badgeColor, description, isActive } = req.body;

  if (roleName !== undefined) tier.roleName = String(roleName).trim();
  if (requiredReferrals !== undefined) tier.requiredReferrals = Math.max(1, Number(requiredReferrals));
  if (referralType !== undefined) tier.referralType = referralType;
  if (salaryAmount !== undefined) tier.salaryAmount = Math.max(10, Number(salaryAmount));
  if (badgeColor !== undefined) tier.badgeColor = badgeColor;
  if (description !== undefined) tier.description = description;
  if (isActive !== undefined) tier.isActive = Boolean(isActive);

  store.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: admin.id || 'admin',
    adminName: admin.name || 'Admin',
    action: 'Update Salary Tier',
    target: tier.roleName,
    details: `Updated salary tier: ${tier.roleName} - Req: ${tier.requiredReferrals} (${tier.referralType}), Salary: ৳${tier.salaryAmount}`,
    timestamp: new Date().toISOString(),
  });

  saveStore();
  return res.json({ success: true, tier, tiers: store.salaryTiers });
});

router.delete(['/admin/salary/tiers/:id', '/api/admin/salary/tiers/:id'], authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const admin = (req as any).admin || (req as any).user || { id: 'admin', name: 'Admin' };
  const index = (store.salaryTiers || []).findIndex((t) => t.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: 'Salary tier not found' });
  }

  const [deletedTier] = store.salaryTiers.splice(index, 1);

  store.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: admin.id || 'admin',
    adminName: admin.name || 'Admin',
    action: 'Delete Salary Tier',
    target: deletedTier.roleName,
    details: `Deleted salary tier: ${deletedTier.roleName}`,
    timestamp: new Date().toISOString(),
  });

  saveStore();
  return res.json({ success: true, deletedTier, tiers: store.salaryTiers });
});

router.post(['/admin/salary/tiers/bulk', '/api/admin/salary/tiers/bulk'], authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const admin = (req as any).admin || (req as any).user || { id: 'admin', name: 'Admin' };
  const { tiers } = req.body;

  if (!Array.isArray(tiers)) {
    return res.status(400).json({ error: 'Tiers must be an array' });
  }

  store.salaryTiers = tiers.map((t, idx) => ({
    id: t.id || `tier_${Date.now()}_${idx}`,
    tierNumber: idx + 1,
    roleName: String(t.roleName || `Tier ${idx + 1}`).trim(),
    requiredReferrals: Math.max(1, Number(t.requiredReferrals) || 1),
    referralType: t.referralType || 'direct_paid',
    salaryAmount: Math.max(10, Number(t.salaryAmount) || 100),
    badgeColor: t.badgeColor || 'amber',
    description: t.description || `Min ${t.requiredReferrals} Active Referrals`,
    isActive: t.isActive !== false,
  }));

  store.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: admin.id || 'admin',
    adminName: admin.name || 'Admin',
    action: 'Bulk Update Salary Tiers',
    target: `${store.salaryTiers.length} Tiers`,
    details: `Updated all ${store.salaryTiers.length} monthly salary configuration tiers.`,
    timestamp: new Date().toISOString(),
  });

  saveStore();
  return res.json({ success: true, tiers: store.salaryTiers });
});

// Dynamic Salary Distribution Engine
router.post(['/admin/salary/distribute', '/api/admin/salary/distribute'], authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const admin = (req as any).admin || (req as any).user || { id: 'admin', name: 'Admin' };
  const tiers = store.salaryTiers || [];
  let distributedCount = 0;
  let totalDistributedAmount = 0;
  const distributedUsers: any[] = [];

  store.users.forEach((user) => {
    const eligibility = calculateSalaryEligibility(user, tiers, store.users);

    if (eligibility.isEligible && eligibility.salaryAmount > 0) {
      const salaryAmount = eligibility.salaryAmount;
      const wallet = store.wallets.find((w) => w.userId === user.id);
      if (wallet) {
        wallet.balance += salaryAmount;
        wallet.salaryIncome = (wallet.salaryIncome || 0) + salaryAmount;
        wallet.updatedAt = new Date().toISOString();

        const trxId = `trx_sal_${Date.now()}_${user.id.slice(-4)}`;
        store.transactions.push({
          id: trxId,
          userId: user.id,
          type: 'salary',
          amount: salaryAmount,
          description: `Monthly Leadership Salary [${eligibility.tier?.roleName}] (${eligibility.effectiveCount} Active Members)`,
          balanceAfter: wallet.balance,
          createdAt: new Date().toISOString(),
        });

        // Record to wallet ledger
        recordWalletLedgerEntry({
          userId: user.id,
          transactionType: 'Salary',
          amount: salaryAmount,
          balanceBefore: wallet.balance - salaryAmount,
          balanceAfter: wallet.balance,
          reason: `Monthly Leadership Salary [${eligibility.tier?.roleName}] (${eligibility.effectiveCount} Active Members)`,
          referenceId: trxId,
          createdBy: admin.name || 'System Admin',
          status: 'completed',
        });

        store.notifications.push({
          id: `notif_sal_${Date.now()}_${user.id.slice(-4)}`,
          userId: user.id,
          type: 'salary',
          title: 'Monthly Salary Credited! ৳' + salaryAmount,
          message: `Congratulations! ৳${salaryAmount} monthly leadership salary for [${eligibility.tier?.roleName}] has been credited to your balance.`,
          isRead: false,
          createdAt: new Date().toISOString(),
        });

        distributedCount++;
        totalDistributedAmount += salaryAmount;
        distributedUsers.push({
          userId: user.id,
          phone: user.phone,
          tierName: eligibility.tier?.roleName,
          amount: salaryAmount,
        });

        emitWalletUpdated(user.id, wallet);
      }
    }
  });

  store.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: admin.id || 'admin',
    adminName: admin.name || 'Admin',
    action: 'Distribute Monthly Salary',
    target: `${distributedCount} Leaders`,
    details: `Distributed total ৳${totalDistributedAmount} to ${distributedCount} qualifying leaders across active salary tiers.`,
    timestamp: new Date().toISOString(),
  });

  saveStore();
  return res.json({
    success: true,
    distributedCount,
    totalDistributedAmount,
    distributedUsers,
    message: `Successfully distributed ৳${totalDistributedAmount.toLocaleString()} to ${distributedCount} qualifying leaders.`,
  });
});

// 15. User Management Extra Actions
router.post(['/admin/users/:id/reset-password', '/api/admin/users/:id/reset-password'], authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const admin = (req as any).admin || (req as any).user || { id: 'admin', name: 'Admin' };
  const user = store.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const newPass = req.body.newPassword || '123456';
  user.passwordHash = bcrypt.hashSync(newPass, 10);
  saveStore();

  store.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: admin.id || 'admin',
    adminName: admin.name || 'Admin',
    action: 'Reset Password',
    target: user.phone,
    details: `Password reset to temporary password.`,
    timestamp: new Date().toISOString(),
  });
  saveStore();

  return res.json({ success: true, message: `Password reset for ${user.phone}. New password: ${newPass}` });
});

router.post(['/admin/users/:id/change-package', '/api/admin/users/:id/change-package'], authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const admin = (req as any).admin || (req as any).user || { id: 'admin', name: 'Admin' };
  const user = store.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { packageId } = req.body;
  user.activePackageId = packageId;
  user.isTrial = false;
  user.packageActivatedAt = new Date().toISOString();

  store.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: admin.id || 'admin',
    adminName: admin.name || 'Admin',
    action: 'Change User Package',
    target: user.phone,
    details: `Assigned package ID: ${packageId}`,
    timestamp: new Date().toISOString(),
  });
  saveStore();

  return res.json({ success: true, message: `Package updated for ${user.phone}` });
});

router.post(['/admin/users/:id/reset-trial', '/api/admin/users/:id/reset-trial'], authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const admin = (req as any).admin || (req as any).user || { id: 'admin', name: 'Admin' };
  const user = store.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.isTrial = true;
  user.trialDaysUsed = 0;
  user.trialTotalEarned = 0;
  user.trialMissedDays = 0;
  user.trialExpired = false;
  user.trialStartDate = new Date().toISOString().split('T')[0];

  store.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: admin.id || 'admin',
    adminName: admin.name || 'Admin',
    action: 'Reset Free Trial',
    target: user.phone,
    details: `Reset 3-day free trial counter to fresh state.`,
    timestamp: new Date().toISOString(),
  });
  saveStore();

  return res.json({ success: true, message: `Free trial reset for ${user.phone}` });
});

router.post(['/admin/security/ban-device', '/api/admin/security/ban-device'], authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const admin = (req as any).admin || (req as any).user || { id: 'admin', name: 'Admin' };
  const { deviceFingerprint } = req.body;
  if (!deviceFingerprint) return res.status(400).json({ error: 'deviceFingerprint is required' });

  store.users.forEach((u) => {
    if (u.deviceFingerprint === deviceFingerprint) {
      u.isBanned = true;
      u.status = 'suspended';
    }
  });

  store.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: admin.id || 'admin',
    adminName: admin.name || 'Admin',
    action: 'Ban Device Fingerprint',
    target: deviceFingerprint,
    details: `Banned device and suspended all associated user accounts.`,
    timestamp: new Date().toISOString(),
  });
  saveStore();

  return res.json({ success: true, message: `Device ${deviceFingerprint} and all associated accounts banned.` });
});

// 16. Admin Users Management (Main Admin only)
router.get('/admin/admin-users', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const safeAdmins = (store.adminUsers || []).map(a => ({
    id: a.id,
    phone: a.phone,
    name: a.name,
    role: a.role,
    permissions: a.permissions || [],
    status: a.status || 'active',
    email: a.email || '',
    lastLoginAt: a.lastLoginAt,
    createdAt: a.createdAt,
  }));
  return res.json({ adminUsers: safeAdmins });
});

router.post('/admin/admin-users', authenticateAdmin, (req: Request, res: Response) => {
  const currentAdmin = (req as any).user || (req as any).admin;
  if (currentAdmin.role !== 'Main Admin') {
    return res.status(403).json({ error: 'Only Main Admin can create new admin users.' });
  }

  const { phone, name, role, password, permissions, email } = req.body;
  if (!phone || !name || !role || !password) {
    return res.status(400).json({ error: 'Phone, name, role, and password are required.' });
  }

  const store = getStore();
  const normalizedPhone = normalizeBdPhone(phone);
  if (store.adminUsers.some(a => a.phone === normalizedPhone)) {
    return res.status(400).json({ error: 'An admin user with this phone number already exists.' });
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);

  const newAdmin: AdminUser = {
    id: `admin_${Date.now()}`,
    phone: normalizedPhone,
    name: name.trim(),
    role: role as any,
    passwordHash,
    permissions: permissions || ['dashboard'],
    status: 'active',
    email: email || '',
    createdAt: new Date().toISOString(),
  };

  store.adminUsers.push(newAdmin);

  store.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: currentAdmin.id,
    adminName: currentAdmin.name || 'Main Admin',
    action: 'Create Admin User',
    target: newAdmin.phone,
    details: `Created admin user ${newAdmin.name} with role ${newAdmin.role}`,
    timestamp: new Date().toISOString(),
  });

  saveStore();

  return res.json({
    success: true,
    message: `Admin user ${newAdmin.name} (${newAdmin.role}) created successfully.`,
    adminUser: {
      id: newAdmin.id,
      phone: newAdmin.phone,
      name: newAdmin.name,
      role: newAdmin.role,
      permissions: newAdmin.permissions,
      status: newAdmin.status,
    },
  });
});

router.post('/admin/admin-users/:id/update', authenticateAdmin, (req: Request, res: Response) => {
  const currentAdmin = (req as any).user || (req as any).admin;
  if (currentAdmin.role !== 'Main Admin') {
    return res.status(403).json({ error: 'Only Main Admin can update admin users.' });
  }

  const store = getStore();
  const targetAdmin = store.adminUsers.find(a => a.id === req.params.id);
  if (!targetAdmin) return res.status(404).json({ error: 'Admin user not found.' });

  const { name, role, permissions, status, email, newPassword } = req.body;
  if (name !== undefined) targetAdmin.name = name.trim();
  if (role !== undefined) targetAdmin.role = role;
  if (permissions !== undefined) targetAdmin.permissions = permissions;
  if (status !== undefined) targetAdmin.status = status;
  if (email !== undefined) targetAdmin.email = email;
  if (newPassword && newPassword.length >= 6) {
    const salt = bcrypt.genSaltSync(10);
    targetAdmin.passwordHash = bcrypt.hashSync(newPassword, salt);
  }

  store.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: currentAdmin.id,
    adminName: currentAdmin.name || 'Main Admin',
    action: 'Update Admin User',
    target: targetAdmin.phone,
    details: `Updated settings for admin ${targetAdmin.name}`,
    timestamp: new Date().toISOString(),
  });

  saveStore();
  return res.json({ success: true, message: 'Admin user updated successfully.' });
});

router.delete('/admin/admin-users/:id', authenticateAdmin, (req: Request, res: Response) => {
  const currentAdmin = (req as any).user || (req as any).admin;
  if (currentAdmin.role !== 'Main Admin') {
    return res.status(403).json({ error: 'Only Main Admin can delete admin accounts.' });
  }

  const store = getStore();
  const idx = store.adminUsers.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Admin user not found.' });

  const target = store.adminUsers[idx];
  if (target.id === currentAdmin.id) {
    return res.status(400).json({ error: 'You cannot delete your own active administrator account.' });
  }

  store.adminUsers.splice(idx, 1);

  store.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: currentAdmin.id,
    adminName: currentAdmin.name || 'Main Admin',
    action: 'Delete Admin User',
    target: target.phone,
    details: `Deleted admin account ${target.name} (${target.phone})`,
    timestamp: new Date().toISOString(),
  });

  saveStore();
  return res.json({ success: true, message: `Admin account ${target.name} deleted.` });
});

// 17. Roles Matrix
router.get('/admin/roles', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  return res.json({ roles: store.roles || [] });
});

router.post('/admin/roles', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const { roles } = req.body;
  if (Array.isArray(roles)) {
    store.roles = roles;
    saveStore();
  }
  return res.json({ success: true, roles: store.roles });
});

// 18. Support Tickets CRM
router.get('/admin/support/tickets', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const { status, priority, search } = req.query;
  let list = [...(store.supportTickets || [])];

  if (status && status !== 'all') {
    list = list.filter(t => t.status === status);
  }
  if (priority && priority !== 'all') {
    list = list.filter(t => t.priority === priority);
  }
  if (search && typeof search === 'string') {
    const q = search.toLowerCase();
    list = list.filter(t =>
      t.userPhone.includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q)
    );
  }

  return res.json({ tickets: list.reverse() });
});

router.get('/admin/support/tickets/:id', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const ticket = (store.supportTickets || []).find(t => t.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  return res.json({ ticket });
});

router.post('/admin/support/tickets/:id/reply', authenticateAdmin, (req: Request, res: Response) => {
  const currentAdmin = (req as any).user || (req as any).admin;
  const store = getStore();
  const ticket = (store.supportTickets || []).find(t => t.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const { message, attachmentUrl, setStatus } = req.body;
  if (!message) return res.status(400).json({ error: 'Reply message cannot be empty' });

  const newMsg: SupportMessage = {
    id: `msg_${Date.now()}`,
    senderId: currentAdmin.id,
    senderName: `${currentAdmin.name || 'Admin'} (Support Team)`,
    senderType: 'admin',
    message: message.trim(),
    attachmentUrl,
    createdAt: new Date().toISOString(),
  };

  ticket.messages.push(newMsg);
  ticket.updatedAt = new Date().toISOString();
  if (setStatus && ['open', 'in_progress', 'resolved', 'closed'].includes(setStatus)) {
    ticket.status = setStatus;
  } else if (ticket.status === 'open') {
    ticket.status = 'in_progress';
  }

  store.notifications.push({
    id: `notif_${Date.now()}`,
    userId: ticket.userId,
    type: 'task',
    title: 'Support Ticket Update',
    message: `New reply on ticket #${ticket.id}: ${message.slice(0, 80)}...`,
    isRead: false,
    createdAt: new Date().toISOString(),
  });

  saveStore();
  emitNotificationNew(ticket.userId, store.notifications[store.notifications.length - 1]);

  return res.json({ success: true, ticket, message: newMsg });
});

router.post('/admin/support/tickets/:id/status', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const ticket = (store.supportTickets || []).find(t => t.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const { status } = req.body;
  if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid ticket status' });
  }

  ticket.status = status;
  ticket.updatedAt = new Date().toISOString();
  saveStore();

  return res.json({ success: true, ticket });
});

// Public / User Support Tickets
router.get(['/support/tickets', '/api/support/tickets'], authenticateUser, (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const store = getStore();
  const userTickets = (store.supportTickets || []).filter(t => t.userId === user.id);
  return res.json({ tickets: userTickets.reverse() });
});

router.post(['/support/tickets', '/api/support/tickets'], authenticateUser, (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { subject, category, priority, message, attachmentUrl } = req.body;

  if (!subject || !message) {
    return res.status(400).json({ error: 'Subject and message are required.' });
  }

  const store = getStore();
  const newTicket: SupportTicket = {
    id: `tkt_${Date.now().toString().slice(-6)}`,
    userId: user.id,
    userPhone: user.phone,
    subject: subject.trim(),
    category: category || 'General Inquiry',
    priority: priority || 'medium',
    status: 'open',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [
      {
        id: `msg_${Date.now()}`,
        senderId: user.id,
        senderName: user.phone,
        senderType: 'user',
        message: message.trim(),
        attachmentUrl,
        createdAt: new Date().toISOString(),
      },
    ],
  };

  if (!store.supportTickets) store.supportTickets = [];
  store.supportTickets.push(newTicket);
  saveStore();

  return res.json({ success: true, ticket: newTicket });
});

// 19. Homepage Sliders Management
router.get('/admin/sliders', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  return res.json({ sliders: (store.sliders || []).sort((a, b) => a.sortOrder - b.sortOrder) });
});

router.get('/sliders', (req: Request, res: Response) => {
  const store = getStore();
  const activeSliders = (store.sliders || [])
    .filter(s => s.status === 'active')
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return res.json({ sliders: activeSliders });
});

router.get('/sliders/public', (req: Request, res: Response) => {
  const store = getStore();
  const activeSliders = (store.sliders || [])
    .filter(s => s.status === 'active')
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return res.json({ sliders: activeSliders });
});

router.post('/admin/sliders', authenticateAdmin, (req: Request, res: Response) => {
  const { title, subtitle, tag, imageUrl, buttonText, buttonLink, status, sortOrder, startDate, endDate } = req.body;
  if (!title || !imageUrl) {
    return res.status(400).json({ error: 'Slider title and image URL are required' });
  }

  const store = getStore();
  const newSlider: HomeSlider = {
    id: `slide_${Date.now()}`,
    title: title.trim(),
    subtitle: subtitle || '',
    tag: tag || '',
    imageUrl,
    buttonText: buttonText || 'Learn More',
    buttonLink: buttonLink || '/',
    status: status || 'active',
    sortOrder: Number(sortOrder) || (store.sliders.length + 1),
    startDate,
    endDate,
    createdAt: new Date().toISOString(),
  };

  if (!store.sliders) store.sliders = [];
  store.sliders.push(newSlider);
  saveStore();

  return res.json({ success: true, slider: newSlider });
});

router.post('/admin/sliders/:id/update', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const slider = (store.sliders || []).find(s => s.id === req.params.id);
  if (!slider) return res.status(404).json({ error: 'Slider not found' });

  const { title, subtitle, tag, imageUrl, buttonText, buttonLink, status, sortOrder, startDate, endDate } = req.body;
  if (title !== undefined) slider.title = title.trim();
  if (subtitle !== undefined) slider.subtitle = subtitle;
  if (tag !== undefined) slider.tag = tag;
  if (imageUrl !== undefined) slider.imageUrl = imageUrl;
  if (buttonText !== undefined) slider.buttonText = buttonText;
  if (buttonLink !== undefined) slider.buttonLink = buttonLink;
  if (status !== undefined) slider.status = status;
  if (sortOrder !== undefined) slider.sortOrder = Number(sortOrder);
  if (startDate !== undefined) slider.startDate = startDate;
  if (endDate !== undefined) slider.endDate = endDate;

  saveStore();
  return res.json({ success: true, slider });
});

router.post('/admin/sliders/:id/toggle', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const slider = (store.sliders || []).find(s => s.id === req.params.id);
  if (!slider) return res.status(404).json({ error: 'Slider not found' });

  slider.status = slider.status === 'active' ? 'inactive' : 'active';
  saveStore();
  return res.json({ success: true, slider });
});

router.delete('/admin/sliders/:id', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const idx = (store.sliders || []).findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Slider not found' });

  store.sliders.splice(idx, 1);
  saveStore();
  return res.json({ success: true, message: 'Slider deleted successfully' });
});

// 20. Video Tasks Admin Management (CRUD with Cloudinary Support)
router.get('/admin/tasks', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  return res.json({ tasks: store.videoTasks || [] });
});

router.post('/admin/tasks', authenticateAdmin, (req: Request, res: Response) => {
  const { title, videoUrl, thumbnailUrl, rewardAmount, durationSeconds, category, requiredPackageId, enabled } = req.body;
  if (!title || !videoUrl) {
    return res.status(400).json({ error: 'Task title and video URL are required' });
  }

  const store = getStore();
  const newTask: VideoTask = {
    id: `task_${Date.now()}`,
    title: title.trim(),
    videoUrl,
    thumbnailUrl: thumbnailUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600',
    rewardAmount: Number(rewardAmount) || 25,
    durationSeconds: 10, // STRICT 10-second requirement
    category: category || 'Sponsor Ads',
    requiredPackageId: requiredPackageId || 'all',
    enabled: enabled !== undefined ? Boolean(enabled) : true,
    createdAt: new Date().toISOString(),
  };

  store.videoTasks.push(newTask);
  saveStore();

  return res.json({ success: true, task: newTask });
});

router.post('/admin/tasks/:id/update', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const task = store.videoTasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { title, videoUrl, thumbnailUrl, rewardAmount, category, requiredPackageId, enabled } = req.body;
  if (title !== undefined) task.title = title.trim();
  if (videoUrl !== undefined) task.videoUrl = videoUrl;
  if (thumbnailUrl !== undefined) task.thumbnailUrl = thumbnailUrl;
  if (rewardAmount !== undefined) task.rewardAmount = Number(rewardAmount);
  if (category !== undefined) task.category = category;
  if (requiredPackageId !== undefined) task.requiredPackageId = requiredPackageId;
  if (enabled !== undefined) task.enabled = Boolean(enabled);
  task.durationSeconds = 10; // strictly 10s

  saveStore();
  return res.json({ success: true, task });
});

router.post('/admin/tasks/:id/toggle', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const task = store.videoTasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  task.enabled = !task.enabled;
  saveStore();
  return res.json({ success: true, task });
});

router.delete('/admin/tasks/:id', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const idx = store.videoTasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Task not found' });

  store.videoTasks.splice(idx, 1);
  saveStore();
  return res.json({ success: true, message: 'Task deleted successfully' });
});

// 21. System Health & Diagnostics
router.get('/admin/system/health', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const uptime = process.uptime();
  const memory = process.memoryUsage();

  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const uptimeFormatted = `${days}d ${hours}h ${minutes}m`;

  const isCloudinaryReady = configureCloudinary();

  const healthData: SystemHealthInfo = {
    serverStatus: 'healthy',
    uptimeSeconds: Math.floor(uptime),
    uptimeFormatted,
    nodeVersion: process.version,
    memoryUsageMb: Math.round(memory.rss / (1024 * 1024)),
    heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024)),
    totalMemoryMb: Math.round(memory.heapTotal / (1024 * 1024)),
    socketConnections: getOnlineUserCount() || 1,
    cloudinaryStatus: isCloudinaryReady ? 'connected' : 'unconfigured',
    databaseStatus: 'connected',
    lastBackupAt: new Date().toISOString(),
    timestamp: new Date().toISOString(),
  };

  return res.json({
    health: healthData,
    counts: {
      users: store.users.length,
      deposits: store.deposits.length,
      withdraws: store.withdraws.length,
      tasks: store.videoTasks.length,
      tickets: (store.supportTickets || []).length,
      logs: store.activityLogs.length,
      sliders: (store.sliders || []).length,
    },
  });
});

// 22. Global Admin Search across all entities
router.get('/admin/global-search', authenticateAdmin, (req: Request, res: Response) => {
  const { q } = req.query;
  if (!q || typeof q !== 'string' || q.trim().length < 2) {
    return res.json({ users: [], deposits: [], withdraws: [], transactions: [], tickets: [] });
  }

  const query = q.trim().toLowerCase();
  const store = getStore();

  const users = store.users
    .filter(u => u.phone.includes(query) || u.id.toLowerCase().includes(query) || u.referralCode.toLowerCase().includes(query))
    .slice(0, 10);

  const deposits = store.deposits
    .filter(d => d.transactionId.toLowerCase().includes(query) || d.userPhone.includes(query) || d.senderNumber.includes(query))
    .slice(0, 10);

  const withdraws = store.withdraws
    .filter(w => w.withdrawNumber.includes(query) || w.userPhone.includes(query) || w.id.toLowerCase().includes(query))
    .slice(0, 10);

  const transactions = store.transactions
    .filter(t => t.id.toLowerCase().includes(query) || (t.description && t.description.toLowerCase().includes(query)))
    .slice(0, 10);

  const tickets = (store.supportTickets || [])
    .filter(t => t.id.toLowerCase().includes(query) || t.userPhone.includes(query) || t.subject.toLowerCase().includes(query))
    .slice(0, 10);

  return res.json({ users, deposits, withdraws, transactions, tickets });
});

// 23. Broadcast Center
router.post('/admin/broadcast', authenticateAdmin, (req: Request, res: Response) => {
  const currentAdmin = (req as any).user || (req as any).admin;
  const { title, message, target, targetPhone, type } = req.body;

  if (!title || !message) {
    return res.status(400).json({ error: 'Broadcast title and message are required' });
  }

  const store = getStore();
  let recipientCount = 0;

  if (target === 'single' && targetPhone) {
    const user = store.users.find(u => u.phone === normalizeBdPhone(targetPhone));
    if (user) {
      const notif = {
        id: `notif_${Date.now()}`,
        userId: user.id,
        type: (type || 'task') as any,
        title,
        message,
        isRead: false,
        createdAt: new Date().toISOString(),
      };
      store.notifications.push(notif);
      emitNotificationNew(user.id, notif);
      recipientCount = 1;
    }
  } else {
    store.users.forEach(u => {
      let match = false;
      if (target === 'all') match = true;
      else if (target === 'free' && u.isTrial) match = true;
      else if (target === 'paid' && !u.isTrial && u.activePackageId) match = true;

      if (match) {
        const notif = {
          id: `notif_${Date.now()}_${u.id.slice(-4)}`,
          userId: u.id,
          type: (type || 'task') as any,
          title,
          message,
          isRead: false,
          createdAt: new Date().toISOString(),
        };
        store.notifications.push(notif);
        emitNotificationNew(u.id, notif);
        recipientCount++;
      }
    });
  }

  store.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: currentAdmin.id,
    adminName: currentAdmin.name || 'Admin',
    action: 'Send Push Broadcast',
    target: target === 'single' ? targetPhone : `Target: ${target}`,
    details: `Broadcast sent to ${recipientCount} user(s). Title: ${title}`,
    timestamp: new Date().toISOString(),
  });

  saveStore();
  return res.json({ success: true, recipientCount, message: `Broadcast successfully dispatched to ${recipientCount} users.` });
});

// ==========================================
// MFS AUTOMATION & ANDROID VERIFY APP ROUTES
// ==========================================

// Middleware for Device Authentication
function authenticateDevice(req: Request, res: Response, next: () => void) {
  const authHeader = req.headers.authorization;
  const token =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : (req.query.token as string) || (req.body && req.body.deviceToken);

  const store = getStore();
  const settings = store.mfsSettings || getDefaultMfsSettings();

  if (!token) {
    return res.status(401).json({ error: 'Device authorization token required' });
  }

  // Master device token match
  if (token === settings.deviceSecretToken) {
    return next();
  }

  // Specific device token match
  const device = store.verifyDevices?.find((d) => d.deviceToken === token && !d.isBanned);
  if (device) {
    (req as any).verifyDevice = device;
    return next();
  }

  return res.status(403).json({ error: 'Invalid or banned device token' });
}

// 1. Android SMS Forwarder Gateway: Sync incoming SMS
router.post('/admin/sms/sync', authenticateDevice, (req: Request, res: Response) => {
  const store = getStore();
  const {
    deviceId,
    paymentMethod,
    trxId,
    amount,
    senderNumber,
    balanceAfter,
    smsTime,
    rawSms,
  } = req.body;

  let finalMethod = paymentMethod;
  let finalTrx = trxId;
  let finalAmount = Number(amount);
  let finalSender = senderNumber;
  let finalBalance = balanceAfter;
  let finalTime = smsTime;

  // Auto-parse if raw SMS is sent and fields are missing
  if (rawSms && (!finalTrx || !finalAmount || !finalMethod)) {
    const parsed = parseMfsSms(rawSms);
    if (parsed.isValid) {
      finalMethod = parsed.method;
      finalTrx = parsed.trxId;
      finalAmount = parsed.amount || 0;
      finalSender = parsed.senderNumber || finalSender;
      finalBalance = parsed.balanceAfter || finalBalance;
      finalTime = parsed.smsTime || finalTime;
    }
  }

  if (!finalTrx || !finalAmount || !finalMethod) {
    return res.status(400).json({
      error: 'Missing required SMS fields: trxId, amount, and paymentMethod are required',
    });
  }

  const normalizedTrx = finalTrx.trim().toUpperCase();

  // Check for duplicate SMS in store
  const existing = store.smsTransactions.find((s) => s.trxId.toUpperCase() === normalizedTrx);
  if (existing) {
    return res.json({
      success: true,
      message: 'SMS already received and indexed',
      duplicate: true,
      sms: existing,
    });
  }

  const newSms: SmsTransaction = {
    id: `sms_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    trxId: normalizedTrx,
    method: finalMethod === 'Nagad' ? 'Nagad' : 'bKash',
    amount: finalAmount,
    senderNumber: cleanBdPhone(finalSender || ''),
    balanceAfter: finalBalance || '',
    smsTime: finalTime || new Date().toISOString(),
    rawSms: rawSms || `Received Tk ${finalAmount} from ${finalSender}. TrxID ${normalizedTrx}`,
    deviceId: deviceId || 'android_app',
    verified: false,
    used: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  store.smsTransactions.unshift(newSms);

  // Update device stats
  if (deviceId) {
    const dev = store.verifyDevices.find((d) => d.deviceId === deviceId);
    if (dev) {
      dev.lastSyncAt = new Date().toISOString();
      dev.totalSmsForwarded += 1;
      dev.status = 'online';
    }
  }

  saveStore();

  // Instant Check: Are there any pending deposit requests waiting for this TrxID?
  checkPendingDepositsForIncomingSms(newSms);

  return res.json({
    success: true,
    message: 'SMS transaction synced and processed successfully',
    sms: newSms,
  });
});

// 2. Android Verify App Heartbeat (30-second ping)
router.post('/admin/verify-app/heartbeat', authenticateDevice, (req: Request, res: Response) => {
  const store = getStore();
  const { deviceId, batteryPercent, networkType, phoneNumber, appVersion } = req.body;

  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId is required' });
  }

  let device = store.verifyDevices.find((d) => d.deviceId === deviceId);
  if (!device) {
    device = {
      id: `dev_${Date.now()}`,
      deviceId,
      deviceName: 'Android SMS Gateway',
      phoneNumber: phoneNumber || '01712345678',
      deviceToken: (req.headers.authorization || '').replace('Bearer ', '').trim(),
      batteryPercent: batteryPercent ?? 100,
      networkType: networkType || 'WiFi',
      status: 'online',
      lastSyncAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      totalSmsForwarded: 0,
      appVersion: appVersion || '2.0.4',
      isBanned: false,
    };
    store.verifyDevices.push(device);
  } else {
    if (batteryPercent !== undefined) device.batteryPercent = batteryPercent;
    if (networkType) device.networkType = networkType;
    if (phoneNumber) device.phoneNumber = phoneNumber;
    if (appVersion) device.appVersion = appVersion;
    device.status = 'online';
    device.lastHeartbeatAt = new Date().toISOString();
  }

  saveStore();
  return res.json({
    success: true,
    timestamp: new Date().toISOString(),
    status: 'online',
  });
});

// 3. Get Connected Android Verify Devices
router.get('/admin/verify-app/devices', (req: Request, res: Response) => {
  const store = getStore();
  const now = Date.now();

  // Evaluate online/offline status: offline if heartbeat > 90 seconds ago
  const updatedDevices = (store.verifyDevices || []).map((d) => {
    const lastHb = new Date(d.lastHeartbeatAt).getTime();
    const isOffline = now - lastHb > 90000;
    return {
      ...d,
      status: d.isBanned ? 'offline' : isOffline ? 'offline' : 'online',
    };
  });

  return res.json({ devices: updatedDevices });
});

// 4. Ban / Unban Device
router.post('/admin/verify-app/devices/:id/ban', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const device = store.verifyDevices.find((d) => d.id === req.params.id);
  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }
  device.isBanned = !device.isBanned;
  saveStore();
  return res.json({ success: true, device });
});

// 5. MFS Settings: Get Settings
router.get('/admin/mfs/settings', (req: Request, res: Response) => {
  const store = getStore();
  return res.json({ settings: store.mfsSettings || getDefaultMfsSettings() });
});

// 6. MFS Settings: Update Settings
router.post('/admin/mfs/settings', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  if (!store.mfsSettings) store.mfsSettings = getDefaultMfsSettings();

  const {
    autoVerificationEnabled,
    manualVerificationEnabled,
    fallbackManualReview,
    verificationTimeoutMinutes,
    allowedSmsAgeHours,
    enableDeviceSync,
    deviceSecretToken,
    apkDownloadUrl,
    latestApkVersion,
    forceUpdateApk,
  } = req.body;

  if (autoVerificationEnabled !== undefined) store.mfsSettings.autoVerificationEnabled = Boolean(autoVerificationEnabled);
  if (manualVerificationEnabled !== undefined) store.mfsSettings.manualVerificationEnabled = Boolean(manualVerificationEnabled);
  if (fallbackManualReview !== undefined) store.mfsSettings.fallbackManualReview = Boolean(fallbackManualReview);
  if (verificationTimeoutMinutes !== undefined) store.mfsSettings.verificationTimeoutMinutes = Number(verificationTimeoutMinutes);
  if (allowedSmsAgeHours !== undefined) store.mfsSettings.allowedSmsAgeHours = Number(allowedSmsAgeHours);
  if (enableDeviceSync !== undefined) store.mfsSettings.enableDeviceSync = Boolean(enableDeviceSync);
  if (deviceSecretToken) store.mfsSettings.deviceSecretToken = String(deviceSecretToken).trim();
  if (apkDownloadUrl) store.mfsSettings.apkDownloadUrl = String(apkDownloadUrl).trim();
  if (latestApkVersion) store.mfsSettings.latestApkVersion = String(latestApkVersion).trim();
  if (forceUpdateApk !== undefined) store.mfsSettings.forceUpdateApk = Boolean(forceUpdateApk);

  saveStore();
  return res.json({ success: true, settings: store.mfsSettings });
});

// 7. Get All Synced SMS Transactions
router.get('/admin/sms/transactions', (req: Request, res: Response) => {
  const store = getStore();
  return res.json({ transactions: store.smsTransactions || [] });
});

// 8. SMS Gateway Simulator (Allows Admin to test incoming SMS parsing and auto-verification)
router.post('/admin/sms/simulate', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const { rawSms, method, amount, trxId, senderNumber } = req.body;

  let finalMethod = method;
  let finalTrx = trxId;
  let finalAmount = Number(amount);
  let finalSender = senderNumber;
  let finalBalance = '5,000.00';
  let finalTime = new Date().toISOString();

  let parsed: any = null;
  if (rawSms) {
    parsed = parseMfsSms(rawSms);
    if (parsed.isValid) {
      finalMethod = parsed.method;
      finalTrx = parsed.trxId;
      finalAmount = parsed.amount || 0;
      finalSender = parsed.senderNumber || finalSender;
      finalBalance = parsed.balanceAfter || finalBalance;
      finalTime = parsed.smsTime || finalTime;
    } else if (!finalTrx || !finalAmount) {
      return res.status(400).json({
        error: parsed.error || 'Failed to parse SMS. Please provide valid bKash or Nagad SMS content.',
      });
    }
  }

  if (!finalTrx || !finalAmount || !finalMethod) {
    return res.status(400).json({ error: 'trxId, amount, and payment method are required.' });
  }

  const normalizedTrx = finalTrx.trim().toUpperCase();

  const newSms: SmsTransaction = {
    id: `sms_${Date.now()}_sim`,
    trxId: normalizedTrx,
    method: finalMethod === 'Nagad' ? 'Nagad' : 'bKash',
    amount: finalAmount,
    senderNumber: cleanBdPhone(finalSender || '01711111111'),
    balanceAfter: finalBalance,
    smsTime: finalTime,
    rawSms: rawSms || `You have received Tk ${finalAmount} from ${finalSender}. TrxID ${normalizedTrx}`,
    deviceId: 'admin_sms_simulator',
    verified: false,
    used: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  store.smsTransactions.unshift(newSms);
  saveStore();

  // Trigger check for any pending deposit waiting for this TrxID
  checkPendingDepositsForIncomingSms(newSms);

  return res.json({
    success: true,
    message: 'SMS simulated successfully. Parsed and processed through auto-verification pipeline.',
    parsed,
    sms: newSms,
  });
});

// 9. Get Verification Logs & Fraud Alerts
router.get('/admin/mfs/logs', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  return res.json({
    verificationLogs: store.verificationLogs || [],
    fraudLogs: store.fraudLogs || [],
  });
});

// 10. Fraud Action (Resolve, Mark Fraud, Ban)
router.post('/admin/mfs/fraud-action', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const { logId, action } = req.body;

  const log = store.fraudLogs?.find((l) => l.id === logId);
  if (log) {
    log.resolved = true;
  }

  if (action === 'ban_user' && log && log.userId) {
    const user = store.users.find((u) => u.id === log.userId);
    if (user) {
      user.status = 'suspended';
    }
  }

  if (action === 'ban_device' && log && log.deviceId) {
    const dev = store.verifyDevices.find((d) => d.deviceId === log.deviceId);
    if (dev) {
      dev.isBanned = true;
    }
  }

  saveStore();
  return res.json({ success: true, message: `Fraud action '${action}' applied successfully.` });
});

// 11. Payment Numbers Management (Unlimited Pool)
router.get('/admin/mfs/numbers', (req: Request, res: Response) => {
  const store = getStore();
  return res.json({ numbers: store.paymentNumbers || [] });
});

router.post('/admin/mfs/numbers', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const { method, number, accountType, dailyLimit } = req.body;

  if (!method || !number) {
    return res.status(400).json({ error: 'Method and number are required' });
  }

  const cleanNum = cleanBdPhone(number);
  const newNum: PaymentNumber = {
    id: `pn_${Date.now()}`,
    method: method === 'Nagad' ? 'Nagad' : 'bKash',
    number: cleanNum,
    accountType: accountType || 'Personal',
    isActive: true,
    usageCount: 0,
    dailyLimit: Number(dailyLimit) || 50000,
    currentDailyVolume: 0,
  };

  store.paymentNumbers.push(newNum);
  saveStore();
  return res.json({ success: true, number: newNum });
});

router.post('/admin/mfs/numbers/:id/toggle', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const num = store.paymentNumbers.find((p) => p.id === req.params.id);
  if (!num) return res.status(404).json({ error: 'Number not found' });
  num.isActive = !num.isActive;
  saveStore();
  return res.json({ success: true, number: num });
});

router.delete('/admin/mfs/numbers/:id', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const idx = store.paymentNumbers.findIndex((p) => p.id === req.params.id);
  if (idx !== -1) {
    store.paymentNumbers.splice(idx, 1);
    saveStore();
  }
  return res.json({ success: true, message: 'Number deleted from pool' });
});

// 12. Upload / Update APK Metadata (Legacy & Enhanced)
router.post('/admin/mfs/upload-apk', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const { version, downloadUrl, forceUpdate, releaseNotes, fileSize } = req.body;

  if (!store.mfsSettings) store.mfsSettings = getDefaultMfsSettings();
  if (version) store.mfsSettings.latestApkVersion = version;
  if (downloadUrl) store.mfsSettings.apkDownloadUrl = downloadUrl;
  if (forceUpdate !== undefined) store.mfsSettings.forceUpdateApk = forceUpdate;

  if (version) {
    if (!store.apkVersions) store.apkVersions = [];
    store.apkVersions.forEach(v => { v.isCurrent = false; });
    store.apkVersions.unshift({
      id: `apk_${Date.now()}`,
      version,
      releaseNotes: releaseNotes || 'Official APK release with automated MFS background syncing.',
      fileSize: fileSize || '1.8 MB',
      downloadUrl: downloadUrl || '/downloads/EarnHubVerify.apk',
      downloadCount: 0,
      isCurrent: true,
      minSupportedVersion: '2.0.0',
      forceUpdate: Boolean(forceUpdate),
      releasedAt: new Date().toISOString(),
      uploadedBy: (req as any).admin?.name || 'Administrator',
    });
  }

  saveStore();
  return res.json({ success: true, settings: store.mfsSettings });
});

// ==========================================
// PATCH 7 — SMS QUEUE MANAGEMENT
// ==========================================
router.post('/admin/sms/retry-queue', authenticateAdmin, (req: Request, res: Response) => {
  const retriedCount = retryFailedSmsQueue();
  return res.json({
    success: true,
    retriedCount,
    message: `Processed ${retriedCount} queued SMS entries.`,
  });
});

router.get('/admin/sms/queue', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const queueItems = (store.smsTransactions || []).map(s => ({
    id: s.id,
    trxId: s.trxId,
    method: s.method,
    amount: s.amount,
    senderNumber: s.senderNumber,
    queueStatus: s.queueStatus || (s.used ? 'Used' : s.verified ? 'Verified' : 'Synced'),
    retryCount: s.retryCount || 0,
    deviceId: s.deviceId,
    createdAt: s.createdAt,
    usedByUser: s.usedByUser,
  }));
  return res.json({ queue: queueItems });
});

// ==========================================
// PATCH 10 — FRAUD DASHBOARD API (/admin/fraud)
// Widgets:
// 1. Duplicate Transaction IDs
// 2. Failed Auto-Verifications
// 3. Duplicate Sender Numbers
// 4. Suspicious Android Devices
// 5. Blocked Transactions
// 6. Blocked Android Devices
// Search & Filter: Search by Phone or TrxID
// Actions: Resolve, Ban User, Ban Device, Block Sender
// ==========================================
router.get('/admin/fraud/dashboard', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const now = Date.now();

  const fraudLogs = store.fraudLogs || [];
  const verificationLogs = store.verificationLogs || [];
  const devices = store.verifyDevices || [];

  // 1. Duplicate Transaction IDs
  const duplicateTrxLogs = fraudLogs.filter(f => f.type === 'duplicate_trx' || f.type === 'reused_trx');

  // 2. Failed Auto-Verifications
  const failedVerifications = verificationLogs.filter(v => (v.status as string) === 'fraud_mismatch' || (v.status as string) === 'fraud_duplicate' || (v.status as string) === 'manual_rejected');

  // 3. Duplicate Sender Numbers
  const duplicateSenderLogs = fraudLogs.filter(f => f.type === 'suspicious_sender_sharing' || f.type === 'wrong_sender');

  // 4. Suspicious Android Devices (offline > 90s, high failure rates, or unregistered)
  const suspiciousDevices = devices.filter(d => {
    const lastHb = d.lastHeartbeatAt ? new Date(d.lastHeartbeatAt).getTime() : 0;
    const isOffline = now - lastHb > 90000;
    return d.isBanned || isOffline;
  });

  // 5. Blocked Transactions
  const blockedTransactions = store.deposits.filter(d => d.status === 'rejected');

  // 6. Blocked Android Devices
  const blockedDevices = devices.filter(d => d.isBanned);

  return res.json({
    metrics: {
      duplicateTrxCount: duplicateTrxLogs.length,
      failedVerificationsCount: failedVerifications.length,
      duplicateSendersCount: duplicateSenderLogs.length,
      suspiciousDevicesCount: suspiciousDevices.length,
      blockedTransactionsCount: blockedTransactions.length,
      blockedDevicesCount: blockedDevices.length,
    },
    duplicateTrx: duplicateTrxLogs.slice(0, 50),
    failedVerifications: failedVerifications.slice(0, 50),
    duplicateSenders: duplicateSenderLogs.slice(0, 50),
    suspiciousDevices,
    blockedTransactions: blockedTransactions.slice(0, 50),
    blockedDevices,
    allFraudLogs: fraudLogs.slice(0, 100),
    allVerificationLogs: verificationLogs.slice(0, 100),
  });
});

router.post('/admin/fraud/action', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const { logId, action, targetId } = req.body;

  if (logId) {
    const log = store.fraudLogs?.find(f => f.id === logId);
    if (log) {
      log.resolved = true;
    }
  }

  let actionMessage = 'Fraud alert updated.';

  if (action === 'ban_user' && targetId) {
    const user = store.users.find(u => u.id === targetId || u.phone === targetId);
    if (user) {
      user.status = 'suspended';
      actionMessage = `User ${user.phone} (${user.id}) has been suspended.`;
    }
  } else if (action === 'ban_device' && targetId) {
    const dev = store.verifyDevices.find(d => d.deviceId === targetId || d.id === targetId);
    if (dev) {
      dev.isBanned = true;
      dev.status = 'offline';
      actionMessage = `Device ${dev.deviceId} has been blocked from forwarding SMS.`;
    }
  } else if (action === 'unban_device' && targetId) {
    const dev = store.verifyDevices.find(d => d.deviceId === targetId || d.id === targetId);
    if (dev) {
      dev.isBanned = false;
      dev.status = 'online';
      actionMessage = `Device ${dev.deviceId} has been unbanned.`;
    }
  } else if (action === 'resolve_all') {
    (store.fraudLogs || []).forEach(f => { f.resolved = true; });
    actionMessage = 'All fraud alerts marked as resolved.';
  }

  saveStore();
  return res.json({ success: true, message: actionMessage });
});

// ==========================================
// PATCH 11 & 12 — APK VERSION MANAGER
// ==========================================
router.get('/admin/apk/versions', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  return res.json({
    versions: store.apkVersions || [],
    currentSettings: store.mfsSettings || getDefaultMfsSettings(),
  });
});

router.post('/admin/apk/upload', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const { version, releaseNotes, fileSize, downloadUrl, forceUpdate, minSupportedVersion } = req.body;

  if (!version) {
    return res.status(400).json({ error: 'Version number is required (e.g. 2.0.5)' });
  }

  if (!store.apkVersions) store.apkVersions = [];
  store.apkVersions.forEach(v => { v.isCurrent = false; });

  const newVersion: ApkVersionRecord = {
    id: `apk_v${version.replace(/\./g, '')}_${Date.now()}`,
    version,
    releaseNotes: releaseNotes || 'EarnHub Verify APK update with enhanced telemetry and offline retry.',
    fileSize: fileSize || '1.8 MB',
    downloadUrl: downloadUrl || '/downloads/EarnHubVerify.apk',
    downloadCount: 0,
    isCurrent: true,
    minSupportedVersion: minSupportedVersion || '2.0.0',
    forceUpdate: Boolean(forceUpdate),
    releasedAt: new Date().toISOString(),
    uploadedBy: (req as any).admin?.name || 'Administrator',
  };

  store.apkVersions.unshift(newVersion);

  if (!store.mfsSettings) store.mfsSettings = getDefaultMfsSettings();
  store.mfsSettings.latestApkVersion = version;
  store.mfsSettings.apkDownloadUrl = newVersion.downloadUrl;
  store.mfsSettings.forceUpdateApk = Boolean(forceUpdate);

  saveStore();
  return res.json({ success: true, version: newVersion, settings: store.mfsSettings });
});

router.post('/admin/apk/toggle-force-update', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const { forceUpdate } = req.body;

  if (!store.mfsSettings) store.mfsSettings = getDefaultMfsSettings();
  store.mfsSettings.forceUpdateApk = Boolean(forceUpdate);

  if (store.apkVersions && store.apkVersions[0]) {
    store.apkVersions[0].forceUpdate = Boolean(forceUpdate);
  }

  saveStore();
  return res.json({ success: true, forceUpdate: store.mfsSettings.forceUpdateApk });
});

// Public APK version checker for Android clients
router.get(['/apk/latest', '/api/apk/latest'], (req: Request, res: Response) => {
  const store = getStore();
  const settings = store.mfsSettings || getDefaultMfsSettings();
  const currentRecord = store.apkVersions?.find(v => v.isCurrent) || store.apkVersions?.[0];

  return res.json({
    latestVersion: settings.latestApkVersion || '2.0.4',
    downloadUrl: settings.apkDownloadUrl || '/downloads/EarnHubVerify.apk',
    forceUpdate: settings.forceUpdateApk || false,
    fileSize: currentRecord?.fileSize || '1.8 MB',
    releaseNotes: currentRecord?.releaseNotes || 'EarnHub Verify V20 official native release.',
  });
});

// ==========================================
// PATCH 13 — FINANCIAL AUDIT LOGS & WALLET LEDGER
// ==========================================
router.get('/admin/financial/audit-logs', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  return res.json({ auditLogs: store.auditLogs || [] });
});

router.get('/admin/financial/ledger', authenticateAdmin, (req: Request, res: Response) => {
  const store = getStore();
  const { userId, type } = req.query;
  let ledger = store.walletTransactions || [];

  if (userId) {
    ledger = ledger.filter(l => l.userId === userId);
  }
  if (type) {
    ledger = ledger.filter(l => l.transactionType.toLowerCase() === (type as string).toLowerCase());
  }

  return res.json({ ledger: ledger.slice(0, 200) });
});

export default router;
