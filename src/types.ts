export type UserRole = 'Member' | 'Manager' | 'Middle Manager' | 'Senior Manager' | 'VIP';

export type AdminRole = 'Main Admin' | 'Manager Admin' | 'Finance Admin' | 'Marketing Admin' | 'Support Admin';

export interface User {
  id: string;
  phone: string;
  passwordHash?: string;
  role: UserRole;
  referralCode: string;
  referredBy?: string;
  createdAt: string;
  status: 'active' | 'suspended';
  
  // Free Trial System
  isTrial: boolean;
  trialStartDate?: string;
  trialDaysUsed: number;
  trialTotalEarned: number;
  trialMissedDays: number;
  trialExpired: boolean;
  freeWithdrawAllowed?: boolean; // Admin can permit individual free user to withdraw
  
  // Active Package
  activePackageId?: string;
  packageActivatedAt?: string;
  
  // Security & Withdraw Setup (LOCKED - Once set, cannot edit)
  withdrawSetupDone: boolean;
  withdrawMethod?: 'bKash' | 'Nagad';
  withdrawNumber?: string;
  withdrawPasswordHash?: string;
  
  deviceFingerprint: string;
  isBanned?: boolean;
  deviceUsedFreeTrial?: boolean;
  lastLoginIp?: string;
  lastLoginAt?: string;
  uplineInfo?: {
    referralCode: string;
    phone?: string;
    role?: string;
  };
}

export interface Wallet {
  userId: string;
  balance: number;
  pendingBalance?: number;
  totalDeposit: number;
  totalWithdraw: number;
  totalEarned: number;
  todayIncome: number;
  taskIncome?: number;
  referralIncome: number;
  giftIncome: number;
  salaryIncome: number;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  userId: string;
  type: 'deposit' | 'withdraw' | 'task_reward' | 'referral_bonus' | 'package_purchase' | 'salary' | 'gift' | 'promo_code';
  amount: number;
  fee?: number;
  description: string;
  balanceAfter: number;
  createdAt: string;
  referenceId?: string;
}

export interface Package {
  id: string;
  name: string;
  price: number; // in TK
  dailyIncome: number; // in TK
  videosPerDay: number;
  incomePerVideo: number; // in TK
  validityDays?: number;
  badgeColor: string;
  enabled: boolean;
  isPopular?: boolean;
}

export interface DepositRequest {
  id: string;
  userId: string;
  userPhone: string;
  amount: number;
  paymentMethod: 'bKash' | 'Nagad';
  assignedNumber: string;
  senderNumber: string;
  transactionId: string;
  screenshotUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  verificationType: 'manual' | 'hybrid' | 'auto';
  autoVerified?: boolean;
  matchedSmsId?: string;
  rejectedReason?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface SmsTransaction {
  id: string;
  trxId: string;
  method: 'bKash' | 'Nagad';
  amount: number;
  senderNumber: string;
  balanceAfter?: number | string;
  smsTime: string;
  rawSms: string;
  deviceId: string;
  verified: boolean;
  used: boolean;
  usedByUser?: string | null;
  matchedDepositId?: string | null;
  queueStatus?: 'Received' | 'Parsed' | 'Synced' | 'Verified' | 'Used' | 'Failed';
  retryCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface WalletTransactionLedger {
  id: string;
  userId: string;
  transactionType: 'Deposit Verification' | 'Referral Bonus' | 'Gift Balance' | 'Withdrawal' | 'Package Purchase' | 'Task Reward' | 'Salary' | 'Manual Adjustment';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reason: string;
  referenceId?: string;
  createdBy: string;
  status: 'completed' | 'pending' | 'failed' | 'rolled_back';
  createdAt: string;
}

export interface AuditLog {
  id: string;
  adminId: string;
  userId: string;
  action: string;
  oldBalance: number;
  newBalance: number;
  reference: string;
  ip: string;
  timestamp: string;
}

export interface ApkVersionRecord {
  id: string;
  version: string;
  releaseNotes: string;
  fileSize: string;
  downloadUrl: string;
  downloadCount: number;
  isCurrent: boolean;
  minSupportedVersion?: string;
  forceUpdate: boolean;
  releasedAt: string;
  uploadedBy?: string;
}

export interface VerifyDevice {
  id: string;
  deviceId: string;
  deviceName: string;
  phoneNumber: string;
  deviceToken: string;
  batteryPercent: number;
  networkType: string;
  status: 'online' | 'offline';
  lastSyncAt: string;
  lastHeartbeatAt: string;
  totalSmsForwarded: number;
  appVersion: string;
  isBanned: boolean;
}

export interface MfsVerificationSettings {
  autoVerificationEnabled: boolean;
  manualVerificationEnabled: boolean;
  fallbackManualReview: boolean;
  verificationTimeoutMinutes: number;
  allowedSmsAgeHours: number;
  enableDeviceSync: boolean;
  deviceSecretToken: string;
  apkDownloadUrl: string;
  latestApkVersion: string;
  forceUpdateApk: boolean;
}

export interface VerificationLog {
  id: string;
  depositId?: string;
  userId: string;
  userPhone?: string;
  trxId: string;
  paymentMethod: string;
  amount: number;
  status: 'auto_approved' | 'pending_unmatched' | 'fraud_duplicate' | 'fraud_mismatch' | 'manual_approved' | 'manual_rejected';
  score?: number;
  scoreBreakdown?: {
    trxIdMatch: boolean;
    amountMatch: boolean;
    senderMatch: boolean;
    methodMatch: boolean;
    unusedCheck: boolean;
    timeValid: boolean;
    senderOwnershipPassed: boolean;
  };
  matchedSmsId?: string;
  reason?: string;
  ipAddress?: string;
  createdAt: string;
}

export interface FraudLog {
  id: string;
  type: 'duplicate_trx' | 'reused_trx' | 'wrong_amount' | 'wrong_sender' | 'expired_sms' | 'suspicious_device' | 'suspicious_sender_sharing' | 'blocked_device' | 'duplicate_deposit_spam';
  severity: 'low' | 'medium' | 'high' | 'critical';
  trxId?: string;
  userId?: string;
  userPhone?: string;
  senderNumber?: string;
  deviceId?: string;
  details: string;
  createdAt: string;
  resolved?: boolean;
}

export interface WithdrawCard {
  id: string;
  amount: number; // in TK (e.g. 460, 1680, 5800, etc.)
  label?: string; // e.g., "Mini Payout", "Standard", "Executive VIP"
  badge?: string; // e.g., "POPULAR", "HOT", "VIP ONLY", "FAST PAYOUT", "STARTER"
  badgeColor?: 'emerald' | 'amber' | 'cyan' | 'purple' | 'rose' | 'blue';
  minRole?: UserRole | 'All';
  isTrialAllowed?: boolean; // whether available to free trial (like 100 TK card)
  enabled: boolean;
  order: number;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface WithdrawRequest {
  id: string;
  userId: string;
  userPhone: string;
  amount: number; // Gross amount
  fee: number; // 10%
  netAmount: number; // 90%
  paymentMethod: 'bKash' | 'Nagad';
  withdrawNumber: string;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  isTrialWithdraw?: boolean;
  deviceFingerprint: string;
  rejectedReason?: string;
  createdAt: string;
  updatedAt: string;
  timeline: {
    step: 'pending' | 'approved' | 'paid' | 'rejected';
    timestamp: string;
    note?: string;
  }[];
}

export interface VideoTask {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string;
  durationSeconds: number; // LOCKED: 10 Seconds
  rewardAmount: number;
  category: string;
  requiredPackageId?: string;
  enabled?: boolean;
  createdAt?: string;
}

export interface TaskHistory {
  id: string;
  userId: string;
  taskId: string;
  packageId: string;
  rewardEarned: number;
  completedAt: string;
  ipAddress?: string;
}

export interface PaymentNumber {
  id: string;
  method: 'bKash' | 'Nagad';
  number: string;
  accountType: 'Personal' | 'Agent' | 'Merchant';
  type?: string;
  isActive: boolean;
  usageCount: number;
  dailyLimit: number;
  currentDailyVolume: number;
}

export interface ReferralNode {
  userId: string;
  phone: string;
  role: UserRole;
  level: 'A' | 'B' | 'C';
  joinedAt: string;
  activePackageName?: string;
  commissionEarnedForUpline: number;
}

export interface ReferralCommission {
  id: string;
  fromUserId: string;
  fromUserPhone: string;
  toUserId: string;
  level: 'A' | 'B' | 'C';
  type: 'deposit_bonus' | 'video_commission' | 'package_bonus';
  percentage: number;
  commissionAmount: number;
  createdAt: string;
}

export interface PromoCode {
  id: string;
  code: string;
  rewardAmount: number;
  maxUsage: number;
  currentUsage: number;
  expiresAt: string;
  isActive: boolean;
  createdAt: string;
}

export interface Campaign {
  id: string;
  title: string;
  description: string;
  bannerUrl: string;
  type: 'popup' | 'banner' | 'festival';
  targetUrl?: string;
  isActive: boolean;
  startDate: string;
  endDate: string;
}

export interface Holiday {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  reason: string;
  tasksDisabled: boolean;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: 'deposit' | 'withdraw' | 'referral' | 'task' | 'gift' | 'salary' | 'campaign' | 'holiday';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface PromotionCampaign {
  id: string;
  title: string;
  description: string;
  bannerUrl: string;
  code: string;
  rewardAmount: number;
  isActive: boolean;
}

export interface SalaryTier {
  id: string;
  tierNumber: number;
  roleName: string; // e.g. "Manager", "Senior Manager", "VIP Regional Director", "Crown Director"
  requiredReferrals: number; // e.g. 10, 25, 50, 100
  referralType: 'direct_paid' | 'total_paid' | 'direct_all'; // "Direct Active Paid Members" | "Total Team Paid" | "Direct Total Signups"
  salaryAmount: number; // in TK (e.g. 5000, 12000, 25000)
  badgeColor?: 'amber' | 'cyan' | 'purple' | 'emerald' | 'rose' | 'blue' | 'yellow' | 'indigo';
  description?: string;
  isActive: boolean;
  eligibleCount?: number;
}

export interface SalarySettings {
  enabled: boolean;
  autoDistributionDay: number; // 1 to 31 (e.g. 1st of every month)
  distributionPeriod: 'monthly' | 'weekly';
  referralCountRule: 'direct_paid' | 'total_paid' | 'direct_all';
  tiers: SalaryTier[];
}

export interface WebsiteSettings {
  websiteName: string;
  tagline: string;
  logoUrl: string;
  mobileLogoUrl: string;
  whatsappNumber: string;
  telegramGroupUrl?: string;
  telegramChannelUrl?: string;
  facebookGroupUrl?: string;
  youtubeTutorialUrl?: string;
  appDownloadUrl?: string;
  marqueeNotice?: string;
  themePrimaryColor: string;
  footerText: string;
  minDepositAmount?: number;
  maxDepositAmount?: number;
  minWithdrawAmount?: number;
  maxWithdrawAmount?: number;
  withdrawFeePercentage?: number;
  signupBonusAmount?: number;
  withdrawOpeningHour: number; // e.g. 8
  withdrawClosingHour: number; // e.g. 23
  withdrawStartHour?: number;
  withdrawEndHour?: number;
  withdrawGloballyEnabled: boolean;
  isWithdrawDisabled?: boolean;
  allowFreeUserWithdrawal?: boolean; // When true, all free users can withdraw funds; when false, free users need permission or package
  hybridDepositVerificationEnabled: boolean;
  maintenanceMode?: boolean;
  levelAPercentage: number; // e.g. 10
  levelBPercentage: number; // e.g. 5
  levelCPercentage: number; // e.g. 2
  dailyTaskResetHour: number; // 0 = 12:00 AM
  sundayIsOffDay: boolean;
  cloudinaryCloudName?: string;
  cloudinaryApiKey?: string;
  cloudinaryApiSecret?: string;
  cloudinaryUploadPreset?: string;
}

export interface CloudinarySettings {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  uploadPreset?: string;
  isConfigured: boolean;
}

export interface AdminUser {
  id: string;
  phone: string;
  name: string;
  username?: string;
  role: AdminRole;
  passwordHash: string;
  permissions: string[];
  status?: 'active' | 'disabled';
  email?: string;
  lastLoginAt?: string;
  createdAt?: string;
}

export interface ActivityLog {
  id: string;
  adminId: string;
  adminName: string;
  action: string;
  target: string;
  details: string;
  oldValue?: string;
  newValue?: string;
  reason?: string;
  ip?: string;
  timestamp: string;
}

export interface DeviceFingerprintRecord {
  deviceFingerprint: string;
  associatedUserIds: string[];
  trialWithdrawalCompleted: boolean;
  trialWithdrawalDate?: string;
  trialWithdrawalAmount?: number;
  lastSeenIp: string;
  lastSeenAt: string;
}

export interface SupportMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderType: 'user' | 'admin';
  message: string;
  attachmentUrl?: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  userPhone: string;
  subject: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  createdAt: string;
  updatedAt: string;
  messages: SupportMessage[];
}

export interface HomeSlider {
  id: string;
  title: string;
  subtitle?: string;
  tag?: string;
  imageUrl: string;
  buttonText?: string;
  buttonLink?: string;
  startDate?: string;
  endDate?: string;
  status: 'active' | 'inactive';
  sortOrder: number;
  createdAt: string;
}

export interface RoleDefinition {
  id: string;
  roleName: AdminRole | string;
  description: string;
  permissions: string[];
  userCount?: number;
}

export interface SystemHealthInfo {
  serverStatus: 'healthy' | 'degraded' | 'offline';
  uptimeSeconds: number;
  uptimeFormatted: string;
  nodeVersion: string;
  memoryUsageMb: number;
  heapUsedMb: number;
  totalMemoryMb: number;
  socketConnections: number;
  cloudinaryStatus: 'connected' | 'unconfigured' | 'error';
  databaseStatus: 'connected' | 'syncing' | 'error';
  lastBackupAt?: string;
  timestamp: string;
}
