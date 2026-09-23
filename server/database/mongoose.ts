/**
 * EarnHub BD V20 — MongoDB Atlas Connection & Schema Models
 * Seamless connection to MongoDB Atlas with Graceful Local Store Fallback
 */

import mongoose from 'mongoose';

mongoose.set('bufferCommands', false);

// Attach error listener to prevent unhandled EventEmitter error events
mongoose.connection.on('error', () => {
  isConnected = false;
});

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL || '';

let isConnected = false;
let isConnecting = false;
let lastAttempt = 0;
const RETRY_COOLDOWN_MS = 10 * 1000; // 10 second cooldown before retrying

export async function connectMongoDB(): Promise<boolean> {
  if (isConnected && mongoose.connection.readyState === 1) return true;

  const uri = process.env.MONGODB_URI || process.env.MONGO_URL || '';
  if (!uri) {
    return false;
  }

  // Prevent concurrent connection attempts
  if (isConnecting) return false;

  // Don't hammer the database if previous attempt timed out recently
  if (Date.now() - lastAttempt < RETRY_COOLDOWN_MS) {
    return false;
  }

  isConnecting = true;
  lastAttempt = Date.now();

  try {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    };
    await mongoose.connect(uri, opts);
    isConnected = true;
    console.log('[Database] Successfully connected to MongoDB Atlas cluster.');
    return true;
  } catch (err: any) {
    const isWhitelistIssue =
      err?.name === 'MongooseServerSelectionError' ||
      (err?.message && (err.message.includes('whitelisted') || err.message.includes('Could not connect to any servers')));

    if (isWhitelistIssue) {
      console.warn(
        '[Database] Notice: MongoDB Atlas cluster is not reachable from this IP (Atlas Network Access requires 0.0.0.0/0). Seamlessly operating with enterprise local JSON store.'
      );
    } else {
      console.warn('[Database] MongoDB Atlas connection deferred. Active store: enterprise local JSON engine.');
    }
    isConnected = false;
    return false;
  } finally {
    isConnecting = false;
  }
}

export function isMongoConnected(): boolean {
  return isConnected;
}

// User Mongoose Schema
const UserSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  phone: { type: String, required: true, unique: true, index: true },
  password: { type: String, required: true },
  name: { type: String },
  role: { type: String, default: 'user' },
  balance: { type: Number, default: 0 },
  totalEarned: { type: Number, default: 0 },
  referralCode: { type: String, unique: true, index: true },
  referredBy: { type: String },
  trialDay: { type: Number, default: 1 },
  trialStartDate: { type: String },
  trialCompleted: { type: Boolean, default: false },
  trialWithdrawCompleted: { type: Boolean, default: false },
  freeWithdrawAllowed: { type: Boolean, default: false },
  currentPackage: { type: Object, default: null },
  isBanned: { type: Boolean, default: false },
  isSuspended: { type: Boolean, default: false },
  createdAt: { type: String, default: () => new Date().toISOString() },
  updatedAt: { type: String, default: () => new Date().toISOString() }
});

export const UserModel = mongoose.models.User || mongoose.model('User', UserSchema);

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
export async function loadStoreFromMongo(): Promise<any | null> {
  if (!isConnected) {
    const ok = await connectMongoDB();
    if (!ok) return null;
  }
  try {
    const doc: any = await AppStoreModel.findOne({ key: 'main_state' }).lean();
    if (doc && doc.data && typeof doc.data === 'object') {
      return doc.data;
    }
  } catch (err: any) {
    console.warn('[Database] Failed to load store from MongoDB Atlas:', err?.message);
  }
  return null;
}

/**
 * Immediate, reliable sync of complete platform store to MongoDB Atlas (atomic for serverless)
 */
export async function syncStoreToMongo(storeData: any): Promise<boolean> {
  if (!isConnected) {
    const ok = await connectMongoDB();
    if (!ok) return false;
  }

  try {
    await AppStoreModel.updateOne(
      { key: 'main_state' },
      { $set: { data: storeData, updatedAt: new Date() } },
      { upsert: true }
    );

    // Also sync key collections in background for direct Atlas queryability
    if (Array.isArray(storeData.users) && storeData.users.length > 0) {
      const bulkOps = storeData.users.slice(0, 500).map((u: any) => ({
        updateOne: {
          filter: { id: u.id },
          update: { $set: u },
          upsert: true,
        },
      }));
      UserModel.bulkWrite(bulkOps).catch(() => {});
    }

    if (Array.isArray(storeData.deposits) && storeData.deposits.length > 0) {
      const depOps = storeData.deposits.slice(0, 500).map((d: any) => ({
        updateOne: {
          filter: { id: d.id },
          update: { $set: d },
          upsert: true,
        },
      }));
      DepositModel.bulkWrite(depOps).catch(() => {});
    }

    if (Array.isArray(storeData.withdrawals) && storeData.withdrawals.length > 0) {
      const wOps = storeData.withdrawals.slice(0, 500).map((w: any) => ({
        updateOne: {
          filter: { id: w.id },
          update: { $set: w },
          upsert: true,
        },
      }));
      WithdrawModel.bulkWrite(wOps).catch(() => {});
    }

    return true;
  } catch (err: any) {
    console.warn('[Database] Sync to MongoDB Atlas failed:', err?.message);
    return false;
  }
}
