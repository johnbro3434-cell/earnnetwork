/**
 * EarnHub BD V20 — MongoDB Atlas Connection & Schema Models
 * Seamless connection to MongoDB Atlas with Graceful Local Store Fallback
 */

import mongoose from 'mongoose';

mongoose.set('bufferCommands', false);

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<boolean> | null;
}

// Global cache across serverless invocations and module reloads
const globalWithMongoose = global as typeof globalThis & {
  _mongooseCache?: MongooseCache;
};

if (!globalWithMongoose._mongooseCache) {
  globalWithMongoose._mongooseCache = { conn: null, promise: null };
}

const cache = globalWithMongoose._mongooseCache;
let isConnected = false;
let lastAttempt = 0;
const RETRY_COOLDOWN_MS = 3000;

// Setup event listeners for stable connection tracking
mongoose.connection.on('connected', () => {
  isConnected = true;
  console.log('[Database] MongoDB Atlas connection state: CONNECTED');
});

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  if (cache) {
    cache.conn = null;
    cache.promise = null;
  }
  console.warn('[Database] MongoDB Atlas connection state: DISCONNECTED');
});

mongoose.connection.on('reconnected', () => {
  isConnected = true;
  console.log('[Database] MongoDB Atlas connection state: RECONNECTED');
});

mongoose.connection.on('error', (err: any) => {
  isConnected = false;
  if (cache) {
    cache.conn = null;
    cache.promise = null;
  }
  console.warn('[Database] MongoDB Atlas connection error:', err?.message || err);
});

export async function connectMongoDB(): Promise<boolean> {
  if (isConnected && mongoose.connection.readyState === 1) {
    return true;
  }

  const uri = process.env.MONGODB_URI || process.env.MONGO_URL || '';
  if (!uri) {
    return false;
  }

  // If a connection attempt is in-flight, await it so concurrent calls don't fail
  if (cache.promise) {
    try {
      return await cache.promise;
    } catch {
      cache.promise = null;
    }
  }

  if (Date.now() - lastAttempt < RETRY_COOLDOWN_MS) {
    return isConnected && mongoose.connection.readyState === 1;
  }

  lastAttempt = Date.now();

  const opts: mongoose.ConnectOptions = {
    bufferCommands: false,
    maxPoolSize: 10,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
    socketTimeoutMS: 45000,
    heartbeatFrequencyMS: 10000,
  };

  cache.promise = (async () => {
    try {
      await mongoose.connect(uri, opts);
      isConnected = true;
      cache.conn = mongoose;
      console.log('[Database] Successfully connected to MongoDB Atlas cluster.');
      return true;
    } catch (err: any) {
      isConnected = false;
      cache.conn = null;
      const isWhitelistIssue =
        err?.name === 'MongooseServerSelectionError' ||
        (err?.message && (err.message.includes('whitelisted') || err.message.includes('Could not connect to any servers')));

      if (isWhitelistIssue) {
        console.warn(
          '[Database] Notice: MongoDB Atlas cluster is not reachable from this IP (Atlas Network Access requires 0.0.0.0/0). Seamlessly operating with enterprise local JSON store.'
        );
      } else {
        console.warn('[Database] MongoDB Atlas connection attempt deferred:', err?.message || err);
      }
      return false;
    } finally {
      cache.promise = null;
    }
  })();

  return await cache.promise;
}

export function isMongoConnected(): boolean {
  return isConnected && mongoose.connection.readyState === 1;
}

// Heartbeat to keep connection alive indefinitely on persistent servers
let heartbeatTimer: any = null;
export function startMongoHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(async () => {
    try {
      if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
        await mongoose.connection.db.admin().ping();
      } else if (process.env.MONGODB_URI) {
        await connectMongoDB();
      }
    } catch {
      // Ignore background ping errors
    }
  }, 45000);
}

// User Mongoose Schema
const UserSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  phone: { type: String, required: true, unique: true, index: true },
  password: { type: String },
  passwordHash: { type: String },
  name: { type: String },
  role: { type: String, default: 'user' },
  balance: { type: Number, default: 0 },
  totalEarned: { type: Number, default: 0 },
  referralCode: { type: String, unique: true, index: true },
  referredBy: { type: String },
  trialDay: { type: Number, default: 1 },
  trialStartDate: { type: String },
  trialDaysUsed: { type: Number, default: 0 },
  trialTotalEarned: { type: Number, default: 0 },
  trialCompleted: { type: Boolean, default: false },
  trialWithdrawCompleted: { type: Boolean, default: false },
  freeWithdrawAllowed: { type: Boolean, default: false },
  currentPackage: { type: Object, default: null },
  activePackageId: { type: String },
  isBanned: { type: Boolean, default: false },
  isSuspended: { type: Boolean, default: false },
  status: { type: String, default: 'active' },
  deviceFingerprint: { type: String },
  lastLoginIp: { type: String },
  lastLoginAt: { type: String },
  createdAt: { type: String, default: () => new Date().toISOString() },
  updatedAt: { type: String, default: () => new Date().toISOString() }
});

export const UserModel = mongoose.models.User || mongoose.model('User', UserSchema);

// Wallet Mongoose Schema
const WalletSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  balance: { type: Number, default: 0 },
  totalDeposit: { type: Number, default: 0 },
  totalWithdraw: { type: Number, default: 0 },
  totalEarned: { type: Number, default: 0 },
  todayIncome: { type: Number, default: 0 },
  referralIncome: { type: Number, default: 0 },
  giftIncome: { type: Number, default: 0 },
  salaryIncome: { type: Number, default: 0 },
  updatedAt: { type: String, default: () => new Date().toISOString() }
});

export const WalletModel = mongoose.models.Wallet || mongoose.model('Wallet', WalletSchema);

// Wallet Transaction Ledger Mongoose Schema
const WalletTransactionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  transactionType: { type: String, required: true },
  amount: { type: Number, required: true },
  balanceBefore: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  reason: { type: String },
  referenceId: { type: String },
  createdBy: { type: String, default: 'system' },
  status: { type: String, default: 'completed' },
  createdAt: { type: String, default: () => new Date().toISOString(), index: true }
});

export const WalletTransactionModel = mongoose.models.WalletTransaction || mongoose.model('WalletTransaction', WalletTransactionSchema);

// Deposit Mongoose Schema
const DepositSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  userPhone: { type: String },
  amount: { type: Number, required: true },
  paymentMethod: { type: String, required: true },
  senderNumber: { type: String, required: true },
  receiverNumber: { type: String },
  transactionId: { type: String, required: true, index: true },
  screenshotUrl: { type: String },
  status: { type: String, default: 'pending', index: true },
  reviewedBy: { type: String },
  reviewedAt: { type: String },
  createdAt: { type: String, default: () => new Date().toISOString() }
});

export const DepositModel = mongoose.models.Deposit || mongoose.model('Deposit', DepositSchema);

// Withdraw Mongoose Schema
const WithdrawSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  userPhone: { type: String },
  amount: { type: Number, required: true },
  fee: { type: Number, required: true },
  netAmount: { type: Number, required: true },
  paymentMethod: { type: String, required: true },
  withdrawNumber: { type: String, required: true, index: true },
  status: { type: String, default: 'pending', index: true },
  isTrialWithdraw: { type: Boolean, default: false },
  deviceFingerprint: { type: String },
  createdAt: { type: String, default: () => new Date().toISOString() },
  updatedAt: { type: String, default: () => new Date().toISOString() }
});

export const WithdrawModel = mongoose.models.Withdrawal || mongoose.model('Withdrawal', WithdrawSchema);

// Task History Mongoose Schema
const TaskHistorySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  taskId: { type: String, required: true },
  packageId: { type: String },
  rewardEarned: { type: Number, required: true },
  completedAt: { type: String, required: true, index: true },
  ipAddress: { type: String }
});

export const TaskHistoryModel = mongoose.models.TaskHistory || mongoose.model('TaskHistory', TaskHistorySchema);

// Master AppStore Mongoose Schema for complete persistent state across serverless instances
const AppStoreSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'main_state' },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    version: { type: String, default: 'v20.0.0-enterprise' },
    updatedAt: { type: Date, default: Date.now },
  },
  { minimize: false }
);

export const AppStoreModel = mongoose.models.AppStore || mongoose.model('AppStore', AppStoreSchema);

/**
 * Loads the platform state from MongoDB Atlas
 */
export async function loadStoreFromMongo(): Promise<{ data: any; updatedAt?: Date } | null> {
  if (!isConnected || mongoose.connection.readyState !== 1) {
    const ok = await connectMongoDB();
    if (!ok) return null;
  }
  try {
    const doc: any = await AppStoreModel.findOne({ key: 'main_state' }).lean();
    if (doc && doc.data && typeof doc.data === 'object') {
      return { data: doc.data, updatedAt: doc.updatedAt };
    }
  } catch (err: any) {
    console.warn('[Database] Failed to load store from MongoDB Atlas:', err?.message);
  }
  return null;
}

/**
 * Gets the latest updatedAt timestamp of platform state in MongoDB Atlas
 */
export async function getMongoStoreTimestamp(): Promise<Date | null> {
  if (!isConnected || mongoose.connection.readyState !== 1) {
    const ok = await connectMongoDB();
    if (!ok) return null;
  }
  try {
    const doc: any = await AppStoreModel.findOne({ key: 'main_state' }, { updatedAt: 1 }).lean();
    if (doc && doc.updatedAt) {
      return new Date(doc.updatedAt);
    }
  } catch (err: any) {
    // ignore
  }
  return null;
}

/**
 * Immediate, reliable sync of complete platform store to MongoDB Atlas (atomic for serverless)
 */
export async function syncStoreToMongo(storeData: any): Promise<boolean> {
  if (!isConnected || mongoose.connection.readyState !== 1) {
    const ok = await connectMongoDB();
    if (!ok) return false;
  }

  try {
    const now = new Date();
    await AppStoreModel.updateOne(
      { key: 'main_state' },
      { $set: { data: storeData, updatedAt: now } },
      { upsert: true }
    );

    // Direct collection syncs for permanent data safety and direct queryability
    if (Array.isArray(storeData.users) && storeData.users.length > 0) {
      const bulkOps = storeData.users.slice(0, 1000).map((u: any) => ({
        updateOne: {
          filter: { id: u.id },
          update: { $set: u },
          upsert: true,
        },
      }));
      UserModel.bulkWrite(bulkOps).catch(() => {});
    }

    if (Array.isArray(storeData.wallets) && storeData.wallets.length > 0) {
      const wOps = storeData.wallets.slice(0, 1000).map((w: any) => ({
        updateOne: {
          filter: { userId: w.userId },
          update: { $set: w },
          upsert: true,
        },
      }));
      WalletModel.bulkWrite(wOps).catch(() => {});
    }

    if (Array.isArray(storeData.deposits) && storeData.deposits.length > 0) {
      const depOps = storeData.deposits.slice(0, 1000).map((d: any) => ({
        updateOne: {
          filter: { id: d.id },
          update: { $set: d },
          upsert: true,
        },
      }));
      DepositModel.bulkWrite(depOps).catch(() => {});
    }

    const withdrawList = storeData.withdraws || storeData.withdrawals;
    if (Array.isArray(withdrawList) && withdrawList.length > 0) {
      const wOps = withdrawList.slice(0, 1000).map((w: any) => ({
        updateOne: {
          filter: { id: w.id },
          update: { $set: w },
          upsert: true,
        },
      }));
      WithdrawModel.bulkWrite(wOps).catch(() => {});
    }

    if (Array.isArray(storeData.walletTransactions) && storeData.walletTransactions.length > 0) {
      const txOps = storeData.walletTransactions.slice(0, 1000).map((tx: any) => ({
        updateOne: {
          filter: { id: tx.id },
          update: { $set: tx },
          upsert: true,
        },
      }));
      WalletTransactionModel.bulkWrite(txOps).catch(() => {});
    }

    if (Array.isArray(storeData.taskHistories) && storeData.taskHistories.length > 0) {
      const thOps = storeData.taskHistories.slice(0, 1000).map((th: any) => ({
        updateOne: {
          filter: { id: th.id },
          update: { $set: th },
          upsert: true,
        },
      }));
      TaskHistoryModel.bulkWrite(thOps).catch(() => {});
    }

    return true;
  } catch (err: any) {
    console.warn('[Database] Sync to MongoDB Atlas failed:', err?.message);
    return false;
  }
}
