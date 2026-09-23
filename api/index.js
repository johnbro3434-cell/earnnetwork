// server/api.ts
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

// server/routes.ts
import { Router } from "express";
import bcrypt2 from "bcryptjs";
import jwt from "jsonwebtoken";
import { v2 as cloudinary } from "cloudinary";

// server/db.ts
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";

// server/database/mongoose.ts
import mongoose from "mongoose";
mongoose.set("bufferCommands", false);
mongoose.connection.on("error", () => {
  isConnected = false;
});
var MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL || "";
var isConnected = false;
var isConnecting = false;
var lastAttempt = 0;
var RETRY_COOLDOWN_MS = 10 * 1e3;
async function connectMongoDB() {
  if (isConnected && mongoose.connection.readyState === 1) return true;
  const uri = process.env.MONGODB_URI || process.env.MONGO_URL || "";
  if (!uri) {
    return false;
  }
  if (isConnecting) return false;
  if (Date.now() - lastAttempt < RETRY_COOLDOWN_MS) {
    return false;
  }
  isConnecting = true;
  lastAttempt = Date.now();
  try {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5e3,
      connectTimeoutMS: 5e3
    };
    await mongoose.connect(uri, opts);
    isConnected = true;
    console.log("[Database] Successfully connected to MongoDB Atlas cluster.");
    return true;
  } catch (err) {
    const isWhitelistIssue = err?.name === "MongooseServerSelectionError" || err?.message && (err.message.includes("whitelisted") || err.message.includes("Could not connect to any servers"));
    if (isWhitelistIssue) {
      console.warn(
        "[Database] Notice: MongoDB Atlas cluster is not reachable from this IP (Atlas Network Access requires 0.0.0.0/0). Seamlessly operating with enterprise local JSON store."
      );
    } else {
      console.warn("[Database] MongoDB Atlas connection deferred. Active store: enterprise local JSON engine.");
    }
    isConnected = false;
    return false;
  } finally {
    isConnecting = false;
  }
}
var UserSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  phone: { type: String, required: true, unique: true, index: true },
  password: { type: String, required: true },
  name: { type: String },
  role: { type: String, default: "user" },
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
  createdAt: { type: String, default: () => (/* @__PURE__ */ new Date()).toISOString() },
  updatedAt: { type: String, default: () => (/* @__PURE__ */ new Date()).toISOString() }
});
var UserModel = mongoose.models.User || mongoose.model("User", UserSchema);
var WalletTransactionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  transactionType: { type: String, required: true },
  amount: { type: Number, required: true },
  balanceBefore: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  reason: { type: String },
  referenceId: { type: String },
  createdBy: { type: String, default: "system" },
  status: { type: String, default: "completed" },
  createdAt: { type: String, default: () => (/* @__PURE__ */ new Date()).toISOString(), index: true }
});
var WalletTransactionModel = mongoose.models.WalletTransaction || mongoose.model("WalletTransaction", WalletTransactionSchema);
var DepositSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  userPhone: { type: String },
  amount: { type: Number, required: true },
  paymentMethod: { type: String, required: true },
  senderNumber: { type: String, required: true },
  receiverNumber: { type: String },
  transactionId: { type: String, required: true, index: true },
  screenshotUrl: { type: String },
  status: { type: String, default: "pending", index: true },
  reviewedBy: { type: String },
  reviewedAt: { type: String },
  createdAt: { type: String, default: () => (/* @__PURE__ */ new Date()).toISOString() }
});
var DepositModel = mongoose.models.Deposit || mongoose.model("Deposit", DepositSchema);
var WithdrawSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  userPhone: { type: String },
  amount: { type: Number, required: true },
  fee: { type: Number, required: true },
  netAmount: { type: Number, required: true },
  paymentMethod: { type: String, required: true },
  withdrawNumber: { type: String, required: true, index: true },
  status: { type: String, default: "pending", index: true },
  isTrialWithdraw: { type: Boolean, default: false },
  deviceFingerprint: { type: String },
  createdAt: { type: String, default: () => (/* @__PURE__ */ new Date()).toISOString() },
  updatedAt: { type: String, default: () => (/* @__PURE__ */ new Date()).toISOString() }
});
var WithdrawModel = mongoose.models.Withdrawal || mongoose.model("Withdrawal", WithdrawSchema);
var AppStoreSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "main_state" },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    version: { type: String, default: "v20.0.0-enterprise" },
    updatedAt: { type: Date, default: Date.now }
  },
  { minimize: false }
);
var AppStoreModel = mongoose.models.AppStore || mongoose.model("AppStore", AppStoreSchema);
async function loadStoreFromMongo() {
  if (!isConnected) return null;
  try {
    const doc = await AppStoreModel.findOne({ key: "main_state" }).lean();
    if (doc && doc.data && typeof doc.data === "object") {
      return doc.data;
    }
  } catch (err) {
    console.warn("[Database] Failed to load store from MongoDB Atlas:", err?.message);
  }
  return null;
}
var syncTimeout = null;
async function syncStoreToMongo(storeData) {
  if (!isConnected) return false;
  return new Promise((resolve) => {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(async () => {
      try {
        await AppStoreModel.updateOne(
          { key: "main_state" },
          { $set: { data: storeData, updatedAt: /* @__PURE__ */ new Date() } },
          { upsert: true }
        );
        if (Array.isArray(storeData.users) && storeData.users.length > 0) {
          const bulkOps = storeData.users.slice(0, 500).map((u) => ({
            updateOne: {
              filter: { id: u.id },
              update: { $set: u },
              upsert: true
            }
          }));
          UserModel.bulkWrite(bulkOps).catch(() => {
          });
        }
        if (Array.isArray(storeData.deposits) && storeData.deposits.length > 0) {
          const depOps = storeData.deposits.slice(0, 500).map((d) => ({
            updateOne: {
              filter: { id: d.id },
              update: { $set: d },
              upsert: true
            }
          }));
          DepositModel.bulkWrite(depOps).catch(() => {
          });
        }
        if (Array.isArray(storeData.withdrawals) && storeData.withdrawals.length > 0) {
          const wOps = storeData.withdrawals.slice(0, 500).map((w) => ({
            updateOne: {
              filter: { id: w.id },
              update: { $set: w },
              upsert: true
            }
          }));
          WithdrawModel.bulkWrite(wOps).catch(() => {
          });
        }
        resolve(true);
      } catch (err) {
        console.warn("[Database] Background sync to MongoDB Atlas failed:", err?.message);
        resolve(false);
      }
    }, 100);
  });
}

// server/db.ts
var DATA_FILE = path.join(process.cwd(), "data", "store.json");
var defaultWithdrawCards = [
  {
    id: "wcard_100",
    amount: 100,
    label: "\u09AB\u09CD\u09B0\u09BF \u099F\u09CD\u09B0\u09BE\u09DF\u09BE\u09B2 \u0995\u09BE\u09B0\u09CD\u09A1",
    badge: "FREE TRIAL",
    badgeColor: "cyan",
    minRole: "Member",
    isTrialAllowed: true,
    enabled: true,
    order: 1,
    description: "\u09AB\u09CD\u09B0\u09BF \u099F\u09CD\u09B0\u09BE\u09DF\u09BE\u09B2 \u09B8\u09AE\u09CD\u09AA\u09A8\u09CD\u09A8 \u0987\u0989\u099C\u09BE\u09B0\u09A6\u09C7\u09B0 \u099C\u09A8\u09CD\u09AF \u09A8\u09BF\u09B0\u09CD\u09A7\u09BE\u09B0\u09BF\u09A4 \u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u0995\u09BE\u09B0\u09CD\u09A1",
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: "wcard_460",
    amount: 460,
    label: "\u09AE\u09BF\u09A8\u09BF \u0995\u09CD\u09AF\u09BE\u09B6\u0986\u0989\u099F",
    badge: "STARTER",
    badgeColor: "emerald",
    minRole: "Member",
    isTrialAllowed: false,
    enabled: true,
    order: 2,
    description: "\u09AD\u09BF\u0986\u0987\u09AA\u09BF \u09AE\u09C7\u09AE\u09CD\u09AC\u09BE\u09B0\u09A6\u09C7\u09B0 \u09B8\u09B0\u09CD\u09AC\u09A8\u09BF\u09AE\u09CD\u09A8 \u09A8\u09BF\u09DF\u09AE\u09BF\u09A4 \u0995\u09CD\u09AF\u09BE\u09B6\u0986\u0989\u099F \u0995\u09BE\u09B0\u09CD\u09A1",
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: "wcard_1680",
    amount: 1680,
    label: "\u09B8\u09CD\u099F\u09CD\u09AF\u09BE\u09A8\u09CD\u09A1\u09BE\u09B0\u09CD\u09A1 \u09AA\u09C7\u0986\u0989\u099F",
    badge: "POPULAR",
    badgeColor: "amber",
    minRole: "Member",
    isTrialAllowed: false,
    enabled: true,
    order: 3,
    description: "\u09B8\u09B0\u09CD\u09AC\u09BE\u09A7\u09BF\u0995 \u09AC\u09CD\u09AF\u09AC\u09B9\u09C3\u09A4 \u099C\u09A8\u09AA\u09CD\u09B0\u09BF\u09DF \u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u0995\u09BE\u09B0\u09CD\u09A1",
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: "wcard_5800",
    amount: 5800,
    label: "\u098F\u0995\u09CD\u09B8\u09BF\u0995\u09BF\u0989\u099F\u09BF\u09AD \u0995\u09CD\u09AF\u09BE\u09B6",
    badge: "FAST PAYOUT",
    badgeColor: "purple",
    minRole: "Member",
    isTrialAllowed: false,
    enabled: true,
    order: 4,
    description: "\u09A6\u09CD\u09B0\u09C1\u09A4 \u09AA\u09CD\u09B0\u09B8\u09C7\u09B8\u09BF\u0982 \u09B8\u09AE\u09CD\u09AA\u09A8\u09CD\u09A8 \u09AA\u09CD\u09B0\u09BF\u09AE\u09BF\u09DF\u09BE\u09AE \u0995\u09BE\u09B0\u09CD\u09A1",
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: "wcard_16800",
    amount: 16800,
    label: "\u09AA\u09CD\u09B0\u09CB \u0986\u09B0\u09CD\u09A8\u09BE\u09B0 \u09AA\u09C7\u0986\u0989\u099F",
    badge: "HOT",
    badgeColor: "rose",
    minRole: "Member",
    isTrialAllowed: false,
    enabled: true,
    order: 5,
    description: "\u09B9\u09BE\u0987 \u09AD\u09B2\u09BF\u0989\u09AE \u09AE\u09C7\u09AE\u09CD\u09AC\u09BE\u09B0\u09A6\u09C7\u09B0 \u099C\u09A8\u09CD\u09AF \u09AC\u09BF\u09B6\u09C7\u09B7 \u0995\u09BE\u09B0\u09CD\u09A1",
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: "wcard_49999",
    amount: 49999,
    label: "\u09AE\u09BE\u09B8\u09CD\u099F\u09BE\u09B0 \u09AD\u09BF\u0986\u0987\u09AA\u09BF \u09AA\u09C7\u0986\u0989\u099F",
    badge: "VIP CLUB",
    badgeColor: "amber",
    minRole: "Member",
    isTrialAllowed: false,
    enabled: true,
    order: 6,
    description: "\u09AD\u09BF\u0986\u0987\u09AA\u09BF \u0993 \u09B2\u09BF\u09A1\u09BE\u09B0\u09A6\u09C7\u09B0 \u099C\u09A8\u09CD\u09AF \u09AE\u09C7\u0997\u09BE \u0995\u09CD\u09AF\u09BE\u09B6\u0986\u0989\u099F",
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: "wcard_150000",
    amount: 15e4,
    label: "\u09B0\u09DF\u09CD\u09AF\u09BE\u09B2 \u098F\u09B2\u09BF\u099F \u09AA\u09C7\u0986\u0989\u099F",
    badge: "ELITE SUPREME",
    badgeColor: "cyan",
    minRole: "Member",
    isTrialAllowed: false,
    enabled: true,
    order: 7,
    description: "\u09B8\u09B0\u09CD\u09AC\u09CB\u099A\u09CD\u099A \u09B8\u09C0\u09AE\u09BE \u098F\u0995\u09CD\u09B8\u0995\u09CD\u09B2\u09C1\u09B8\u09BF\u09AD \u098F\u09B2\u09BF\u099F \u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u0995\u09BE\u09B0\u09CD\u09A1",
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  }
];
var defaultPackages = [
  {
    id: "pkg_trial",
    name: "Free Trial",
    price: 0,
    dailyIncome: 25,
    videosPerDay: 5,
    incomePerVideo: 5,
    validityDays: 4,
    badgeColor: "emerald",
    enabled: true
  },
  {
    id: "pkg_bronze",
    name: "Bronze",
    price: 2500,
    dailyIncome: 80,
    videosPerDay: 4,
    incomePerVideo: 20,
    validityDays: 365,
    badgeColor: "amber",
    enabled: true
  },
  {
    id: "pkg_golden",
    name: "Golden",
    price: 7500,
    dailyIncome: 250,
    videosPerDay: 10,
    incomePerVideo: 25,
    validityDays: 365,
    badgeColor: "yellow",
    enabled: true,
    isPopular: true
  },
  {
    id: "pkg_diamond",
    name: "Diamond",
    price: 22500,
    dailyIncome: 750,
    videosPerDay: 15,
    incomePerVideo: 50,
    validityDays: 365,
    badgeColor: "cyan",
    enabled: true
  },
  {
    id: "pkg_platinum",
    name: "Platinum",
    price: 58e3,
    dailyIncome: 2500,
    videosPerDay: 25,
    incomePerVideo: 100,
    validityDays: 365,
    badgeColor: "purple",
    enabled: true
  },
  {
    id: "pkg_vip1",
    name: "VIP1 Enterprise",
    price: 12e4,
    dailyIncome: 5e3,
    videosPerDay: 40,
    incomePerVideo: 125,
    validityDays: 365,
    badgeColor: "rose",
    enabled: true
  },
  {
    id: "pkg_vip2",
    name: "VIP2 Sovereign",
    price: 25e4,
    dailyIncome: 12e3,
    videosPerDay: 60,
    incomePerVideo: 200,
    validityDays: 365,
    badgeColor: "indigo",
    enabled: true
  }
];
var defaultPaymentNumbers = [
  {
    id: "num_bkash_1",
    method: "bKash",
    number: "01712345678",
    accountType: "Personal",
    isActive: true,
    usageCount: 142,
    dailyLimit: 2e5,
    currentDailyVolume: 35e3
  },
  {
    id: "num_bkash_2",
    method: "bKash",
    number: "01798765432",
    accountType: "Agent",
    isActive: true,
    usageCount: 98,
    dailyLimit: 3e5,
    currentDailyVolume: 62e3
  },
  {
    id: "num_nagad_1",
    method: "Nagad",
    number: "01811223344",
    accountType: "Personal",
    isActive: true,
    usageCount: 110,
    dailyLimit: 2e5,
    currentDailyVolume: 28e3
  },
  {
    id: "num_nagad_2",
    method: "Nagad",
    number: "01899887766",
    accountType: "Agent",
    isActive: true,
    usageCount: 75,
    dailyLimit: 3e5,
    currentDailyVolume: 49e3
  }
];
var defaultVideoTasks = [
  {
    id: "task_vid_1",
    title: "Smart Tech BD Brand Spotlight 2026",
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-software-developer-working-on-code-screen-close-up-34241-large.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=600&auto=format&fit=crop&q=80",
    durationSeconds: 10,
    rewardAmount: 25,
    category: "Technology & AI"
  },
  {
    id: "task_vid_2",
    title: "Green Agro Bangladesh Eco Project",
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-hands-of-a-man-working-on-a-computer-keyboard-40647-large.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&auto=format&fit=crop&q=80",
    durationSeconds: 10,
    rewardAmount: 25,
    category: "Sustainability"
  },
  {
    id: "task_vid_3",
    title: "Digital Commerce Dhaka Logistics Review",
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-finger-pointing-at-a-screen-with-graphs-34242-large.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&auto=format&fit=crop&q=80",
    durationSeconds: 10,
    rewardAmount: 25,
    category: "E-Commerce"
  },
  {
    id: "task_vid_4",
    title: "Fintech Innovation bKash & Nagad Integration",
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-digital-animation-of-screens-with-financial-data-28120-large.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=600&auto=format&fit=crop&q=80",
    durationSeconds: 10,
    rewardAmount: 25,
    category: "Fintech BD"
  },
  {
    id: "task_vid_5",
    title: "Enterprise Cloud Solutions Overview",
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-hands-typing-on-a-laptop-keyboard-close-up-40646-large.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=600&auto=format&fit=crop&q=80",
    durationSeconds: 10,
    rewardAmount: 25,
    category: "Enterprise IT"
  }
];
var defaultCampaigns = [
  {
    id: "camp_1",
    title: "Grand Eid-ul-Fitr Mega Deposit Bonus 15%",
    description: "Deposit 2,500 TK or more to receive an instant 15% wallet credit top-up! Limited to the first 5,000 users.",
    bannerUrl: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1200&auto=format&fit=crop&q=80",
    type: "banner",
    isActive: true,
    startDate: "2026-03-01",
    endDate: "2026-04-15"
  },
  {
    id: "camp_2",
    title: "Ramadan Daily Bonus Celebration",
    description: "Complete all video tasks before 6:00 PM every day to enter the daily 500 TK cash pool!",
    bannerUrl: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200&auto=format&fit=crop&q=80",
    type: "popup",
    isActive: true,
    startDate: "2026-03-10",
    endDate: "2026-04-10"
  }
];
var defaultSettings = {
  websiteName: "EarnNetwork BD",
  tagline: "Leading Digital Micro-Task Earning Ecosystem in Bangladesh (earnnetworkbd.com)",
  logoUrl: "/src/assets/images/earnnetworkbd_logo_1790095119696.jpg",
  mobileLogoUrl: "/src/assets/images/earnnetworkbd_logo_1790095119696.jpg",
  whatsappNumber: "+8801700112233",
  telegramGroupUrl: "https://t.me/earnnetworkbd_group",
  telegramChannelUrl: "https://t.me/earnnetworkbd_official",
  facebookGroupUrl: "https://facebook.com/groups/earnnetworkbd",
  youtubeTutorialUrl: "https://youtube.com/watch?v=earnnetworkbd_guide",
  appDownloadUrl: "https://earnnetworkbd.com/download/app.apk",
  marqueeNotice: "\u{1F525} EarnNetwork BD (earnnetworkbd.com) - \u09AA\u09CD\u09B0\u09A4\u09BF\u09A6\u09BF\u09A8 \u09E7\u09E6 \u09B8\u09C7\u0995\u09C7\u09A8\u09CD\u09A1 \u09AD\u09BF\u09A1\u09BF\u0993 \u09A6\u09C7\u0996\u09C7 \u0987\u09A8\u0995\u09BE\u09AE \u0995\u09B0\u09C1\u09A8! \u09A8\u09A4\u09C1\u09A8 \u09AE\u09C7\u09AE\u09CD\u09AC\u09BE\u09B0\u09A6\u09C7\u09B0 \u099C\u09A8\u09CD\u09AF \u09AB\u09CD\u09B0\u09BF \u099F\u09CD\u09B0\u09BE\u09DF\u09BE\u09B2 \u099A\u09BE\u09B2\u09C1 \u09B0\u09DF\u09C7\u099B\u09C7\u0964 \u09AF\u09C7\u0995\u09CB\u09A8\u09CB \u09B8\u09B9\u09BE\u09DF\u09A4\u09BE\u09DF \u0986\u09AE\u09BE\u09A6\u09C7\u09B0 \u09B9\u09CB\u09DF\u09BE\u099F\u09B8\u0985\u09CD\u09AF\u09BE\u09AA\u09C7 \u09AF\u09CB\u0997\u09BE\u09AF\u09CB\u0997 \u0995\u09B0\u09C1\u09A8\u0964",
  themePrimaryColor: "#059669",
  // Emerald Green BD
  footerText: "\xA9 2026 EarnNetwork BD (earnnetworkbd.com). Registered in Dhaka, Bangladesh. All Rights Reserved.",
  minDepositAmount: 500,
  maxDepositAmount: 1e5,
  minWithdrawAmount: 300,
  maxWithdrawAmount: 5e4,
  withdrawFeePercentage: 10,
  signupBonusAmount: 50,
  withdrawOpeningHour: 8,
  // 8:00 AM
  withdrawClosingHour: 23,
  // 11:00 PM
  withdrawStartHour: 8,
  withdrawEndHour: 23,
  withdrawGloballyEnabled: true,
  isWithdrawDisabled: false,
  allowFreeUserWithdrawal: false,
  // Default is false: free users cannot withdraw without permission
  hybridDepositVerificationEnabled: false,
  // Default is OFF as mandated!
  maintenanceMode: false,
  levelAPercentage: 10,
  levelBPercentage: 5,
  levelCPercentage: 2,
  dailyTaskResetHour: 0,
  // 12:00 AM midnight
  sundayIsOffDay: true
  // Default Sunday off day as mandated!
};
var defaultCloudinary = {
  cloudName: "earnhub-bd-v20",
  apiKey: "839219842148123",
  apiSecret: "****************",
  isConfigured: true
};
var defaultRoles = [
  {
    id: "role_main_admin",
    roleName: "Main Admin",
    description: "Full Master Access to All Financial, CRM, Tasks, Security, and System Settings",
    permissions: ["all", "dashboard", "users", "deposits", "withdrawals", "wallet", "packages", "tasks", "referrals", "salary", "campaigns", "promocodes", "gifts", "holidays", "sliders", "notifications", "analytics", "security", "payment_numbers", "cloudinary", "branding", "settings", "admin_users", "roles", "activity_logs", "support", "system_health"],
    userCount: 2
  },
  {
    id: "role_manager_admin",
    roleName: "Manager Admin",
    description: "User CRM, Team Referrals, Monthly Salary distribution, and Member verification",
    permissions: ["dashboard", "users", "referrals", "salary", "activity_logs", "support"],
    userCount: 1
  },
  {
    id: "role_finance_admin",
    roleName: "Finance Admin",
    description: "Deposits review, Withdrawals approvals, Wallet adjustments, Payment Numbers pool",
    permissions: ["dashboard", "deposits", "withdrawals", "wallet", "payment_numbers", "analytics", "activity_logs"],
    userCount: 1
  },
  {
    id: "role_marketing_admin",
    roleName: "Marketing Admin",
    description: "Campaign banners, Promo codes, Homepage sliders, Broadcast notifications",
    permissions: ["dashboard", "campaigns", "promocodes", "sliders", "notifications", "branding"],
    userCount: 1
  },
  {
    id: "role_support_admin",
    roleName: "Support Admin",
    description: "User ticket inquiries, Live support messages, Profile lookup, Basic guidance",
    permissions: ["dashboard", "users", "support"],
    userCount: 1
  }
];
var defaultSliders = [
  {
    id: "slide_nagad_bonus",
    title: "\u09EE% \u09AA\u09B0\u09CD\u09AF\u09A8\u09CD\u09A4 \u098F\u0995\u09CD\u09B8\u099F\u09CD\u09B0\u09BE \u09A8\u0997\u09A6 \u09AA\u09C7\u09AE\u09C7\u09A8\u09CD\u099F\u09C7",
    subtitle: "* \u09B6\u09B0\u09CD\u09A4\u09BE\u09A6\u09BF \u098F\u09AC\u0982 \u09B6\u09B0\u09CD\u09A4\u09BE\u09AC\u09B2\u09C0 \u09AA\u09CD\u09B0\u09AF\u09CB\u099C\u09CD\u09AF | \u09A8\u0997\u09A6 \u09A1\u09BF\u09AA\u09CB\u099C\u09BF\u099F\u09C7 \u0995\u09CD\u09AF\u09BE\u09B6\u09AC\u09CD\u09AF\u09BE\u0995 \u09AC\u09CB\u09A8\u09BE\u09B8",
    tag: "\u09AE\u09BE\u09A4\u09CD\u09B0 \u09E7X \u0993\u09AF\u09BC\u09C7\u099C\u09BE\u09B0\u09BF\u0982!",
    imageUrl: "/banners/nagad_bonus.jpg",
    buttonText: "\u09A1\u09BF\u09AA\u09CB\u099C\u09BF\u099F \u0995\u09B0\u09C1\u09A8",
    buttonLink: "wallet",
    status: "active",
    sortOrder: 1,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: "slide_bkash_vip",
    title: "VIP \u09AE\u09C7\u09AE\u09CD\u09AC\u09BE\u09B0\u09B6\u09BF\u09AA \u0986\u09AA\u0997\u09CD\u09B0\u09C7\u09A1 - \u09A6\u09C8\u09A8\u09BF\u0995 \u09ED\u09EB\u09E6\u09F3 \u09AA\u09B0\u09CD\u09AF\u09A8\u09CD\u09A4 \u0987\u09A8\u0995\u09BE\u09AE",
    subtitle: "\u09E7\u09E6 \u09B8\u09C7\u0995\u09C7\u09A8\u09CD\u09A1 \u09B8\u09CD\u09AA\u09A8\u09CD\u09B8\u09B0 \u09AD\u09BF\u09A1\u09BF\u0993 \u098F\u09AC\u0982 \u09B2\u09BE\u0987\u09AB\u099F\u09BE\u0987\u09AE \u09E9-\u099F\u09BE\u09DF\u09BE\u09B0 \u09B0\u09C7\u09AB\u09BE\u09B0\u09C7\u09B2 \u0995\u09AE\u09BF\u09B6\u09A8",
    tag: "VIP \u098F\u0995\u09CD\u09B8\u0995\u09CD\u09B2\u09C1\u09B8\u09BF\u09AD",
    imageUrl: "/banners/bkash_vip.jpg",
    buttonText: "\u09AA\u09CD\u09AF\u09BE\u0995\u09C7\u099C \u09A6\u09C7\u0996\u09C1\u09A8",
    buttonLink: "packages",
    status: "active",
    sortOrder: 2,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: "slide_trial_tasks",
    title: "\u09AA\u09CD\u09B0\u09A4\u09BF\u09A6\u09BF\u09A8 \u09E7\u09E6 \u09B8\u09C7\u0995\u09C7\u09A8\u09CD\u09A1 \u09AD\u09BF\u09A1\u09BF\u0993 \u09A6\u09C7\u0996\u09C7 \u09E7\u09E6\u09E6\u09F3 \u09AA\u09B0\u09CD\u09AF\u09A8\u09CD\u09A4 \u0986\u09B0\u09CD\u09A8 \u0995\u09B0\u09C1\u09A8",
    subtitle: "\u09AB\u09CD\u09B0\u09BF \u099F\u09CD\u09B0\u09BE\u09DF\u09BE\u09B2 \u09AE\u09C7\u09AE\u09CD\u09AC\u09BE\u09B0 \u0993 \u09AD\u09BF\u0986\u0987\u09AA\u09BF\u09A6\u09C7\u09B0 \u099C\u09A8\u09CD\u09AF \u09A8\u09BF\u09B6\u09CD\u099A\u09BF\u09A4 \u0987\u09A8\u09B8\u09CD\u099F\u09CD\u09AF\u09BE\u09A8\u09CD\u099F \u09AC\u09BF\u0995\u09BE\u09B6/\u09A8\u0997\u09A6 \u09AA\u09C7\u09AE\u09C7\u09A8\u09CD\u099F",
    tag: "\u09A1\u09C7\u0987\u09B2\u09BF \u09B8\u09CD\u09AA\u09A8\u09CD\u09B8\u09B0 \u099F\u09BE\u09B8\u09CD\u0995",
    imageUrl: "https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=1200&auto=format&fit=crop&q=80",
    buttonText: "\u099F\u09BE\u09B8\u09CD\u0995 \u09B6\u09C1\u09B0\u09C1 \u0995\u09B0\u09C1\u09A8",
    buttonLink: "tasks",
    status: "active",
    sortOrder: 3,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  }
];
var defaultSupportTickets = [
  {
    id: "tkt_1001",
    userId: "user_01711111111",
    userPhone: "01711111111",
    subject: "Deposit confirmation query for bKash",
    category: "Deposit",
    priority: "high",
    status: "resolved",
    createdAt: new Date(Date.now() - 3 * 864e5).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 864e5 + 36e5).toISOString(),
    messages: [
      {
        id: "msg_1",
        senderId: "user_01711111111",
        senderName: "01711111111",
        senderType: "user",
        message: "Hello, I sent 7,500 TK via bKash TrxID BK9A82J1KD. How long will it take to verify?",
        createdAt: new Date(Date.now() - 3 * 864e5).toISOString()
      },
      {
        id: "msg_2",
        senderId: "admin_finance_01",
        senderName: "Fatema Tuz Zohra (Finance Admin)",
        senderType: "admin",
        message: "Your deposit has been verified and added to your wallet balance. You can now purchase your Golden Package from the Packages tab.",
        createdAt: new Date(Date.now() - 3 * 864e5 + 18e5).toISOString()
      }
    ]
  },
  {
    id: "tkt_1002",
    userId: "user_01822222222",
    userPhone: "01822222222",
    subject: "Free trial video task countdown question",
    category: "Tasks",
    priority: "medium",
    status: "open",
    createdAt: new Date(Date.now() - 5 * 36e5).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 36e5).toISOString(),
    messages: [
      {
        id: "msg_3",
        senderId: "user_01822222222",
        senderName: "01822222222",
        senderType: "user",
        message: "Assalamu Alaikum. How many trial days do I have left for earning 25 TK daily?",
        createdAt: new Date(Date.now() - 5 * 36e5).toISOString()
      }
    ]
  }
];
var defaultMfsSettings = {
  autoVerificationEnabled: true,
  // PRIMARY RULE: Default ON
  manualVerificationEnabled: false,
  // PRIMARY RULE: Default OFF
  fallbackManualReview: true,
  verificationTimeoutMinutes: 10,
  allowedSmsAgeHours: 24,
  enableDeviceSync: true,
  deviceSecretToken: "ehbd_sec_verify_token_2026",
  apkDownloadUrl: "/downloads/EarnHubVerify.apk",
  latestApkVersion: "2.0.4",
  forceUpdateApk: false
};
var defaultVerifyDevices = [
  {
    id: "dev_sim_01",
    deviceId: "android_mfs_gateway_01",
    deviceName: "Samsung Galaxy M12 (Official bKash & Nagad SIM)",
    phoneNumber: "01712345678",
    deviceToken: "ehbd_sec_verify_token_2026",
    batteryPercent: 94,
    networkType: "WiFi + 4G LTE",
    status: "online",
    lastSyncAt: new Date(Date.now() - 12e3).toISOString(),
    lastHeartbeatAt: new Date(Date.now() - 8e3).toISOString(),
    totalSmsForwarded: 148,
    appVersion: "2.0.4",
    isBanned: false
  }
];
var defaultSmsTransactions = [
  {
    id: "sms_bkash_sample_1",
    trxId: "9K28SA710P",
    method: "bKash",
    amount: 500,
    senderNumber: "01711111111",
    balanceAfter: "1,250.00",
    smsTime: "22/09/2026 14:30",
    rawSms: "You have received Tk 500.00 from 01711111111. Ref . Fee Tk 0.00. Balance Tk 1,250.00. TrxID 9K28SA710P at 22/09/2026 14:30",
    deviceId: "android_mfs_gateway_01",
    verified: false,
    used: false,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: "sms_nagad_sample_2",
    trxId: "72KB901P",
    method: "Nagad",
    amount: 1e3,
    senderNumber: "01822222222",
    balanceAfter: "2,300.00",
    smsTime: "22/09/2026 15:45",
    rawSms: "Cash In of Tk 1,000.00 from 01822222222 received. Balance: Tk 2,300.00. TxnID: 72KB901P at 22/09/2026 15:45",
    deviceId: "android_mfs_gateway_01",
    verified: false,
    used: false,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  }
];
var defaultApkVersions = [
  {
    id: "apk_v204",
    version: "2.0.4",
    releaseNotes: "EarnHub Verify V20 official native APK release with 30s heartbeat telemetry, persistent foreground SMS forwarder, regex parsing, and automatic offline retry queue.",
    fileSize: "1.8 MB",
    downloadUrl: "/downloads/EarnHubVerify.apk",
    downloadCount: 42,
    isCurrent: true,
    minSupportedVersion: "2.0.0",
    forceUpdate: false,
    releasedAt: new Date(Date.now() - 2 * 864e5).toISOString(),
    uploadedBy: "Sultan Mahmud (Chief Admin)"
  }
];
var defaultSalaryTiers = [
  {
    id: "tier_manager",
    tierNumber: 1,
    roleName: "Tier 1: Manager",
    requiredReferrals: 10,
    referralType: "direct_paid",
    salaryAmount: 5e3,
    badgeColor: "amber",
    description: "Min 10 Active Paid Members",
    isActive: true
  },
  {
    id: "tier_senior_manager",
    tierNumber: 2,
    roleName: "Tier 2: Senior Manager",
    requiredReferrals: 25,
    referralType: "direct_paid",
    salaryAmount: 12e3,
    badgeColor: "cyan",
    description: "Min 25 Active Paid Members",
    isActive: true
  },
  {
    id: "tier_vip_director",
    tierNumber: 3,
    roleName: "Tier 3: VIP Regional Director",
    requiredReferrals: 50,
    referralType: "direct_paid",
    salaryAmount: 25e3,
    badgeColor: "purple",
    description: "Min 50 Active Paid Members",
    isActive: true
  }
];
var store = {
  users: [],
  wallets: [],
  transactions: [],
  walletTransactions: [],
  auditLogs: [],
  apkVersions: defaultApkVersions,
  packages: defaultPackages,
  withdrawCards: defaultWithdrawCards,
  salaryTiers: defaultSalaryTiers,
  deposits: [],
  withdraws: [],
  videoTasks: defaultVideoTasks,
  taskHistories: [],
  paymentNumbers: defaultPaymentNumbers,
  referralCommissions: [],
  promoCodes: [
    {
      id: "promo_welcome",
      code: "WELCOME50",
      rewardAmount: 50,
      maxUsage: 1e3,
      currentUsage: 142,
      expiresAt: "2026-12-31",
      isActive: true,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    {
      id: "promo_eid",
      code: "EID2026",
      rewardAmount: 100,
      maxUsage: 500,
      currentUsage: 89,
      expiresAt: "2026-05-01",
      isActive: true,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  ],
  campaigns: defaultCampaigns,
  holidays: [
    {
      id: "hol_1",
      date: "2026-03-26",
      name: "Independence Day of Bangladesh",
      reason: "National Holiday: Task server maintenance and community celebration",
      tasksDisabled: true
    },
    {
      id: "hol_2",
      date: "2026-04-14",
      name: "Pohela Boishakh (Bengali New Year)",
      reason: "Noboborsho Holiday: All micro-tasks paused with holiday gift allowance",
      tasksDisabled: true
    }
  ],
  notifications: [],
  settings: defaultSettings,
  cloudinarySettings: defaultCloudinary,
  adminUsers: [],
  activityLogs: [],
  deviceFingerprints: [],
  supportTickets: defaultSupportTickets,
  sliders: defaultSliders,
  roles: defaultRoles,
  smsTransactions: defaultSmsTransactions,
  verifyDevices: defaultVerifyDevices,
  mfsSettings: defaultMfsSettings,
  verificationLogs: [],
  fraudLogs: []
};
function initializeSeedData() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (e) {
      }
    }
  } catch (e) {
  }
  if (fs.existsSync(DATA_FILE)) {
    try {
      const content = fs.readFileSync(DATA_FILE, "utf-8");
      store = JSON.parse(content);
      if (store.settings && store.settings.allowFreeUserWithdrawal === void 0) {
        store.settings.allowFreeUserWithdrawal = false;
      }
      if (!store.supportTickets || !store.supportTickets.length) {
        store.supportTickets = defaultSupportTickets;
      }
      if (!store.sliders || !store.sliders.length) {
        store.sliders = defaultSliders;
      }
      if (!store.roles || !store.roles.length) {
        store.roles = defaultRoles;
      }
      if (!store.mfsSettings) {
        store.mfsSettings = defaultMfsSettings;
      }
      if (!store.verifyDevices || !store.verifyDevices.length) {
        store.verifyDevices = defaultVerifyDevices;
      }
      if (!store.smsTransactions) {
        store.smsTransactions = defaultSmsTransactions;
      }
      if (!store.verificationLogs) {
        store.verificationLogs = [];
      }
      if (!store.fraudLogs) {
        store.fraudLogs = [];
      }
      if (!store.walletTransactions) {
        store.walletTransactions = [];
      }
      if (!store.auditLogs) {
        store.auditLogs = [];
      }
      if (!store.apkVersions || !store.apkVersions.length) {
        store.apkVersions = defaultApkVersions;
      }
      if (!store.withdrawCards || !store.withdrawCards.length) {
        store.withdrawCards = defaultWithdrawCards;
      }
      if (!store.salaryTiers || !store.salaryTiers.length) {
        store.salaryTiers = defaultSalaryTiers;
      }
      const existingTrial = store.packages?.find((p) => p.id === "pkg_trial");
      if (existingTrial) {
        existingTrial.videosPerDay = 5;
        existingTrial.incomePerVideo = 5;
        existingTrial.dailyIncome = 25;
      }
      return;
    } catch (e) {
      console.warn("Could not parse store.json, re-initializing seeds");
    }
  }
  const salt = bcrypt.genSaltSync(10);
  const adminPass = bcrypt.hashSync("YFSzFRfvpiZv", salt);
  const userPass = bcrypt.hashSync("user123", salt);
  const withdrawPass = bcrypt.hashSync("9988", salt);
  const primaryAdmin = {
    id: "admin_primary_01",
    phone: "01010101010",
    name: "Main Admin",
    role: "Main Admin",
    passwordHash: adminPass,
    permissions: ["all", "finance", "users", "packages", "marketing", "settings", "logs"]
  };
  const user1 = {
    id: "user_01711111111",
    phone: "01711111111",
    passwordHash: userPass,
    role: "Manager",
    referralCode: "EHBD1001",
    createdAt: new Date(Date.now() - 30 * 864e5).toISOString(),
    status: "active",
    isTrial: false,
    trialDaysUsed: 4,
    trialTotalEarned: 100,
    trialMissedDays: 0,
    trialExpired: true,
    activePackageId: "pkg_golden",
    packageActivatedAt: new Date(Date.now() - 10 * 864e5).toISOString(),
    withdrawSetupDone: true,
    withdrawMethod: "bKash",
    withdrawNumber: "01711111111",
    withdrawPasswordHash: withdrawPass,
    deviceFingerprint: "fp_desktop_dhaka_01",
    lastLoginIp: "103.205.71.12",
    lastLoginAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const user2 = {
    id: "user_01822222222",
    phone: "01822222222",
    passwordHash: userPass,
    role: "Member",
    referralCode: "EHBD2002",
    referredBy: "EHBD1001",
    createdAt: new Date(Date.now() - 2 * 864e5).toISOString(),
    status: "active",
    isTrial: true,
    trialStartDate: new Date(Date.now() - 2 * 864e5).toISOString(),
    trialDaysUsed: 2,
    trialTotalEarned: 50,
    trialMissedDays: 0,
    trialExpired: false,
    activePackageId: "pkg_trial",
    packageActivatedAt: new Date(Date.now() - 2 * 864e5).toISOString(),
    withdrawSetupDone: false,
    deviceFingerprint: "fp_mobile_chittagong_02",
    lastLoginIp: "103.114.98.54",
    lastLoginAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const user3 = {
    id: "user_01933333333",
    phone: "01933333333",
    passwordHash: userPass,
    role: "Senior Manager",
    referralCode: "EHBD3003",
    referredBy: "EHBD1001",
    createdAt: new Date(Date.now() - 60 * 864e5).toISOString(),
    status: "active",
    isTrial: false,
    trialDaysUsed: 4,
    trialTotalEarned: 100,
    trialMissedDays: 0,
    trialExpired: true,
    activePackageId: "pkg_diamond",
    packageActivatedAt: new Date(Date.now() - 25 * 864e5).toISOString(),
    withdrawSetupDone: true,
    withdrawMethod: "Nagad",
    withdrawNumber: "01933333333",
    withdrawPasswordHash: withdrawPass,
    deviceFingerprint: "fp_laptop_sylhet_03",
    lastLoginIp: "103.88.22.91",
    lastLoginAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const wallet1 = {
    userId: user1.id,
    balance: 4850,
    totalDeposit: 15e3,
    totalWithdraw: 9200,
    totalEarned: 12450,
    todayIncome: 250,
    referralIncome: 1850,
    giftIncome: 100,
    salaryIncome: 3e3,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const wallet2 = {
    userId: user2.id,
    balance: 50,
    totalDeposit: 0,
    totalWithdraw: 0,
    totalEarned: 50,
    todayIncome: 25,
    referralIncome: 0,
    giftIncome: 0,
    salaryIncome: 0,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const wallet3 = {
    userId: user3.id,
    balance: 18400,
    totalDeposit: 45e3,
    totalWithdraw: 32e3,
    totalEarned: 48900,
    todayIncome: 750,
    referralIncome: 8600,
    giftIncome: 200,
    salaryIncome: 12e3,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const initialDeposits = [
    {
      id: "dep_1001",
      userId: user1.id,
      userPhone: user1.phone,
      amount: 7500,
      paymentMethod: "bKash",
      assignedNumber: "01712345678",
      senderNumber: "01711111111",
      transactionId: "BK9A82J1KD",
      screenshotUrl: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=600&auto=format&fit=crop&q=80",
      status: "approved",
      verificationType: "manual",
      createdAt: new Date(Date.now() - 10 * 864e5).toISOString(),
      reviewedAt: new Date(Date.now() - 10 * 864e5 + 12e4).toISOString(),
      reviewedBy: "Fatema Tuz Zohra"
    },
    {
      id: "dep_1002",
      userId: user3.id,
      userPhone: user3.phone,
      amount: 22500,
      paymentMethod: "Nagad",
      assignedNumber: "01811223344",
      senderNumber: "01933333333",
      transactionId: "NG771900AA",
      screenshotUrl: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop&q=80",
      status: "approved",
      verificationType: "manual",
      createdAt: new Date(Date.now() - 25 * 864e5).toISOString(),
      reviewedAt: new Date(Date.now() - 25 * 864e5 + 3e5).toISOString(),
      reviewedBy: "Sultan Mahmud"
    }
  ];
  const initialWithdraws = [
    {
      id: "wdr_2001",
      userId: user1.id,
      userPhone: user1.phone,
      amount: 5800,
      fee: 580,
      netAmount: 5220,
      paymentMethod: "bKash",
      withdrawNumber: "01711111111",
      status: "paid",
      deviceFingerprint: "fp_desktop_dhaka_01",
      createdAt: new Date(Date.now() - 5 * 864e5).toISOString(),
      updatedAt: new Date(Date.now() - 5 * 864e5 + 36e5).toISOString(),
      timeline: [
        { step: "pending", timestamp: new Date(Date.now() - 5 * 864e5).toISOString() },
        { step: "approved", timestamp: new Date(Date.now() - 5 * 864e5 + 18e5).toISOString(), note: "Verified by Finance Admin" },
        { step: "paid", timestamp: new Date(Date.now() - 5 * 864e5 + 36e5).toISOString(), note: "bKash TrxID: BKWDR991823" }
      ]
    }
  ];
  const deviceRecords = [
    {
      deviceFingerprint: "fp_desktop_dhaka_01",
      associatedUserIds: [user1.id],
      trialWithdrawalCompleted: true,
      trialWithdrawalDate: new Date(Date.now() - 26 * 864e5).toISOString(),
      trialWithdrawalAmount: 100,
      lastSeenIp: "103.205.71.12",
      lastSeenAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  ];
  const logs = [
    {
      id: "log_01",
      adminId: primaryAdmin.id,
      adminName: primaryAdmin.name,
      action: "System Initialization",
      target: "EarnNetwork BD",
      details: "Locked specification v20 enterprise deployment initiated with Socket.io real-time engine",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    }
  ];
  store = {
    users: [],
    wallets: [],
    transactions: [],
    packages: defaultPackages,
    withdrawCards: defaultWithdrawCards,
    salaryTiers: defaultSalaryTiers,
    deposits: [],
    withdraws: [],
    videoTasks: defaultVideoTasks,
    taskHistories: [],
    paymentNumbers: defaultPaymentNumbers,
    referralCommissions: [],
    promoCodes: store.promoCodes || [],
    campaigns: defaultCampaigns,
    holidays: store.holidays || [],
    notifications: [],
    settings: defaultSettings,
    cloudinarySettings: defaultCloudinary,
    adminUsers: [primaryAdmin],
    activityLogs: logs,
    deviceFingerprints: [],
    supportTickets: [],
    sliders: defaultSliders,
    roles: defaultRoles,
    smsTransactions: [],
    verifyDevices: [],
    mfsSettings: defaultMfsSettings,
    verificationLogs: [],
    fraudLogs: [],
    walletTransactions: [],
    auditLogs: [],
    apkVersions: defaultApkVersions
  };
  saveStore();
}
function getStore() {
  return store;
}
var isStoreHydratedFromMongo = false;
var mongoHydrationPromise = null;
function saveStore() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (e) {
  }
  if (isStoreHydratedFromMongo) {
    syncStoreToMongo(store).catch((e) => {
      console.warn("[Database] Sync to MongoDB Atlas error:", e?.message);
    });
  } else {
    initMongoSync().then(() => {
      syncStoreToMongo(store).catch(() => {
      });
    }).catch(() => {
    });
  }
}
async function initMongoSync() {
  if (isStoreHydratedFromMongo) return;
  if (mongoHydrationPromise) return mongoHydrationPromise;
  mongoHydrationPromise = (async () => {
    try {
      const mongoData = await loadStoreFromMongo();
      if (mongoData && typeof mongoData === "object" && Array.isArray(mongoData.users)) {
        store = {
          ...store,
          ...mongoData
        };
        isStoreHydratedFromMongo = true;
        console.log(`[Database] Hydrated ${store.users?.length || 0} users and platform state from MongoDB Atlas.`);
        try {
          fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), "utf-8");
        } catch (e) {
        }
      } else {
        isStoreHydratedFromMongo = true;
        console.log("[Database] Seeding initial platform state to MongoDB Atlas...");
        await syncStoreToMongo(store);
      }
    } catch (err) {
      console.warn("[Database] Error initializing MongoDB state sync:", err?.message);
    }
  })();
  return mongoHydrationPromise;
}
function recordWalletLedgerEntry(entry) {
  const currentStore = getStore();
  if (!currentStore.walletTransactions) currentStore.walletTransactions = [];
  const ledgerItem = {
    ...entry,
    id: `wtx_${Date.now()}_${Math.floor(Math.random() * 1e3)}`,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  currentStore.walletTransactions.unshift(ledgerItem);
  if (currentStore.walletTransactions.length > 2e3) {
    currentStore.walletTransactions = currentStore.walletTransactions.slice(0, 2e3);
  }
  return ledgerItem;
}
function recordFinancialAuditLog(log) {
  const currentStore = getStore();
  if (!currentStore.auditLogs) currentStore.auditLogs = [];
  const auditItem = {
    ...log,
    id: `audit_${Date.now()}_${Math.floor(Math.random() * 1e3)}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  currentStore.auditLogs.unshift(auditItem);
  return auditItem;
}
function getUniqueTrxKey(trxId, paymentMethod) {
  const cleanTrx = (trxId || "").trim().toUpperCase();
  const cleanMethod = (paymentMethod || "").trim().toLowerCase();
  return `${cleanTrx}_${cleanMethod}`;
}
function isTrxUnique(trxId, paymentMethod, excludeId) {
  if (!trxId || !paymentMethod) return false;
  const currentStore = getStore();
  const key = getUniqueTrxKey(trxId, paymentMethod);
  const existingSms = currentStore.smsTransactions.find(
    (s) => s.id !== excludeId && s.trxId && getUniqueTrxKey(s.trxId, s.paymentMethod || s.method || s.sender) === key && (s.used || s.verified)
  );
  if (existingSms) return false;
  const existingDep = currentStore.deposits.find(
    (d) => d.id !== excludeId && d.transactionId && getUniqueTrxKey(d.transactionId, d.paymentMethod) === key && (d.status === "approved" || d.status === "auto_approved")
  );
  return !existingDep;
}
initializeSeedData();

// server/socket.ts
import { Server as SocketIOServer } from "socket.io";

// server/smsParser.ts
function cleanBdPhone(phoneStr) {
  if (!phoneStr) return "";
  const digits = phoneStr.replace(/[^0-9]/g, "");
  if (digits.length === 11 && digits.startsWith("01")) {
    return digits;
  }
  if (digits.length === 13 && digits.startsWith("8801")) {
    return digits.substring(2);
  }
  if (digits.length === 10 && digits.startsWith("1")) {
    return "0" + digits;
  }
  return digits;
}
function cleanAmount(amountStr) {
  if (!amountStr) return 0;
  const cleaned = amountStr.replace(/[^0-9.]/g, "");
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}
function parseMfsSms(rawSms) {
  if (!rawSms || typeof rawSms !== "string" || rawSms.trim().length === 0) {
    return { isValid: false, rawSms: rawSms || "", error: "Empty SMS content" };
  }
  const text = rawSms.trim();
  if (/\b(OTP|verification code|security code|PIN|do not share|one time password)\b/i.test(text)) {
    return { isValid: false, rawSms: text, error: "Ignored: OTP / Security SMS" };
  }
  if (/\b(Payment of Tk|Cash Out of Tk|Cash Out Tk|Send Money to Tk|Fee of Tk|Paid Tk|successful payment)\b/i.test(text)) {
    return { isValid: false, rawSms: text, error: "Ignored: Outgoing debit transaction" };
  }
  if (/\b(offer|cashback offer|win|bonus offer|dial \*|recharge offer|discount)\b/i.test(text) && !/\b(TrxID|TxnID)\b/i.test(text)) {
    return { isValid: false, rawSms: text, error: "Ignored: Promotional message" };
  }
  if (/\b(bKash|TrxID)\b/i.test(text) || text.includes("received") && text.includes("TrxID")) {
    const trxMatch = text.match(/TrxID\s*[:\s]?\s*([A-Z0-9]{6,16})/i);
    const amountMatch = text.match(/(?:received(?: deposit of)?|Cash In)\s+Tk\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
    const senderMatch = text.match(/from\s+(01[3-9][0-9]{8}|8801[3-9][0-9]{8})/i);
    const balanceMatch = text.match(/Balance\s+Tk\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
    const timeMatch = text.match(/at\s+([0-9]{2}\/[0-9]{2}\/[0-9]{2,4}\s+[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)/i);
    if (trxMatch && amountMatch) {
      const trxId = trxMatch[1].trim().toUpperCase();
      const amount = cleanAmount(amountMatch[1]);
      const senderNumber = senderMatch ? cleanBdPhone(senderMatch[1]) : "";
      const balanceAfter = balanceMatch ? balanceMatch[1] : void 0;
      const smsTime = timeMatch ? timeMatch[1] : (/* @__PURE__ */ new Date()).toISOString();
      return {
        isValid: true,
        method: "bKash",
        trxId,
        amount,
        senderNumber,
        balanceAfter,
        smsTime,
        rawSms: text
      };
    }
  }
  if (/\b(Nagad|TxnID)\b/i.test(text) || text.includes("received") && text.includes("TxnID")) {
    const txnMatch = text.match(/TxnID\s*[:\s]?\s*([A-Z0-9]{6,16})/i);
    const amountMatch = text.match(/(?:Cash In of|received|Deposit of)\s+Tk\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
    const senderMatch = text.match(/from\s+(01[3-9][0-9]{8}|8801[3-9][0-9]{8})/i);
    const balanceMatch = text.match(/Balance\s*:\s*Tk\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
    const timeMatch = text.match(/at\s+([0-9]{2}\/[0-9]{2}\/[0-9]{2,4}\s+[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)/i);
    if (txnMatch && amountMatch) {
      const trxId = txnMatch[1].trim().toUpperCase();
      const amount = cleanAmount(amountMatch[1]);
      const senderNumber = senderMatch ? cleanBdPhone(senderMatch[1]) : "";
      const balanceAfter = balanceMatch ? balanceMatch[1] : void 0;
      const smsTime = timeMatch ? timeMatch[1] : (/* @__PURE__ */ new Date()).toISOString();
      return {
        isValid: true,
        method: "Nagad",
        trxId,
        amount,
        senderNumber,
        balanceAfter,
        smsTime,
        rawSms: text
      };
    }
  }
  const genericTrx = text.match(/(?:TrxID|TxnID|TRX|TXN)\s*[:\s]?\s*([A-Z0-9]{6,16})/i);
  const genericAmount = text.match(/(?:Tk|BDT|Amount)\s*[:\s]?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
  const genericSender = text.match(/(?:from|sender)\s*[:\s]?\s*(01[3-9][0-9]{8})/i);
  if (genericTrx && genericAmount) {
    const isNagad = /Nagad|TxnID/i.test(text);
    return {
      isValid: true,
      method: isNagad ? "Nagad" : "bKash",
      trxId: genericTrx[1].trim().toUpperCase(),
      amount: cleanAmount(genericAmount[1]),
      senderNumber: genericSender ? cleanBdPhone(genericSender[1]) : "",
      rawSms: text,
      smsTime: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  return {
    isValid: false,
    rawSms: text,
    error: "Unrecognized SMS format. Could not reliably extract Transaction ID and Amount."
  };
}

// server/mfsService.ts
var ioInstance = null;
function emitMfsEvent(event, data, userId) {
  if (ioInstance) {
    if (userId) {
      ioInstance.to(`user:${userId}`).emit(event, data);
    }
    ioInstance.to("admins").emit(event, data);
    ioInstance.emit(event, data);
  }
}
function phoneMatches(phoneA, phoneB) {
  if (!phoneA || !phoneB) return false;
  const cleanA = cleanBdPhone(phoneA);
  const cleanB = cleanBdPhone(phoneB);
  if (cleanA === cleanB) return true;
  const tailA = cleanA.slice(-10);
  const tailB = cleanB.slice(-10);
  return tailA.length === 10 && tailA === tailB;
}
function checkSenderOwnership(senderNumber, userId) {
  const store2 = getStore();
  const cleanSender = cleanBdPhone(senderNumber);
  if (!cleanSender) return { allowed: true, isSuspicious: false };
  const twoHoursAgo = Date.now() - 2 * 3600 * 1e3;
  const crossUserDeposit = store2.deposits.find(
    (d) => d.userId !== userId && cleanBdPhone(d.senderNumber) === cleanSender && new Date(d.createdAt).getTime() > twoHoursAgo
  );
  if (crossUserDeposit) {
    const details = `Sender number ${cleanSender} was recently submitted by user ${crossUserDeposit.userId} (Deposit ${crossUserDeposit.id}) within the last 2 hours.`;
    return {
      allowed: false,
      isSuspicious: true,
      details,
      warning: "Suspicious sender number sharing detected across distinct accounts."
    };
  }
  const uniqueUsers = new Set(
    store2.deposits.filter((d) => cleanBdPhone(d.senderNumber) === cleanSender).map((d) => d.userId)
  );
  if (uniqueUsers.size >= 2 && !uniqueUsers.has(userId)) {
    const details = `Sender number ${cleanSender} has already been used by ${uniqueUsers.size} different accounts. High risk syndication pattern.`;
    return {
      allowed: false,
      isSuspicious: true,
      details,
      warning: "Sender number shared across multiple user accounts."
    };
  }
  return { allowed: true, isSuspicious: false };
}
function calculateSmartVerificationScore(deposit, matchedSms, allowedAgeHours = 24) {
  if (!matchedSms) {
    return {
      score: 0,
      breakdown: {
        trxIdMatch: false,
        amountMatch: false,
        senderMatch: false,
        methodMatch: false,
        unusedCheck: false,
        timeValid: false,
        senderOwnershipPassed: false
      },
      failureReasons: ["Transaction ID not found in MFS gateway records"]
    };
  }
  const normalizedTrx = deposit.transactionId.trim().toUpperCase();
  const smsTrx = matchedSms.trxId.trim().toUpperCase();
  const trxIdMatch = normalizedTrx === smsTrx;
  const amountMatch = Math.abs(matchedSms.amount - deposit.amount) < 0.01;
  const senderMatch = !matchedSms.senderNumber || !deposit.senderNumber || phoneMatches(matchedSms.senderNumber, deposit.senderNumber);
  const smsMethodStr = (matchedSms.method || matchedSms.paymentMethod || matchedSms.sender || "").toLowerCase();
  const depMethodStr = (deposit.paymentMethod || "").toLowerCase();
  const methodMatch = !smsMethodStr || !depMethodStr || smsMethodStr.includes(depMethodStr) || depMethodStr.includes(smsMethodStr);
  const unusedCheck = matchedSms.used === false && !matchedSms.usedByUser;
  const smsDateStr = matchedSms.createdAt || matchedSms.receivedAt || matchedSms.smsTime || (/* @__PURE__ */ new Date()).toISOString();
  const smsAgeMs = Math.max(0, Date.now() - new Date(smsDateStr).getTime());
  const timeValid = isNaN(smsAgeMs) || smsAgeMs <= allowedAgeHours * 3600 * 1e3;
  const ownershipCheck = checkSenderOwnership(deposit.senderNumber, deposit.userId);
  const senderOwnershipPassed = ownershipCheck.allowed;
  const failureReasons = [];
  if (!trxIdMatch) failureReasons.push("TrxID mismatch");
  if (!methodMatch) failureReasons.push(`Payment method mismatch (SMS: ${matchedSms.method}, Deposit: ${deposit.paymentMethod})`);
  if (!amountMatch) failureReasons.push(`Amount mismatch (SMS: \u09F3${matchedSms.amount}, Deposit: \u09F3${deposit.amount})`);
  if (!senderMatch) failureReasons.push(`Sender phone mismatch (SMS: ${matchedSms.senderNumber}, Deposit: ${deposit.senderNumber})`);
  if (!unusedCheck) failureReasons.push(`Transaction already used by ${matchedSms.usedByUser || "another deposit"}`);
  if (!timeValid) failureReasons.push(`SMS exceeds max allowed age of ${allowedAgeHours} hours`);
  if (!senderOwnershipPassed) failureReasons.push(ownershipCheck.details || "Sender ownership verification failed");
  const checks = [
    trxIdMatch,
    amountMatch,
    senderMatch,
    methodMatch,
    unusedCheck,
    timeValid,
    senderOwnershipPassed
  ];
  const passedCount = checks.filter(Boolean).length;
  const score = Math.round(passedCount / checks.length * 100);
  return {
    score,
    breakdown: {
      trxIdMatch,
      amountMatch,
      senderMatch,
      methodMatch,
      unusedCheck,
      timeValid,
      senderOwnershipPassed
    },
    failureReasons,
    ownershipCheck
  };
}
function attemptAutoVerification(deposit, clientIp) {
  const store2 = getStore();
  const settings = store2.mfsSettings || getDefaultMfsSettings();
  const normalizedTrx = deposit.transactionId.trim().toUpperCase();
  const matchedSms = store2.smsTransactions.find(
    (sms) => sms.trxId.toUpperCase() === normalizedTrx
  );
  if (!settings.autoVerificationEnabled) {
    logVerification({
      depositId: deposit.id,
      userId: deposit.userId,
      userPhone: deposit.userPhone,
      trxId: deposit.transactionId,
      paymentMethod: deposit.paymentMethod,
      amount: deposit.amount,
      status: "pending_unmatched",
      score: 0,
      reason: "Auto-verification is disabled in admin settings. Sent to manual review queue.",
      ipAddress: clientIp
    });
    return {
      success: true,
      autoVerified: false,
      status: "pending",
      message: "Deposit submitted. Waiting for manual review as auto-verification is currently disabled."
    };
  }
  if (!matchedSms) {
    logVerification({
      depositId: deposit.id,
      userId: deposit.userId,
      userPhone: deposit.userPhone,
      trxId: deposit.transactionId,
      paymentMethod: deposit.paymentMethod,
      amount: deposit.amount,
      status: "pending_unmatched",
      score: 0,
      scoreBreakdown: {
        trxIdMatch: false,
        amountMatch: false,
        senderMatch: false,
        methodMatch: false,
        unusedCheck: true,
        timeValid: true,
        senderOwnershipPassed: true
      },
      reason: "TrxID not yet received from MFS gateway",
      ipAddress: clientIp
    });
    return {
      success: true,
      autoVerified: false,
      status: "pending",
      score: 0,
      message: "\u09A1\u09BF\u09AA\u09CB\u099C\u09BF\u099F \u09B0\u09BF\u0995\u09CB\u09AF\u09BC\u09C7\u09B8\u09CD\u099F \u099C\u09AE\u09BE \u09B9\u09AF\u09BC\u09C7\u099B\u09C7\u0964 MFS \u0997\u09C7\u099F\u0993\u09AF\u09BC\u09C7 \u09A5\u09C7\u0995\u09C7 SMS \u09B8\u09BF\u0999\u09CD\u0995 \u09B9\u0993\u09AF\u09BC\u09BE \u09AE\u09BE\u09A4\u09CD\u09B0\u0987 \u09B8\u09CD\u09AC\u09AF\u09BC\u0982\u0995\u09CD\u09B0\u09BF\u09AF\u09BC\u09AD\u09BE\u09AC\u09C7 \u0993\u09AF\u09BC\u09BE\u09B2\u09C7\u099F\u09C7 \u09AC\u09CD\u09AF\u09BE\u09B2\u09C7\u09A8\u09CD\u09B8 \u099C\u09AE\u09BE \u09B9\u09AF\u09BC\u09C7 \u09AF\u09BE\u09AC\u09C7\u0964"
    };
  }
  const evalResult = calculateSmartVerificationScore(
    deposit,
    matchedSms,
    settings.allowedSmsAgeHours || 24
  );
  if (!evalResult.breakdown.unusedCheck) {
    logFraud({
      type: "reused_trx",
      severity: "critical",
      trxId: normalizedTrx,
      userId: deposit.userId,
      userPhone: deposit.userPhone,
      senderNumber: deposit.senderNumber,
      details: `Attempted reuse of already credited TrxID: ${normalizedTrx}. Originally credited to user: ${matchedSms.usedByUser}`
    });
    logVerification({
      depositId: deposit.id,
      userId: deposit.userId,
      userPhone: deposit.userPhone,
      trxId: deposit.transactionId,
      paymentMethod: deposit.paymentMethod,
      amount: deposit.amount,
      status: "fraud_duplicate",
      score: evalResult.score,
      scoreBreakdown: evalResult.breakdown,
      matchedSmsId: matchedSms.id,
      reason: `Transaction ID already used by account ${matchedSms.usedByUser}`,
      ipAddress: clientIp
    });
    return {
      success: false,
      autoVerified: false,
      status: "rejected",
      score: evalResult.score,
      scoreBreakdown: evalResult.breakdown,
      message: "This Transaction ID has already been credited to another account.",
      reason: "Transaction already used"
    };
  }
  if (!evalResult.breakdown.senderOwnershipPassed && evalResult.ownershipCheck?.isSuspicious) {
    logFraud({
      type: "suspicious_sender_sharing",
      severity: "high",
      trxId: normalizedTrx,
      userId: deposit.userId,
      userPhone: deposit.userPhone,
      senderNumber: deposit.senderNumber,
      details: evalResult.ownershipCheck?.details || "Suspicious sender number reuse across different user accounts within 2 hours."
    });
  }
  if (!evalResult.breakdown.amountMatch) {
    logFraud({
      type: "wrong_amount",
      severity: "high",
      trxId: normalizedTrx,
      userId: deposit.userId,
      userPhone: deposit.userPhone,
      senderNumber: deposit.senderNumber,
      details: `Amount mismatch: User claimed \u09F3${deposit.amount}, but official SMS received was \u09F3${matchedSms.amount}`
    });
  }
  if (!evalResult.breakdown.senderMatch) {
    logFraud({
      type: "wrong_sender",
      severity: "medium",
      trxId: normalizedTrx,
      userId: deposit.userId,
      userPhone: deposit.userPhone,
      senderNumber: deposit.senderNumber,
      details: `Sender mismatch: User entered ${deposit.senderNumber}, but SMS was received from ${matchedSms.senderNumber}`
    });
  }
  if (evalResult.score < 100) {
    logVerification({
      depositId: deposit.id,
      userId: deposit.userId,
      userPhone: deposit.userPhone,
      trxId: deposit.transactionId,
      paymentMethod: deposit.paymentMethod,
      amount: deposit.amount,
      status: "fraud_mismatch",
      score: evalResult.score,
      scoreBreakdown: evalResult.breakdown,
      matchedSmsId: matchedSms.id,
      reason: `Verification score (${evalResult.score}%) below 100% threshold: ${evalResult.failureReasons.join(", ")}`,
      ipAddress: clientIp
    });
    return {
      success: false,
      autoVerified: false,
      status: "pending",
      score: evalResult.score,
      scoreBreakdown: evalResult.breakdown,
      message: `Deposit verification score is ${evalResult.score}%. Sent to admin review due to: ${evalResult.failureReasons.join(", ")}.`,
      reason: evalResult.failureReasons.join(", ")
    };
  }
  let wallet = store2.wallets.find((w) => w.userId === deposit.userId);
  if (!wallet) {
    wallet = {
      userId: deposit.userId,
      balance: 0,
      totalDeposit: 0,
      totalWithdraw: 0,
      totalEarned: 0,
      todayIncome: 0,
      referralIncome: 0,
      giftIncome: 0,
      salaryIncome: 0,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    store2.wallets.push(wallet);
  }
  const walletSnapshot = wallet.balance;
  const totalDepositSnapshot = wallet.totalDeposit;
  try {
    matchedSms.used = true;
    matchedSms.usedByUser = deposit.userId;
    matchedSms.matchedDepositId = deposit.id;
    matchedSms.verified = true;
    matchedSms.queueStatus = "Used";
    matchedSms.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    const balanceBefore = wallet.balance;
    wallet.balance += deposit.amount;
    wallet.totalDeposit += deposit.amount;
    wallet.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    const balanceAfter = wallet.balance;
    recordWalletLedgerEntry({
      userId: deposit.userId,
      transactionType: "Deposit Verification",
      amount: deposit.amount,
      balanceBefore,
      balanceAfter,
      reason: `Smart Auto Deposit Verified (${deposit.paymentMethod} TrxID: ${deposit.transactionId})`,
      referenceId: deposit.id,
      createdBy: "SYSTEM (Smart Auto Verification)",
      status: "completed"
    });
    const walletTx = {
      id: `tx_${Date.now()}_${Math.floor(Math.random() * 1e3)}`,
      userId: deposit.userId,
      type: "deposit",
      amount: deposit.amount,
      description: `Instant Auto Deposit (${deposit.paymentMethod} TrxID: ${deposit.transactionId})`,
      balanceAfter,
      referenceId: deposit.id,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    store2.transactions.unshift(walletTx);
    deposit.status = "approved";
    deposit.verificationType = "auto";
    deposit.autoVerified = true;
    deposit.matchedSmsId = matchedSms.id;
    deposit.reviewedAt = (/* @__PURE__ */ new Date()).toISOString();
    deposit.reviewedBy = "SYSTEM (Smart Auto Verification)";
    recordFinancialAuditLog({
      adminId: "SYSTEM",
      userId: deposit.userId,
      action: "DEPOSIT_AUTO_VERIFIED",
      oldBalance: balanceBefore,
      newBalance: balanceAfter,
      reference: `TrxID:${deposit.transactionId}|DepID:${deposit.id}|Method:${deposit.paymentMethod}`,
      ip: clientIp || "127.0.0.1"
    });
    saveStore();
    logVerification({
      depositId: deposit.id,
      userId: deposit.userId,
      userPhone: deposit.userPhone,
      trxId: deposit.transactionId,
      paymentMethod: deposit.paymentMethod,
      amount: deposit.amount,
      status: "auto_approved",
      score: 100,
      scoreBreakdown: evalResult.breakdown,
      matchedSmsId: matchedSms.id,
      reason: "Score 100% \u2014 Instant MFS Auto-Verification Match",
      ipAddress: clientIp
    });
    const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    });
    const notif = {
      id: `notif_${Date.now()}`,
      userId: deposit.userId,
      type: "deposit",
      title: "Deposit Verified",
      message: `Deposit Verified! \u09F3${deposit.amount.toLocaleString()} has been received via ${deposit.paymentMethod} (TrxID: ${deposit.transactionId}). Current Wallet Balance: \u09F3${wallet.balance.toLocaleString()} at ${formattedTime}.`,
      isRead: false,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    store2.notifications.unshift(notif);
    saveStore();
    emitMfsEvent(
      "wallet.updated",
      {
        userId: deposit.userId,
        balance: wallet.balance,
        balanceBefore,
        amountAdded: deposit.amount,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      },
      deposit.userId
    );
    emitMfsEvent(
      "deposit.verified",
      {
        depositId: deposit.id,
        userId: deposit.userId,
        amount: deposit.amount,
        trxId: deposit.transactionId,
        paymentMethod: deposit.paymentMethod,
        autoVerified: true,
        currentBalance: wallet.balance,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      },
      deposit.userId
    );
    emitMfsEvent(
      "notification.new",
      {
        ...notif,
        amount: deposit.amount,
        currentWalletBalance: wallet.balance,
        transactionId: deposit.transactionId,
        time: formattedTime
      },
      deposit.userId
    );
    emitMfsEvent("admin.dashboard.updated", {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      reason: "Deposit auto-verified"
    });
    const user = store2.users.find((u) => u.id === deposit.userId);
    if (user && user.referredBy) {
      emitMfsEvent("referral.updated", {
        userId: user.id,
        referredBy: user.referredBy,
        depositAmount: deposit.amount,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    return {
      success: true,
      autoVerified: true,
      status: "approved",
      score: 100,
      scoreBreakdown: evalResult.breakdown,
      message: `Deposit verified automatically! \u09F3${deposit.amount.toLocaleString()} has been credited to your wallet instantly.`,
      matchedSms
    };
  } catch (error) {
    wallet.balance = walletSnapshot;
    wallet.totalDeposit = totalDepositSnapshot;
    matchedSms.used = false;
    matchedSms.usedByUser = null;
    matchedSms.queueStatus = "Failed";
    deposit.status = "pending";
    saveStore();
    console.error("CRITICAL: Auto verification transaction failed. Rolled back wallet balance:", error);
    throw error;
  }
}
function checkPendingDepositsForIncomingSms(sms) {
  const store2 = getStore();
  const settings = store2.mfsSettings || getDefaultMfsSettings();
  if (!settings.autoVerificationEnabled) return;
  const normalizedTrx = sms.trxId.toUpperCase();
  const pendingDeposit = store2.deposits.find(
    (d) => d.status === "pending" && d.transactionId.toUpperCase() === normalizedTrx && d.paymentMethod.toLowerCase() === sms.method.toLowerCase()
  );
  if (pendingDeposit) {
    sms.queueStatus = "Verified";
    saveStore();
    attemptAutoVerification(pendingDeposit, "SMS_GATEWAY_SYNC");
  }
}
function retryFailedSmsQueue() {
  const store2 = getStore();
  const failedList = store2.smsTransactions.filter((s) => s.queueStatus === "Failed" && (!s.retryCount || s.retryCount < 3));
  let retriedCount = 0;
  for (const sms of failedList) {
    sms.retryCount = (sms.retryCount || 0) + 1;
    sms.queueStatus = "Synced";
    checkPendingDepositsForIncomingSms(sms);
    retriedCount++;
  }
  if (retriedCount > 0) {
    saveStore();
  }
  return retriedCount;
}
function logVerification(log) {
  const store2 = getStore();
  if (!store2.verificationLogs) store2.verificationLogs = [];
  const entry = {
    ...log,
    id: `vlog_${Date.now()}_${Math.floor(Math.random() * 1e3)}`,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  store2.verificationLogs.unshift(entry);
  if (store2.verificationLogs.length > 500) {
    store2.verificationLogs = store2.verificationLogs.slice(0, 500);
  }
  saveStore();
}
function logFraud(fraud) {
  const store2 = getStore();
  if (!store2.fraudLogs) store2.fraudLogs = [];
  const entry = {
    ...fraud,
    id: `flog_${Date.now()}_${Math.floor(Math.random() * 1e3)}`,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  store2.fraudLogs.unshift(entry);
  if (store2.fraudLogs.length > 300) {
    store2.fraudLogs = store2.fraudLogs.slice(0, 300);
  }
  saveStore();
  emitMfsEvent("admin.fraud.alert", entry);
}
function getDefaultMfsSettings() {
  return {
    autoVerificationEnabled: true,
    // PRIMARY RULE: Default ON
    manualVerificationEnabled: false,
    // PRIMARY RULE: Default OFF
    fallbackManualReview: true,
    verificationTimeoutMinutes: 10,
    allowedSmsAgeHours: 24,
    enableDeviceSync: true,
    deviceSecretToken: "ehbd_sec_verify_token_2026",
    apkDownloadUrl: "/downloads/EarnHubVerify.apk",
    latestApkVersion: "2.0.4",
    forceUpdateApk: false
  };
}

// server/socket.ts
var io = null;
var onlineUserCount = 0;
function getOnlineUserCount() {
  return Math.max(1, onlineUserCount);
}
function emitWalletUpdated(userId, walletData) {
  if (!io) return;
  io.to(`user:${userId}`).emit("wallet.updated", walletData);
  io.to("admins").emit("wallet.updated", { userId, ...walletData });
}
function emitDepositStatusChanged(userId, depositData) {
  if (!io) return;
  io.to(`user:${userId}`).emit("deposit.status.changed", depositData);
  io.to("finance-admins").emit("deposit.status.changed", depositData);
  io.to("admins").emit("deposit.status.changed", depositData);
}
function emitWithdrawStatusChanged(userId, withdrawData) {
  if (!io) return;
  io.to(`user:${userId}`).emit("withdraw.status.changed", withdrawData);
  io.to("finance-admins").emit("withdraw.status.changed", withdrawData);
  io.to("admins").emit("withdraw.status.changed", withdrawData);
}
function emitNotificationNew(userId, notification) {
  if (!io) return;
  io.to(`user:${userId}`).emit("notification.new", notification);
}
function emitReferralCommission(userId, commissionData) {
  if (!io) return;
  io.to(`user:${userId}`).emit("referral.commission", commissionData);
  io.to("admins").emit("referral.commission", commissionData);
}
function emitTaskCompleted(userId, taskData) {
  if (!io) return;
  io.to(`user:${userId}`).emit("task.completed", taskData);
}
function emitCampaignUpdated(campaignData) {
  if (!io) return;
  io.emit("campaign.updated", campaignData);
}
function emitHolidayUpdated(holidayData) {
  if (!io) return;
  io.emit("holiday.updated", holidayData);
}
function emitBrandingUpdated(settingsData) {
  if (!io) return;
  io.emit("branding.updated", settingsData);
}
function emitAdminDashboardUpdated(metrics) {
  if (!io) return;
  io.to("admins").emit("admin.dashboard.updated", metrics || {});
}

// server/security.ts
import rateLimit from "express-rate-limit";
var authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1e3,
  // 15 minutes
  max: 30,
  // Limit each IP to 30 authentication attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: {
    error: "\u0985\u09A4\u09BF\u09B0\u09BF\u0995\u09CD\u09A4 \u099A\u09C7\u09B7\u09CD\u099F\u09BE \u0995\u09B0\u09BE \u09B9\u09AF\u09BC\u09C7\u099B\u09C7\u0964 \u0985\u09A8\u09C1\u0997\u09CD\u09B0\u09B9 \u0995\u09B0\u09C7 \u09E7\u09EB \u09AE\u09BF\u09A8\u09BF\u099F \u09AA\u09B0 \u09AA\u09C1\u09A8\u09B0\u09BE\u09AF\u09BC \u099A\u09C7\u09B7\u09CD\u099F\u09BE \u0995\u09B0\u09C1\u09A8 (Rate Limit Exceeded)."
  }
});
var financialRateLimiter = rateLimit({
  windowMs: 60 * 1e3,
  // 1 minute
  max: 20,
  // Max 20 money actions per minute
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: {
    error: "\u0985\u09A4\u09CD\u09AF\u09A7\u09BF\u0995 \u09A6\u09CD\u09B0\u09C1\u09A4 \u0985\u09A8\u09C1\u09B0\u09CB\u09A7 \u0995\u09B0\u09BE \u09B9\u09AF\u09BC\u09C7\u099B\u09C7\u0964 \u0985\u09A8\u09C1\u0997\u09CD\u09B0\u09B9 \u0995\u09B0\u09C7 \u0995\u09AF\u09BC\u09C7\u0995 \u09B8\u09C7\u0995\u09C7\u09A8\u09CD\u09A1 \u0985\u09AA\u09C7\u0995\u09CD\u09B7\u09BE \u0995\u09B0\u09C1\u09A8\u0964"
  }
});
var globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1e3,
  max: 1500,
  // Max 1500 requests per 15 mins per IP
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: {
    error: "\u0985\u09A4\u09BF\u09B0\u09BF\u0995\u09CD\u09A4 \u0985\u09A8\u09C1\u09B0\u09CB\u09A7 \u09B8\u09A8\u09BE\u0995\u09CD\u09A4 \u09B9\u09AF\u09BC\u09C7\u099B\u09C7\u0964 \u0995\u09BF\u099B\u09C1 \u09B8\u09AE\u09AF\u09BC \u09AA\u09B0 \u09AA\u09C1\u09A8\u09B0\u09BE\u09AF\u09BC \u099A\u09C7\u09B7\u09CD\u099F\u09BE \u0995\u09B0\u09C1\u09A8\u0964"
  }
});
function isValidPositiveAmount(val, min = 1, max = 1e7) {
  if (val === null || val === void 0) return false;
  const num = Number(val);
  return typeof num === "number" && !isNaN(num) && isFinite(num) && num >= min && num <= max;
}
function sanitizeRequestData(req, res, next) {
  function clean(obj) {
    if (obj === null || typeof obj !== "object") {
      if (typeof obj === "string") {
        return obj.replace(/\0/g, "").trim();
      }
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(clean);
    }
    const sanitized = {};
    for (const key of Object.keys(obj)) {
      if (key.startsWith("$") || key.includes(".") || key === "__proto__" || key === "constructor") {
        continue;
      }
      sanitized[key] = clean(obj[key]);
    }
    return sanitized;
  }
  if (req.body) {
    req.body = clean(req.body);
  }
  if (req.query) {
    req.query = clean(req.query);
  }
  if (req.params) {
    req.params = clean(req.params);
  }
  next();
}
function applySecurityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("X-Download-Options", "noopen");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  next();
}

// server/routes.ts
var router = Router();
var JWT_SECRET = process.env.JWT_SECRET || "earnhub-bd-v20-locked-secret-key-2026";
var activeTaskLocks = /* @__PURE__ */ new Set();
var activeWithdrawLocks = /* @__PURE__ */ new Set();
function isValidBdPhone(phone) {
  const clean = phone.replace(/[\s-]/g, "");
  return /^(?:\+8801|8801|01)[3-9]\d{8}$/.test(clean);
}
function normalizeBdPhone(phone) {
  let clean = phone.replace(/[\s-]/g, "");
  if (clean.startsWith("+88")) clean = clean.substring(3);
  if (clean.startsWith("88")) clean = clean.substring(2);
  return clean;
}
function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : req.cookies && req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Please login" });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const store2 = getStore();
    if (decoded.isAdmin) {
      const adminRec = (store2.adminUsers || []).find((a) => a.id === decoded.id || a.phone === decoded.phone);
      if (adminRec && adminRec.status === "disabled") {
        return res.status(403).json({ error: "Admin account is disabled" });
      }
      req.user = decoded;
      req.admin = decoded;
      return next();
    }
    const dbUser = store2.users.find((u) => u.id === decoded.id);
    if (dbUser) {
      if (dbUser.status === "suspended" || dbUser.isBanned || dbUser.isLockedOut) {
        return res.status(403).json({ error: "\u0986\u09AA\u09A8\u09BE\u09B0 \u0985\u09CD\u09AF\u09BE\u0995\u09BE\u0989\u09A8\u09CD\u099F\u099F\u09BF \u09B8\u09BE\u09AE\u09AF\u09BC\u09BF\u0995\u09AD\u09BE\u09AC\u09C7 \u09B8\u09CD\u09A5\u0997\u09BF\u09A4 (Suspended/Banned) \u0995\u09B0\u09BE \u09B9\u09AF\u09BC\u09C7\u099B\u09C7\u0964" });
      }
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session expired or invalid token" });
  }
}
function authenticateAdmin(req, res, next) {
  authenticateUser(req, res, () => {
    const user = req.user;
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: "Access denied: Admin privileges required" });
    }
    req.admin = user;
    next();
  });
}
router.get(["/auth/validate-referral", "/api/auth/validate-referral"], (req, res) => {
  const rawCode = (req.query.code || "").trim();
  if (!rawCode) {
    return res.json({ valid: false, message: "\u09B0\u09C7\u09AB\u09BE\u09B0 \u0995\u09CB\u09A1 \u09AA\u09CD\u09B0\u09A6\u09BE\u09A8 \u0995\u09B0\u09C1\u09A8\u0964" });
  }
  const cleanRefCode = rawCode.toUpperCase();
  const store2 = getStore();
  const officialCodes = [
    "EHBD1001",
    "EARNHUB20",
    store2.settings?.defaultReferralCode
  ].filter(Boolean).map((c) => c.toUpperCase());
  if (officialCodes.includes(cleanRefCode)) {
    return res.json({
      valid: true,
      isOfficial: true,
      sponsorName: "Official System Sponsor (\u09B9\u09C7\u09A1 \u0985\u09AB\u09BF\u09B8)",
      sponsorRole: "Head Office"
    });
  }
  const uplineUser = store2.users.find(
    (u) => u.referralCode && u.referralCode.toUpperCase() === cleanRefCode
  );
  if (!uplineUser) {
    return res.json({
      valid: false,
      message: "\u09AD\u09C1\u09DF\u09BE \u09AC\u09BE \u0985\u09B8\u09CD\u09A4\u09BF\u09A4\u09CD\u09AC\u09B9\u09C0\u09A8 \u09B0\u09C7\u09AB\u09BE\u09B0 \u0995\u09CB\u09A1! \u09A1\u09BE\u099F\u09BE\u09AC\u09C7\u09B8\u09C7 \u098F\u0987 \u09B0\u09C7\u09AB\u09BE\u09B0 \u0995\u09CB\u09A1\u09C7\u09B0 \u0995\u09CB\u09A8\u09CB \u0987\u0989\u099C\u09BE\u09B0 \u09A8\u09C7\u0987\u0964"
    });
  }
  if (uplineUser.status === "suspended") {
    return res.json({
      valid: false,
      message: "\u098F\u0987 \u09B0\u09C7\u09AB\u09BE\u09B0\u09BE\u09B0\u09C7\u09B0 \u0985\u09CD\u09AF\u09BE\u0995\u09BE\u0989\u09A8\u09CD\u099F \u09B8\u09BE\u09AE\u09DF\u09BF\u0995\u09AD\u09BE\u09AC\u09C7 \u09B8\u09CD\u09A5\u0997\u09BF\u09A4 \u09AC\u09BE \u09A8\u09BF\u09B7\u09CD\u0995\u09CD\u09B0\u09BF\u09DF \u09B0\u09DF\u09C7\u099B\u09C7\u0964"
    });
  }
  const maskedPhone = uplineUser.phone.length >= 11 ? uplineUser.phone.slice(0, 3) + "****" + uplineUser.phone.slice(-4) : uplineUser.phone;
  return res.json({
    valid: true,
    isOfficial: false,
    sponsorName: uplineUser.name ? uplineUser.name : `\u09B8\u0995\u09CD\u09B0\u09BF\u09DF \u09AE\u09C7\u09AE\u09CD\u09AC\u09BE\u09B0 (${maskedPhone})`,
    sponsorPhone: maskedPhone,
    sponsorRole: uplineUser.role || "Member"
  });
});
router.post("/auth/register", authRateLimiter, (req, res) => {
  const { phone, password, referralCode, deviceFingerprint } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ error: "\u09AE\u09CB\u09AC\u09BE\u0987\u09B2 \u09A8\u09AE\u09CD\u09AC\u09B0 \u098F\u09AC\u0982 \u09AA\u09BE\u09B8\u0993\u09AF\u09BC\u09BE\u09B0\u09CD\u09A1 \u09AA\u09CD\u09B0\u09A6\u09BE\u09A8 \u0995\u09B0\u09BE \u0986\u09AC\u09B6\u09CD\u09AF\u0995\u0964" });
  }
  if (!isValidBdPhone(phone)) {
    return res.status(400).json({ error: "\u09B8\u09A0\u09BF\u0995 \u09E7\u09E7 \u09A1\u09BF\u099C\u09BF\u099F\u09C7\u09B0 \u09AC\u09BE\u0982\u09B2\u09BE\u09A6\u09C7\u09B6\u09BF \u09AE\u09CB\u09AC\u09BE\u0987\u09B2 \u09A8\u09AE\u09CD\u09AC\u09B0 \u09AA\u09CD\u09B0\u09A6\u09BE\u09A8 \u0995\u09B0\u09C1\u09A8 (\u09AF\u09C7\u09AE\u09A8: 017xxxxxxxx)\u0964" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "\u09AA\u09BE\u09B8\u0993\u09AF\u09BC\u09BE\u09B0\u09CD\u09A1 \u0995\u09AE\u09AA\u0995\u09CD\u09B7\u09C7 \u09EC \u0985\u0995\u09CD\u09B7\u09B0\u09C7\u09B0 \u09B9\u09A4\u09C7 \u09B9\u09AC\u09C7\u0964" });
  }
  const normalizedPhone = normalizeBdPhone(phone);
  const store2 = getStore();
  const existingUser = store2.users.find((u) => u.phone === normalizedPhone);
  if (existingUser) {
    return res.status(400).json({ error: "\u098F\u0987 \u09AE\u09CB\u09AC\u09BE\u0987\u09B2 \u09A8\u09AE\u09CD\u09AC\u09B0\u099F\u09BF \u09A6\u09BF\u09AF\u09BC\u09C7 \u0987\u09A4\u09BF\u09AE\u09A7\u09CD\u09AF\u09C7 \u0985\u09CD\u09AF\u09BE\u0995\u09BE\u0989\u09A8\u09CD\u099F \u0996\u09CB\u09B2\u09BE \u09B9\u09AF\u09BC\u09C7\u099B\u09C7\u0964" });
  }
  if (!referralCode || !referralCode.trim()) {
    return res.status(400).json({
      error: "\u09B0\u09C7\u09AB\u09BE\u09B0 \u0995\u09CB\u09A1 \u0986\u09AC\u09B6\u09CD\u09AF\u0995! \u09B0\u09C7\u09AB\u09BE\u09B0 \u0995\u09CB\u09A1 \u099B\u09BE\u09A1\u09BC\u09BE \u0985\u09CD\u09AF\u09BE\u0995\u09BE\u0989\u09A8\u09CD\u099F \u09A4\u09C8\u09B0\u09BF \u0995\u09B0\u09BE \u09B8\u09AE\u09CD\u09AD\u09AC \u09A8\u09AF\u09BC\u0964"
    });
  }
  const cleanRefCode = referralCode.trim().toUpperCase();
  const officialCodes = [
    "EHBD1001",
    "EARNHUB20",
    store2.settings?.defaultReferralCode
  ].filter(Boolean).map((c) => c.toUpperCase());
  const isOfficialCode = officialCodes.includes(cleanRefCode);
  const uplineUser = store2.users.find(
    (u) => u.referralCode && u.referralCode.toUpperCase() === cleanRefCode
  );
  if (!uplineUser && !isOfficialCode) {
    return res.status(400).json({
      error: "\u09AD\u09C1\u09DF\u09BE \u09AC\u09BE \u0985\u09B8\u09CD\u09A4\u09BF\u09A4\u09CD\u09AC\u09B9\u09C0\u09A8 \u09B0\u09C7\u09AB\u09BE\u09B0 \u0995\u09CB\u09A1! \u09B6\u09C1\u09A7\u09C1\u09AE\u09BE\u09A4\u09CD\u09B0 \u09A1\u09BE\u099F\u09BE\u09AC\u09C7\u09B8\u09C7\u09B0 \u09AC\u09C8\u09A7 \u0993 \u09B8\u0995\u09CD\u09B0\u09BF\u09DF \u0987\u0989\u099C\u09BE\u09B0\u09C7\u09B0 \u09B0\u09C7\u09AB\u09BE\u09B0 \u0995\u09CB\u09A1 \u0997\u09CD\u09B0\u09B9\u09A3\u09AF\u09CB\u0997\u09CD\u09AF\u0964"
    });
  }
  if (uplineUser && uplineUser.status === "suspended") {
    return res.status(400).json({
      error: "\u098F\u0987 \u09B0\u09C7\u09AB\u09BE\u09B0 \u0995\u09CB\u09A1\u09C7\u09B0 \u09AE\u09BE\u09B2\u09BF\u0995\u09C7\u09B0 \u0985\u09CD\u09AF\u09BE\u0995\u09BE\u0989\u09A8\u09CD\u099F\u099F\u09BF \u09B8\u09BE\u09AE\u09DF\u09BF\u0995\u09AD\u09BE\u09AC\u09C7 \u09B8\u09CD\u09A5\u0997\u09BF\u09A4 \u09AC\u09BE \u09A8\u09BF\u09B7\u09CD\u0995\u09CD\u09B0\u09BF\u09DF \u09B0\u09DF\u09C7\u099B\u09C7\u0964 \u0985\u09A8\u09C1\u0997\u09CD\u09B0\u09B9 \u0995\u09B0\u09C7 \u0985\u09A8\u09CD\u09AF \u09B8\u0995\u09CD\u09B0\u09BF\u09DF \u09B0\u09C7\u09AB\u09BE\u09B0 \u0995\u09CB\u09A1 \u09AC\u09CD\u09AF\u09AC\u09B9\u09BE\u09B0 \u0995\u09B0\u09C1\u09A8\u0964"
    });
  }
  if (uplineUser && uplineUser.phone === normalizedPhone) {
    return res.status(400).json({
      error: "\u09A8\u09BF\u099C\u09C7\u09B0 \u09AE\u09CB\u09AC\u09BE\u0987\u09B2 \u09A8\u09AE\u09CD\u09AC\u09B0 \u09AC\u09BE \u09A8\u09BF\u099C\u09C7\u09B0 \u09B0\u09C7\u09AB\u09BE\u09B0 \u0995\u09CB\u09A1 \u09A6\u09BF\u09DF\u09C7 \u09B0\u09C7\u09AB\u09BE\u09B0\u09C7\u09B2 \u098F\u0995\u09BE\u0989\u09A8\u09CD\u099F \u0996\u09CB\u09B2\u09BE \u09B8\u09AE\u09CD\u09AD\u09AC \u09A8\u09DF\u0964"
    });
  }
  const salt = bcrypt2.genSaltSync(10);
  const passwordHash = bcrypt2.hashSync(password, salt);
  const userId = `user_${Date.now()}`;
  const generatedRefCode = `EH${normalizedPhone.slice(-4)}${Math.floor(100 + Math.random() * 900)}`;
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "103.205.71.1";
  const fp = deviceFingerprint || `fp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const newUser = {
    id: userId,
    phone: normalizedPhone,
    passwordHash,
    role: "Member",
    referralCode: generatedRefCode,
    referredBy: uplineUser ? uplineUser.referralCode : void 0,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    status: "active",
    isTrial: true,
    trialStartDate: (/* @__PURE__ */ new Date()).toISOString(),
    trialDaysUsed: 0,
    trialTotalEarned: 0,
    trialMissedDays: 0,
    trialExpired: false,
    activePackageId: "pkg_trial",
    packageActivatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    withdrawSetupDone: false,
    deviceFingerprint: fp,
    lastLoginIp: clientIp,
    lastLoginAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const newWallet = {
    userId,
    balance: 0,
    totalDeposit: 0,
    totalWithdraw: 0,
    totalEarned: 0,
    todayIncome: 0,
    referralIncome: 0,
    giftIncome: 0,
    salaryIncome: 0,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  let dfRecord = store2.deviceFingerprints.find((d) => d.deviceFingerprint === fp);
  if (dfRecord) {
    if (!dfRecord.associatedUserIds.includes(userId)) {
      dfRecord.associatedUserIds.push(userId);
    }
    dfRecord.lastSeenAt = (/* @__PURE__ */ new Date()).toISOString();
    dfRecord.lastSeenIp = clientIp;
  } else {
    store2.deviceFingerprints.push({
      deviceFingerprint: fp,
      associatedUserIds: [userId],
      trialWithdrawalCompleted: false,
      lastSeenIp: clientIp,
      lastSeenAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  store2.notifications.push({
    id: `notif_${Date.now()}`,
    userId,
    type: "task",
    title: "Welcome to EarnNetwork BD!",
    message: "Your 4-Day Free Trial is now active. Complete 1 video task today to earn 25 TK.",
    isRead: false,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  store2.users.push(newUser);
  store2.wallets.push(newWallet);
  saveStore();
  emitAdminDashboardUpdated();
  const token = jwt.sign(
    { id: newUser.id, phone: newUser.phone, isAdmin: false, role: newUser.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
  res.cookie("token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 7 * 864e5 });
  const { passwordHash: _, ...safeUser } = newUser;
  return res.json({ token, user: safeUser, wallet: newWallet });
});
router.post("/auth/login", authRateLimiter, (req, res) => {
  const { phone, password, deviceFingerprint } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ error: "\u09AE\u09CB\u09AC\u09BE\u0987\u09B2 \u09A8\u09AE\u09CD\u09AC\u09B0 \u098F\u09AC\u0982 \u09AA\u09BE\u09B8\u0993\u09AF\u09BC\u09BE\u09B0\u09CD\u09A1 \u09AA\u09CD\u09B0\u09A6\u09BE\u09A8 \u0995\u09B0\u09BE \u0986\u09AC\u09B6\u09CD\u09AF\u0995\u0964" });
  }
  const normalizedPhone = normalizeBdPhone(phone);
  const store2 = getStore();
  const trimmedPhone = phone.trim().toLowerCase();
  const admin = store2.adminUsers.find(
    (a) => a.phone === normalizedPhone || a.phone === phone.trim() || a.username && a.username.toLowerCase() === trimmedPhone
  );
  if (admin && bcrypt2.compareSync(password, admin.passwordHash)) {
    const token2 = jwt.sign(
      { id: admin.id, phone: admin.phone, isAdmin: true, role: admin.role, name: admin.name },
      JWT_SECRET,
      { expiresIn: "24h" }
    );
    res.cookie("token", token2, { httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 864e5 });
    return res.json({
      token: token2,
      isAdmin: true,
      admin: { id: admin.id, phone: admin.phone, name: admin.name, role: admin.role, permissions: admin.permissions }
    });
  }
  const user = store2.users.find((u) => u.phone === normalizedPhone);
  if (!user || !user.passwordHash || !bcrypt2.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: "\u09AE\u09CB\u09AC\u09BE\u0987\u09B2 \u09A8\u09AE\u09CD\u09AC\u09B0 \u0985\u09A5\u09AC\u09BE \u09AA\u09BE\u09B8\u0993\u09AF\u09BC\u09BE\u09B0\u09CD\u09A1 \u09B8\u09A0\u09BF\u0995 \u09A8\u09AF\u09BC\u0964" });
  }
  if (user.status === "suspended") {
    return res.status(403).json({ error: "\u0986\u09AA\u09A8\u09BE\u09B0 \u0985\u09CD\u09AF\u09BE\u0995\u09BE\u0989\u09A8\u09CD\u099F\u099F\u09BF \u09B8\u09BE\u09AE\u09AF\u09BC\u09BF\u0995\u09AD\u09BE\u09AC\u09C7 \u09B8\u09CD\u09A5\u0997\u09BF\u09A4 \u09AC\u09BE \u09A8\u09BF\u09B7\u09CD\u0995\u09CD\u09B0\u09BF\u09AF\u09BC \u0995\u09B0\u09BE \u09B9\u09AF\u09BC\u09C7\u099B\u09C7\u0964 \u0985\u09CD\u09AF\u09BE\u09A1\u09AE\u09BF\u09A8\u09C7\u09B0 \u09B8\u09BE\u09A5\u09C7 \u09AF\u09CB\u0997\u09BE\u09AF\u09CB\u0997 \u0995\u09B0\u09C1\u09A8\u0964" });
  }
  user.lastLoginAt = (/* @__PURE__ */ new Date()).toISOString();
  user.lastLoginIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "103.205.71.1";
  if (deviceFingerprint) {
    user.deviceFingerprint = deviceFingerprint;
  }
  saveStore();
  const wallet = store2.wallets.find((w) => w.userId === user.id);
  const token = jwt.sign(
    { id: user.id, phone: user.phone, isAdmin: false, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
  res.cookie("token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 7 * 864e5 });
  const { passwordHash: _, withdrawPasswordHash: __, ...safeUser } = user;
  return res.json({ token, isAdmin: false, user: safeUser, wallet });
});
router.get("/auth/me", authenticateUser, (req, res) => {
  const tokenUser = req.user;
  const store2 = getStore();
  if (tokenUser.isAdmin) {
    const admin = store2.adminUsers.find((a) => a.id === tokenUser.id);
    if (!admin) return res.status(404).json({ error: "Admin not found" });
    return res.json({
      isAdmin: true,
      admin: { id: admin.id, phone: admin.phone, name: admin.name, role: admin.role, permissions: admin.permissions }
    });
  }
  const user = store2.users.find((u) => u.id === tokenUser.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const wallet = store2.wallets.find((w) => w.userId === user.id);
  const activePackage = store2.packages.find((p) => p.id === user.activePackageId);
  const { passwordHash: _, withdrawPasswordHash: __, ...safeUser } = user;
  let uplineInfo = null;
  if (user.referredBy) {
    const upline = store2.users.find((u) => u.referralCode === user.referredBy);
    if (upline) {
      uplineInfo = {
        referralCode: upline.referralCode,
        phone: upline.phone,
        role: upline.role
      };
    }
  }
  safeUser.uplineInfo = uplineInfo;
  return res.json({
    isAdmin: false,
    user: safeUser,
    wallet,
    activePackage,
    withdrawSetupDone: user.withdrawSetupDone
  });
});
router.post("/auth/logout", (req, res) => {
  res.clearCookie("token");
  return res.json({ success: true, message: "Logged out successfully" });
});
router.post("/auth/change-password", authenticateUser, (req, res) => {
  const tokenUser = req.user;
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "\u09A8\u09A4\u09C1\u09A8 \u09AA\u09BE\u09B8\u0993\u09AF\u09BC\u09BE\u09B0\u09CD\u09A1 \u0995\u09AE\u09AA\u0995\u09CD\u09B7\u09C7 \u09EC \u0985\u0995\u09CD\u09B7\u09B0\u09C7\u09B0 \u09B9\u09A4\u09C7 \u09B9\u09AC\u09C7\u0964" });
  }
  const store2 = getStore();
  const user = store2.users.find((u) => u.id === tokenUser.id);
  if (!user || !user.passwordHash || !bcrypt2.compareSync(currentPassword, user.passwordHash)) {
    return res.status(400).json({ error: "\u09AC\u09B0\u09CD\u09A4\u09AE\u09BE\u09A8 \u09AA\u09BE\u09B8\u0993\u09AF\u09BC\u09BE\u09B0\u09CD\u09A1\u099F\u09BF \u09B8\u09A0\u09BF\u0995 \u09A8\u09AF\u09BC\u0964" });
  }
  const salt = bcrypt2.genSaltSync(10);
  user.passwordHash = bcrypt2.hashSync(newPassword, salt);
  saveStore();
  return res.json({ success: true, message: "\u09AA\u09BE\u09B8\u0993\u09AF\u09BC\u09BE\u09B0\u09CD\u09A1 \u09B8\u09AB\u09B2\u09AD\u09BE\u09AC\u09C7 \u09AA\u09B0\u09BF\u09AC\u09B0\u09CD\u09A4\u09A8 \u0995\u09B0\u09BE \u09B9\u09AF\u09BC\u09C7\u099B\u09C7\u0964" });
});
router.post("/wallet/withdraw-setup", authenticateUser, (req, res) => {
  const tokenUser = req.user;
  const { paymentMethod, withdrawNumber, withdrawPassword } = req.body;
  if (!paymentMethod || !withdrawNumber || !withdrawPassword) {
    return res.status(400).json({ error: "\u09AA\u09C7\u09AE\u09C7\u09A8\u09CD\u099F \u09AE\u09C7\u09A5\u09A1, \u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u09A8\u09AE\u09CD\u09AC\u09B0 \u098F\u09AC\u0982 \u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u09AA\u09BE\u09B8\u0993\u09AF\u09BC\u09BE\u09B0\u09CD\u09A1 \u09AA\u09CD\u09B0\u09A6\u09BE\u09A8 \u0995\u09B0\u09BE \u0986\u09AC\u09B6\u09CD\u09AF\u0995\u0964" });
  }
  if (paymentMethod !== "bKash" && paymentMethod !== "Nagad") {
    return res.status(400).json({ error: "\u09AA\u09C7\u09AE\u09C7\u09A8\u09CD\u099F \u09AE\u09C7\u09A5\u09A1 \u09B9\u09BF\u09B8\u09C7\u09AC\u09C7 \u09AC\u09BF\u0995\u09BE\u09B6 (bKash) \u0985\u09A5\u09AC\u09BE \u09A8\u0997\u09A6 (Nagad) \u09A8\u09BF\u09B0\u09CD\u09AC\u09BE\u099A\u09A8 \u0995\u09B0\u09C1\u09A8\u0964" });
  }
  if (!isValidBdPhone(withdrawNumber)) {
    return res.status(400).json({ error: "\u09B8\u09A0\u09BF\u0995 \u09E7\u09E7 \u09A1\u09BF\u099C\u09BF\u099F\u09C7\u09B0 \u09AC\u09BE\u0982\u09B2\u09BE\u09A6\u09C7\u09B6\u09BF \u09AE\u09CB\u09AC\u09BE\u0987\u09B2 \u09A8\u09AE\u09CD\u09AC\u09B0 \u09AA\u09CD\u09B0\u09A6\u09BE\u09A8 \u0995\u09B0\u09C1\u09A8\u0964" });
  }
  const normalizedWithdrawNumber = normalizeBdPhone(withdrawNumber);
  const store2 = getStore();
  const user = store2.users.find((u) => u.id === tokenUser.id);
  if (!user) return res.status(404).json({ error: "\u0987\u0989\u099C\u09BE\u09B0 \u09AA\u09BE\u0993\u09AF\u09BC\u09BE \u09AF\u09BE\u09AF\u09BC\u09A8\u09BF\u0964" });
  if (user.withdrawSetupDone) {
    return res.status(400).json({ error: "\u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u09B8\u09C7\u099F\u0986\u09AA \u09B8\u09CD\u09A5\u09BE\u09AF\u09BC\u09C0\u09AD\u09BE\u09AC\u09C7 \u09B2\u0995 \u0995\u09B0\u09BE \u098F\u09AC\u0982 \u098F\u099F\u09BF \u09B6\u09C1\u09A7\u09C1 \u098F\u0995\u09AC\u09BE\u09B0\u0987 \u09AA\u09B0\u09BF\u09AC\u09B0\u09CD\u09A4\u09A8\u09AF\u09CB\u0997\u09CD\u09AF\u0964" });
  }
  const duplicateNumberUser = store2.users.find(
    (u) => u.id !== user.id && u.withdrawNumber === normalizedWithdrawNumber
  );
  if (duplicateNumberUser) {
    return res.status(400).json({
      error: "\u098F\u0987 \u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u09A8\u09AE\u09CD\u09AC\u09B0\u099F\u09BF \u0987\u09A4\u09BF\u09AE\u09A7\u09CD\u09AF\u09C7 \u0985\u09A8\u09CD\u09AF \u098F\u0995\u099F\u09BF \u0985\u09CD\u09AF\u09BE\u0995\u09BE\u0989\u09A8\u09CD\u099F\u09C7 \u09AC\u09CD\u09AF\u09AC\u09B9\u09BE\u09B0 \u0995\u09B0\u09BE \u09B9\u09AF\u09BC\u09C7\u099B\u09C7\u0964 \u09AA\u09CD\u09B0\u09A4\u09BF\u099F\u09BF \u0985\u09CD\u09AF\u09BE\u0995\u09BE\u0989\u09A8\u09CD\u099F\u09C7\u09B0 \u099C\u09A8\u09CD\u09AF \u09AD\u09BF\u09A8\u09CD\u09A8 \u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u09A8\u09AE\u09CD\u09AC\u09B0 \u0986\u09AC\u09B6\u09CD\u09AF\u0995\u0964"
    });
  }
  const salt = bcrypt2.genSaltSync(10);
  user.withdrawMethod = paymentMethod;
  user.withdrawNumber = normalizedWithdrawNumber;
  user.withdrawPasswordHash = bcrypt2.hashSync(withdrawPassword, salt);
  user.withdrawSetupDone = true;
  saveStore();
  return res.json({
    success: true,
    message: "Withdraw account setup completed and permanently locked.",
    withdrawMethod: user.withdrawMethod,
    withdrawNumber: user.withdrawNumber
  });
});
router.get("/tasks/today", authenticateUser, (req, res) => {
  const tokenUser = req.user;
  const store2 = getStore();
  const user = store2.users.find((u) => u.id === tokenUser.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const todayStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const dayOfWeek = (/* @__PURE__ */ new Date()).getDay();
  const isSundayOff = store2.settings.sundayIsOffDay && dayOfWeek === 0;
  const activeHoliday = store2.holidays.find((h) => h.date === todayStr && h.tasksDisabled);
  if (isSundayOff || activeHoliday) {
    return res.json({
      tasksDisabled: true,
      reason: activeHoliday ? `Official Holiday: ${activeHoliday.name}. ${activeHoliday.reason}` : "Sunday Maintenance Day: Daily task servers are resting today.",
      tasks: [],
      completedCount: 0,
      totalAllowed: 0,
      todayEarned: 0
    });
  }
  if (user.isTrial) {
    if (user.trialExpired || user.trialDaysUsed >= 4) {
      return res.json({
        tasksDisabled: true,
        reason: "Your 4-day free trial has expired. Purchase Bronze, Golden, or Diamond package to continue earning.",
        tasks: [],
        completedCount: 0,
        totalAllowed: 0,
        todayEarned: user.trialTotalEarned,
        isTrialExpired: true
      });
    }
  }
  const pkg = store2.packages.find((p) => p.id === (user.activePackageId || "pkg_trial")) || store2.packages[0];
  const todayTasks = store2.taskHistories.filter(
    (th) => th.userId === user.id && th.completedAt.startsWith(todayStr)
  );
  const completedCount = todayTasks.length;
  const totalAllowed = pkg.videosPerDay;
  const remainingCount = Math.max(0, totalAllowed - completedCount);
  return res.json({
    tasksDisabled: false,
    package: pkg,
    completedCount,
    totalAllowed,
    remainingCount,
    todayEarned: todayTasks.reduce((acc, t) => acc + t.rewardEarned, 0),
    tasks: store2.videoTasks.map((vt) => ({
      ...vt,
      durationSeconds: 10,
      // Strictly locked to 10 seconds!
      rewardAmount: pkg.incomePerVideo
    }))
  });
});
router.post("/tasks/complete", financialRateLimiter, authenticateUser, (req, res) => {
  const tokenUser = req.user;
  const { taskId, watchDurationSeconds } = req.body;
  if (!watchDurationSeconds || watchDurationSeconds < 9.5) {
    return res.status(400).json({ error: "\u09AA\u09C1\u09B0\u09CB \u09E7\u09E6 \u09B8\u09C7\u0995\u09C7\u09A8\u09CD\u09A1 \u09AD\u09BF\u09A1\u09BF\u0993\u099F\u09BF \u09A6\u09C7\u0996\u09BE \u0986\u09AC\u09B6\u09CD\u09AF\u0995\u0964" });
  }
  if (activeTaskLocks.has(tokenUser.id)) {
    return res.status(429).json({ error: "\u098F\u0995\u099F\u09BF \u099F\u09BE\u09B8\u09CD\u0995 \u09AC\u09B0\u09CD\u09A4\u09AE\u09BE\u09A8\u09C7 \u09AA\u09CD\u09B0\u0995\u09CD\u09B0\u09BF\u09AF\u09BC\u09BE\u09A7\u09C0\u09A8 \u09B0\u09AF\u09BC\u09C7\u099B\u09C7\u0964 \u0985\u09A8\u09C1\u0997\u09CD\u09B0\u09B9 \u0995\u09B0\u09C7 \u0985\u09AA\u09C7\u0995\u09CD\u09B7\u09BE \u0995\u09B0\u09C1\u09A8\u0964" });
  }
  activeTaskLocks.add(tokenUser.id);
  try {
    const store2 = getStore();
    const user = store2.users.find((u) => u.id === tokenUser.id);
    const wallet = store2.wallets.find((w) => w.userId === tokenUser.id);
    if (!user || !wallet) {
      activeTaskLocks.delete(tokenUser.id);
      return res.status(404).json({ error: "\u0987\u0989\u099C\u09BE\u09B0 \u09AC\u09BE \u0993\u09AF\u09BC\u09BE\u09B2\u09C7\u099F \u09AA\u09BE\u0993\u09AF\u09BC\u09BE \u09AF\u09BE\u09AF\u09BC\u09A8\u09BF\u0964" });
    }
    const todayStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const pkg = store2.packages.find((p) => p.id === (user.activePackageId || "pkg_trial")) || store2.packages[0];
    const todayTasks = store2.taskHistories.filter(
      (th) => th.userId === user.id && th.completedAt.startsWith(todayStr)
    );
    if (todayTasks.length >= pkg.videosPerDay) {
      activeTaskLocks.delete(tokenUser.id);
      return res.status(400).json({ error: `\u0986\u099C\u0995\u09C7\u09B0 \u09A6\u09C8\u09A8\u09BF\u0995 \u09AD\u09BF\u09A1\u09BF\u0993 \u099F\u09BE\u09B8\u09CD\u0995\u09C7\u09B0 \u09B8\u09C0\u09AE\u09BE \u09AA\u09C2\u09B0\u09CD\u09A3 \u09B9\u09AF\u09BC\u09C7\u099B\u09C7 (${pkg.name} \u09AA\u09CD\u09AF\u09BE\u0995\u09C7\u099C\u09C7 \u09AA\u09CD\u09B0\u09A4\u09BF\u09A6\u09BF\u09A8 ${pkg.videosPerDay}\u099F\u09BF \u09AD\u09BF\u09A1\u09BF\u0993)\u0964` });
    }
    const reward = pkg.incomePerVideo;
    if (user.isTrial) {
      if (user.trialTotalEarned + reward > 100) {
        activeTaskLocks.delete(tokenUser.id);
        return res.status(400).json({ error: "\u09AB\u09CD\u09B0\u09BF \u099F\u09CD\u09B0\u09BE\u09AF\u09BC\u09BE\u09B2\u09C7\u09B0 \u09B8\u09B0\u09CD\u09AC\u09CB\u099A\u09CD\u099A \u0989\u09AA\u09BE\u09B0\u09CD\u099C\u09A8\u09C7\u09B0 \u09B8\u09C0\u09AE\u09BE (\u09E7\u09E6\u09E6 \u099F\u09BE\u0995\u09BE) \u09AA\u09C2\u09B0\u09CD\u09A3 \u09B9\u09AF\u09BC\u09C7\u099B\u09C7\u0964" });
      }
      user.trialTotalEarned += reward;
      if (todayTasks.length === 0) {
        user.trialDaysUsed += 1;
      }
    }
    wallet.balance += reward;
    wallet.totalEarned += reward;
    wallet.todayIncome += reward;
    wallet.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    const historyItem = {
      id: `th_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: user.id,
      taskId: taskId || "task_vid_1",
      packageId: pkg.id,
      rewardEarned: reward,
      completedAt: (/* @__PURE__ */ new Date()).toISOString(),
      ipAddress: req.headers["x-forwarded-for"] || req.socket.remoteAddress || "103.205.71.1"
    };
    store2.taskHistories.push(historyItem);
    store2.transactions.push({
      id: `tx_${Date.now()}`,
      userId: user.id,
      type: "task_reward",
      amount: reward,
      description: `10s Video Task Reward (${pkg.name})`,
      balanceAfter: wallet.balance,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      referenceId: historyItem.id
    });
    if (!user.isTrial && user.referredBy) {
      const uplineA = store2.users.find((u) => u.referralCode === user.referredBy);
      if (uplineA && !uplineA.isTrial) {
        const commA = reward * store2.settings.levelAPercentage / 100;
        const walletA = store2.wallets.find((w) => w.userId === uplineA.id);
        if (walletA) {
          walletA.balance += commA;
          walletA.referralIncome += commA;
          walletA.totalEarned += commA;
          walletA.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
          store2.referralCommissions.push({
            id: `refcomm_${Date.now()}`,
            fromUserId: user.id,
            fromUserPhone: user.phone,
            toUserId: uplineA.id,
            level: "A",
            type: "video_commission",
            percentage: store2.settings.levelAPercentage,
            commissionAmount: commA,
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          });
          emitWalletUpdated(uplineA.id, walletA);
          emitReferralCommission(uplineA.id, {
            amount: commA,
            from: user.phone,
            level: "A",
            type: "Video Commission"
          });
        }
        if (uplineA.referredBy) {
          const uplineB = store2.users.find((u) => u.referralCode === uplineA.referredBy);
          if (uplineB && !uplineB.isTrial) {
            const commB = reward * store2.settings.levelBPercentage / 100;
            const walletB = store2.wallets.find((w) => w.userId === uplineB.id);
            if (walletB) {
              walletB.balance += commB;
              walletB.referralIncome += commB;
              walletB.totalEarned += commB;
              walletB.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
              emitWalletUpdated(uplineB.id, walletB);
            }
          }
        }
      }
    }
    saveStore();
    emitWalletUpdated(user.id, wallet);
    emitTaskCompleted(user.id, {
      reward,
      newBalance: wallet.balance,
      completedToday: todayTasks.length + 1,
      totalAllowed: pkg.videosPerDay
    });
    return res.json({
      success: true,
      rewardEarned: reward,
      newBalance: wallet.balance,
      completedToday: todayTasks.length + 1,
      remainingCount: Math.max(0, pkg.videosPerDay - (todayTasks.length + 1))
    });
  } finally {
    activeTaskLocks.delete(tokenUser.id);
  }
});
router.get("/wallet/overview", authenticateUser, (req, res) => {
  const tokenUser = req.user;
  const store2 = getStore();
  const wallet = store2.wallets.find((w) => w.userId === tokenUser.id);
  const user = store2.users.find((u) => u.id === tokenUser.id);
  if (!wallet || !user) return res.status(404).json({ error: "Wallet not found" });
  const activePackage = store2.packages.find((p) => p.id === user.activePackageId);
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
      withdrawNumber: user.withdrawNumber
    },
    activePackage,
    settings: {
      withdrawOpeningHour: store2.settings.withdrawOpeningHour,
      withdrawClosingHour: store2.settings.withdrawClosingHour,
      withdrawGloballyEnabled: store2.settings.withdrawGloballyEnabled
    }
  });
});
router.get("/wallet/passbook", authenticateUser, (req, res) => {
  const tokenUser = req.user;
  const store2 = getStore();
  const transactions = store2.transactions.filter((t) => t.userId === tokenUser.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return res.json({ transactions });
});
router.get("/wallet/payment-numbers", authenticateUser, (req, res) => {
  const store2 = getStore();
  const activeNumbers = store2.paymentNumbers.filter((pn) => pn.isActive);
  return res.json({ paymentNumbers: activeNumbers });
});
router.post("/wallet/deposit", financialRateLimiter, authenticateUser, (req, res) => {
  const tokenUser = req.user;
  const { amount, paymentMethod, assignedNumber, senderNumber, transactionId, screenshotUrl } = req.body;
  if (!isValidPositiveAmount(amount, 100, 25e3)) {
    return res.status(400).json({ error: "\u09A1\u09BF\u09AA\u09CB\u099C\u09BF\u099F \u09AA\u09B0\u09BF\u09AE\u09BE\u09A3 \u09E7\u09E6\u09E6 \u099F\u09BE\u0995\u09BE \u09A5\u09C7\u0995\u09C7 \u09E8\u09EB,\u09E6\u09E6\u09E6 \u099F\u09BE\u0995\u09BE\u09B0 \u09AE\u09A7\u09CD\u09AF\u09C7 \u09B9\u09A4\u09C7 \u09B9\u09AC\u09C7\u0964" });
  }
  const depositAmount = Number(amount);
  if (!paymentMethod || paymentMethod !== "bKash" && paymentMethod !== "Nagad") {
    return res.status(400).json({ error: "\u09AA\u09C7\u09AE\u09C7\u09A8\u09CD\u099F \u09AE\u09C7\u09A5\u09A1 \u09B9\u09BF\u09B8\u09C7\u09AC\u09C7 \u09AC\u09BF\u0995\u09BE\u09B6 (bKash) \u0985\u09A5\u09AC\u09BE \u09A8\u0997\u09A6 (Nagad) \u09A8\u09BF\u09B0\u09CD\u09AC\u09BE\u099A\u09A8 \u0995\u09B0\u09BE \u0986\u09AC\u09B6\u09CD\u09AF\u0995\u0964" });
  }
  if (!senderNumber || !isValidBdPhone(senderNumber)) {
    return res.status(400).json({ error: "\u09B8\u09A0\u09BF\u0995 \u09AA\u09CD\u09B0\u09C7\u09B0\u0995 (Sender) \u09E7\u09E7 \u09A1\u09BF\u099C\u09BF\u099F\u09C7\u09B0 \u09AE\u09CB\u09AC\u09BE\u0987\u09B2 \u09A8\u09AE\u09CD\u09AC\u09B0 \u09AA\u09CD\u09B0\u09A6\u09BE\u09A8 \u0995\u09B0\u09C1\u09A8\u0964" });
  }
  if (!transactionId || transactionId.trim().length < 6) {
    return res.status(400).json({ error: "\u09B8\u09A0\u09BF\u0995 \u099F\u09CD\u09B0\u09BE\u09A8\u099C\u09C7\u0995\u09B6\u09A8 \u0986\u0987\u09A1\u09BF (TrxID) \u09AA\u09CD\u09B0\u09A6\u09BE\u09A8 \u0995\u09B0\u09C1\u09A8 (\u0995\u09AE\u09AA\u0995\u09CD\u09B7\u09C7 \u09EC \u0985\u0995\u09CD\u09B7\u09B0)\u0964" });
  }
  const store2 = getStore();
  const user = store2.users.find((u) => u.id === tokenUser.id);
  if (!user) return res.status(404).json({ error: "\u0987\u0989\u099C\u09BE\u09B0 \u09AA\u09BE\u0993\u09AF\u09BC\u09BE \u09AF\u09BE\u09AF\u09BC\u09A8\u09BF\u0964" });
  const normalizedTrx = transactionId.trim().toUpperCase();
  const normalizedSender = normalizeBdPhone(senderNumber);
  const duplicateTrx = store2.deposits.find(
    (d) => d.transactionId.toUpperCase() === normalizedTrx
  );
  if (duplicateTrx || !isTrxUnique(normalizedTrx, paymentMethod)) {
    logFraud({
      type: "duplicate_trx",
      severity: "high",
      trxId: normalizedTrx,
      userId: user.id,
      userPhone: user.phone,
      senderNumber: normalizedSender,
      details: `Duplicate TrxID submitted: ${normalizedTrx}. Already registered on the platform.`
    });
    return res.status(400).json({ error: "\u098F\u0987 \u099F\u09CD\u09B0\u09BE\u09A8\u099C\u09C7\u0995\u09B6\u09A8 \u0986\u0987\u09A1\u09BF (TrxID) \u0987\u09A4\u09BF\u09AA\u09C2\u09B0\u09CD\u09AC\u09C7 \u09AA\u09CD\u09B2\u09CD\u09AF\u09BE\u099F\u09AB\u09B0\u09CD\u09AE\u09C7 \u099C\u09AE\u09BE \u09AC\u09BE \u0995\u09CD\u09B0\u09C7\u09A1\u09BF\u099F \u0995\u09B0\u09BE \u09B9\u09AF\u09BC\u09C7\u099B\u09C7\u0964" });
  }
  const tenMinutesAgo = Date.now() - 10 * 60 * 1e3;
  const duplicatePending = store2.deposits.find(
    (d) => d.status === "pending" && d.amount === depositAmount && normalizeBdPhone(d.senderNumber) === normalizedSender && new Date(d.createdAt).getTime() > tenMinutesAgo
  );
  if (duplicatePending) {
    logFraud({
      type: "duplicate_deposit_spam",
      severity: "medium",
      trxId: normalizedTrx,
      userId: user.id,
      userPhone: user.phone,
      senderNumber: normalizedSender,
      details: `Duplicate pending deposit rejected: same amount (\u09F3${depositAmount}) and sender (${normalizedSender}) within 10 minutes.`
    });
    return res.status(400).json({
      error: "\u098F\u0995\u0987 \u09AA\u09B0\u09BF\u09AE\u09BE\u09A3 \u0993 \u098F\u0995\u0987 \u09AA\u09CD\u09B0\u09C7\u09B0\u0995 \u09A8\u09AE\u09CD\u09AC\u09B0\u09C7\u09B0 \u098F\u0995\u099F\u09BF \u09A1\u09BF\u09AA\u09CB\u099C\u09BF\u099F \u09B0\u09BF\u0995\u09CB\u09AF\u09BC\u09C7\u09B8\u09CD\u099F \u09AA\u09CD\u09B0\u0995\u09CD\u09B0\u09BF\u09AF\u09BC\u09BE\u09A7\u09C0\u09A8 \u09B0\u09AF\u09BC\u09C7\u099B\u09C7\u0964 \u0985\u09A8\u09C1\u0997\u09CD\u09B0\u09B9 \u0995\u09B0\u09C7 \u09AD\u09C7\u09B0\u09BF\u09AB\u09BF\u0995\u09C7\u09B6\u09A8 \u09B8\u09AE\u09CD\u09AA\u09A8\u09CD\u09A8 \u09B9\u0993\u09AF\u09BC\u09BE \u09AA\u09B0\u09CD\u09AF\u09A8\u09CD\u09A4 \u0985\u09AA\u09C7\u0995\u09CD\u09B7\u09BE \u0995\u09B0\u09C1\u09A8\u0964"
    });
  }
  const depositReq = {
    id: `dep_${Date.now()}`,
    userId: user.id,
    userPhone: user.phone,
    amount: depositAmount,
    paymentMethod,
    assignedNumber: assignedNumber || (paymentMethod === "bKash" ? "01712345678" : "01823456789"),
    senderNumber: normalizeBdPhone(senderNumber),
    transactionId: transactionId.trim().toUpperCase(),
    screenshotUrl: screenshotUrl || "",
    status: "pending",
    verificationType: "auto",
    // Default is auto-verification as mandated
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const pn = store2.paymentNumbers.find((p) => p.number === depositReq.assignedNumber);
  if (pn) {
    pn.usageCount += 1;
    pn.currentDailyVolume += depositAmount;
  }
  store2.deposits.push(depositReq);
  saveStore();
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";
  const outcome = attemptAutoVerification(depositReq, clientIp);
  if (outcome.autoVerified) {
    return res.json({
      success: true,
      autoVerified: true,
      status: "approved",
      message: outcome.message,
      deposit: depositReq
    });
  }
  emitDepositStatusChanged(user.id, depositReq);
  emitAdminDashboardUpdated();
  return res.json({
    success: true,
    autoVerified: false,
    status: depositReq.status,
    message: outcome.message || "Deposit submitted. Waiting for incoming SMS from payment gateway.",
    deposit: depositReq
  });
});
router.get("/wallet/deposit-history", authenticateUser, (req, res) => {
  const tokenUser = req.user;
  const store2 = getStore();
  const history = store2.deposits.filter((d) => d.userId === tokenUser.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return res.json({ deposits: history });
});
router.get("/wallet/withdraw-history", authenticateUser, (req, res) => {
  const tokenUser = req.user;
  const store2 = getStore();
  const history = store2.withdraws.filter((w) => w.userId === tokenUser.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return res.json({ withdraws: history });
});
router.get("/withdraw-cards", (req, res) => {
  const store2 = getStore();
  const cards = (store2.withdrawCards || []).filter((c) => c.enabled).sort((a, b) => a.order - b.order || a.amount - b.amount);
  return res.json({ withdrawCards: cards });
});
router.post("/wallet/withdraw", financialRateLimiter, authenticateUser, (req, res) => {
  const tokenUser = req.user;
  const { amount, withdrawPassword, deviceFingerprint } = req.body;
  if (!isValidPositiveAmount(amount, 100, 5e4)) {
    return res.status(400).json({ error: "\u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u09AA\u09B0\u09BF\u09AE\u09BE\u09A3 \u09B8\u09A0\u09BF\u0995 \u0993 \u09A7\u09A8\u09BE\u09A4\u09CD\u09AE\u0995 \u09B8\u0982\u0996\u09CD\u09AF\u09BE \u09B9\u09A4\u09C7 \u09B9\u09AC\u09C7\u0964" });
  }
  const withdrawAmount = Number(amount);
  if (activeWithdrawLocks.has(tokenUser.id)) {
    return res.status(429).json({ error: "\u098F\u0995\u099F\u09BF \u0989\u0987\u09A5\u09A1\u09CD\u09B0\u09B2 \u09B0\u09BF\u0995\u09CB\u09AF\u09BC\u09C7\u09B8\u09CD\u099F \u09AC\u09B0\u09CD\u09A4\u09AE\u09BE\u09A8\u09C7 \u09AA\u09CD\u09B0\u0995\u09CD\u09B0\u09BF\u09AF\u09BC\u09BE\u09A7\u09C0\u09A8 \u09B0\u09AF\u09BC\u09C7\u099B\u09C7\u0964 \u0985\u09A8\u09C1\u0997\u09CD\u09B0\u09B9 \u0995\u09B0\u09C7 \u0985\u09AA\u09C7\u0995\u09CD\u09B7\u09BE \u0995\u09B0\u09C1\u09A8\u0964" });
  }
  activeWithdrawLocks.add(tokenUser.id);
  try {
    const store2 = getStore();
    const user = store2.users.find((u) => u.id === tokenUser.id);
    const wallet = store2.wallets.find((w) => w.userId === tokenUser.id);
    if (!user || !wallet) {
      activeWithdrawLocks.delete(tokenUser.id);
      return res.status(404).json({ error: "\u0987\u0989\u099C\u09BE\u09B0 \u09AC\u09BE \u0993\u09AF\u09BC\u09BE\u09B2\u09C7\u099F \u09AA\u09BE\u0993\u09AF\u09BC\u09BE \u09AF\u09BE\u09AF\u09BC\u09A8\u09BF\u0964" });
    }
    if (!user.withdrawSetupDone || !user.withdrawPasswordHash || !user.withdrawNumber || !user.withdrawMethod) {
      activeWithdrawLocks.delete(tokenUser.id);
      return res.status(400).json({ error: "\u09AA\u09CD\u09B0\u09A5\u09AE\u09C7 \u0986\u09AA\u09A8\u09BE\u09B0 \u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u09AE\u09C7\u09A5\u09A1 \u098F\u09AC\u0982 \u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u09AA\u09BE\u09B8\u0993\u09AF\u09BC\u09BE\u09B0\u09CD\u09A1 \u09B8\u09C7\u099F\u0986\u09AA \u09B8\u09AE\u09CD\u09AA\u09A8\u09CD\u09A8 \u0995\u09B0\u09C1\u09A8\u0964" });
    }
    if (!store2.settings.withdrawGloballyEnabled) {
      activeWithdrawLocks.delete(tokenUser.id);
      return res.status(400).json({ error: "\u09B8\u09BF\u09B8\u09CD\u099F\u09C7\u09AE \u09B0\u0995\u09CD\u09B7\u09A3\u09BE\u09AC\u09C7\u0995\u09CD\u09B7\u09A3\u09C7\u09B0 \u099C\u09A8\u09CD\u09AF \u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u09B8\u09BE\u09AE\u09AF\u09BC\u09BF\u0995\u09AD\u09BE\u09AC\u09C7 \u09AC\u09A8\u09CD\u09A7 \u0986\u099B\u09C7\u0964" });
    }
    const currentHour = (/* @__PURE__ */ new Date()).getHours();
    if (currentHour < store2.settings.withdrawOpeningHour || currentHour >= store2.settings.withdrawClosingHour) {
      activeWithdrawLocks.delete(tokenUser.id);
      return res.status(400).json({
        error: `\u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u09B8\u09C7\u09AC\u09BE \u09AA\u09CD\u09B0\u09A4\u09BF\u09A6\u09BF\u09A8 \u09B8\u0995\u09BE\u09B2 ${store2.settings.withdrawOpeningHour}:00 \u09A5\u09C7\u0995\u09C7 \u09B8\u09A8\u09CD\u09A7\u09CD\u09AF\u09BE ${store2.settings.withdrawClosingHour}:00 \u09AA\u09B0\u09CD\u09AF\u09A8\u09CD\u09A4 \u099A\u09BE\u09B2\u09C1 \u09A5\u09BE\u0995\u09C7\u0964`
      });
    }
    if (!withdrawPassword || !bcrypt2.compareSync(withdrawPassword, user.withdrawPasswordHash)) {
      activeWithdrawLocks.delete(tokenUser.id);
      return res.status(400).json({ error: "\u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u09AA\u09BE\u09B8\u0993\u09AF\u09BC\u09BE\u09B0\u09CD\u09A1 \u09B8\u09A0\u09BF\u0995 \u09A8\u09AF\u09BC\u0964" });
    }
    const todayStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const userTodayWithdraws = store2.withdraws.filter(
      (w) => w.userId === user.id && w.createdAt.startsWith(todayStr) && w.status !== "rejected"
    );
    if (userTodayWithdraws.length >= 1) {
      activeWithdrawLocks.delete(tokenUser.id);
      return res.status(400).json({ error: "\u09AA\u09CD\u09B0\u09A4\u09BF \u0995\u09CD\u09AF\u09BE\u09B2\u09C7\u09A8\u09CD\u09A1\u09BE\u09B0 \u09A6\u09BF\u09A8\u09C7 \u09B8\u09B0\u09CD\u09AC\u09CB\u099A\u09CD\u099A \u09E7\u099F\u09BF \u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u09B0\u09BF\u0995\u09CB\u09AF\u09BC\u09C7\u09B8\u09CD\u099F \u0985\u09A8\u09C1\u09AE\u09CB\u09A6\u09BF\u09A4\u0964" });
    }
    const isFreeUser = Boolean(user.isTrial || !user.activePackageId || user.activePackageId === "pkg_trial");
    const isFreeWithdrawPermitted = Boolean(store2.settings.allowFreeUserWithdrawal || user.freeWithdrawAllowed);
    if (isFreeUser && !isFreeWithdrawPermitted) {
      activeWithdrawLocks.delete(tokenUser.id);
      return res.status(403).json({
        error: "\u0986\u09AA\u09A8\u09BE\u09B0 \u09A8\u09BF\u09AF\u09BC\u09CB\u0997 \u09AC\u09CD\u09AF\u09AC\u09B8\u09CD\u09A5\u09BE\u09AA\u0995\u09C7\u09B0 \u09B8\u0999\u09CD\u0997\u09C7 \u09AF\u09CB\u0997\u09BE\u09AF\u09CB\u0997 \u0995\u09B0\u09C1\u09A8",
        freeWithdrawBlocked: true,
        contactSupport: true,
        contactReferral: true,
        referredBy: user.referredBy || null
      });
    }
    const activeCards = (store2.withdrawCards || []).filter((c) => c.enabled);
    const matchedCard = activeCards.find((c) => c.amount === withdrawAmount);
    if (!matchedCard) {
      activeWithdrawLocks.delete(tokenUser.id);
      const availableAmounts = activeCards.map((c) => `\u09F3${c.amount}`).join(", ");
      return res.status(400).json({
        error: `\u0985\u09A8\u09C1\u0997\u09CD\u09B0\u09B9 \u0995\u09B0\u09C7 \u0985\u09A8\u09C1\u09AE\u09CB\u09A6\u09BF\u09A4 \u09B8\u0995\u09CD\u09B0\u09BF\u09DF \u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u0995\u09BE\u09B0\u09CD\u09A1 \u09A8\u09BF\u09B0\u09CD\u09AC\u09BE\u099A\u09A8 \u0995\u09B0\u09C1\u09A8\u0964 \u09B8\u0995\u09CD\u09B0\u09BF\u09DF \u0995\u09BE\u09B0\u09CD\u09A1\u09B8\u09AE\u09C2\u09B9: ${availableAmounts || "\u0995\u09CB\u09A8\u09CB \u0995\u09BE\u09B0\u09CD\u09A1 \u09B8\u0995\u09CD\u09B0\u09BF\u09DF \u09A8\u09C7\u0987"}\u0964`
      });
    }
    let isTrialWithdraw = false;
    if (isFreeUser) {
      if (matchedCard.isTrialAllowed || withdrawAmount === 100) {
        isTrialWithdraw = true;
        const fp = deviceFingerprint || user.deviceFingerprint;
        const dfRecord = store2.deviceFingerprints.find((d) => d.deviceFingerprint === fp);
        if (dfRecord && dfRecord.trialWithdrawalCompleted) {
          activeWithdrawLocks.delete(tokenUser.id);
          return res.status(400).json({
            error: "\u09A1\u09BF\u09AD\u09BE\u0987\u09B8 \u09B8\u09C1\u09B0\u0995\u09CD\u09B7\u09BE \u09B8\u09A4\u09B0\u09CD\u0995\u09A4\u09BE: \u098F\u0987 \u09A1\u09BF\u09AD\u09BE\u0987\u09B8 \u09A5\u09C7\u0995\u09C7 \u0987\u09A4\u09BF\u09AE\u09A7\u09CD\u09AF\u09C7 \u09E7\u099F\u09BF \u09AB\u09CD\u09B0\u09BF \u099F\u09CD\u09B0\u09BE\u09AF\u09BC\u09BE\u09B2 \u0989\u0987\u09A5\u09A1\u09CD\u09B0\u09B2 \u09B8\u09AE\u09CD\u09AA\u09A8\u09CD\u09A8 \u09B9\u09AF\u09BC\u09C7\u099B\u09C7\u0964"
          });
        }
      }
    }
    if (wallet.balance < withdrawAmount) {
      activeWithdrawLocks.delete(tokenUser.id);
      return res.status(400).json({ error: `\u0986\u09AA\u09A8\u09BE\u09B0 \u0993\u09AF\u09BC\u09BE\u09B2\u09C7\u099F\u09C7 \u09AA\u09B0\u09CD\u09AF\u09BE\u09AA\u09CD\u09A4 \u09AC\u09CD\u09AF\u09BE\u09B2\u09C7\u09A8\u09CD\u09B8 \u09A8\u09C7\u0987\u0964 \u09AC\u09B0\u09CD\u09A4\u09AE\u09BE\u09A8 \u09AC\u09CD\u09AF\u09BE\u09B2\u09C7\u09A8\u09CD\u09B8: ${wallet.balance.toFixed(2)} \u099F\u09BE\u0995\u09BE\u0964` });
    }
    const fee = withdrawAmount * 10 / 100;
    const netAmount = withdrawAmount - fee;
    wallet.balance -= withdrawAmount;
    wallet.totalWithdraw += withdrawAmount;
    wallet.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    const withdrawReq = {
      id: `wdr_${Date.now()}`,
      userId: user.id,
      userPhone: user.phone,
      amount: withdrawAmount,
      fee,
      netAmount,
      paymentMethod: user.withdrawMethod,
      withdrawNumber: user.withdrawNumber,
      status: "pending",
      isTrialWithdraw,
      deviceFingerprint: deviceFingerprint || user.deviceFingerprint,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      timeline: [
        {
          step: "pending",
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          note: `Withdrawal request of ${withdrawAmount} TK submitted to ${user.withdrawMethod} ${user.withdrawNumber}`
        }
      ]
    };
    store2.withdraws.push(withdrawReq);
    if (isTrialWithdraw) {
      const fp = deviceFingerprint || user.deviceFingerprint;
      let dfRecord = store2.deviceFingerprints.find((d) => d.deviceFingerprint === fp);
      if (dfRecord) {
        dfRecord.trialWithdrawalCompleted = true;
        dfRecord.trialWithdrawalDate = (/* @__PURE__ */ new Date()).toISOString();
        dfRecord.trialWithdrawalAmount = 100;
      }
    }
    store2.transactions.push({
      id: `tx_${Date.now()}`,
      userId: user.id,
      type: "withdraw",
      amount: -withdrawAmount,
      fee,
      description: `Withdraw Request to ${user.withdrawMethod} (${netAmount} TK after 10% fee)`,
      balanceAfter: wallet.balance,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      referenceId: withdrawReq.id
    });
    saveStore();
    emitWalletUpdated(user.id, wallet);
    emitWithdrawStatusChanged(user.id, withdrawReq);
    emitAdminDashboardUpdated();
    return res.json({
      success: true,
      message: "Withdrawal request submitted successfully.",
      withdraw: withdrawReq,
      newBalance: wallet.balance
    });
  } finally {
    activeWithdrawLocks.delete(tokenUser.id);
  }
});
router.get("/packages", (req, res) => {
  const store2 = getStore();
  const activePackages = store2.packages.filter((p) => p.enabled && p.id !== "pkg_trial");
  return res.json({ packages: activePackages });
});
router.post("/packages/purchase", authenticateUser, (req, res) => {
  const tokenUser = req.user;
  const { packageId } = req.body;
  const store2 = getStore();
  const user = store2.users.find((u) => u.id === tokenUser.id);
  const wallet = store2.wallets.find((w) => w.userId === tokenUser.id);
  const pkg = store2.packages.find((p) => p.id === packageId && p.enabled);
  if (!user || !wallet) return res.status(404).json({ error: "\u0987\u0989\u099C\u09BE\u09B0 \u09AC\u09BE \u0993\u09AF\u09BC\u09BE\u09B2\u09C7\u099F \u09AA\u09BE\u0993\u09AF\u09BC\u09BE \u09AF\u09BE\u09AF\u09BC\u09A8\u09BF\u0964" });
  if (!pkg) return res.status(404).json({ error: "\u09A8\u09BF\u09B0\u09CD\u09AC\u09BE\u099A\u09BF\u09A4 \u09AA\u09CD\u09AF\u09BE\u0995\u09C7\u099C\u099F\u09BF \u09AC\u09B0\u09CD\u09A4\u09AE\u09BE\u09A8\u09C7 \u0989\u09AA\u09B2\u09AC\u09CD\u09A7 \u09A8\u09C7\u0987\u0964" });
  if (pkg.price <= 0) {
    return res.status(400).json({ error: "\u09AD\u09C1\u09B2 \u09AA\u09CD\u09AF\u09BE\u0995\u09C7\u099C \u09A8\u09BF\u09B0\u09CD\u09AC\u09BE\u099A\u09A8\u0964" });
  }
  if (wallet.balance < pkg.price) {
    return res.status(400).json({
      error: `\u09AA\u09CD\u09AF\u09BE\u0995\u09C7\u099C \u0995\u09C7\u09A8\u09BE\u09B0 \u099C\u09A8\u09CD\u09AF \u09AA\u09B0\u09CD\u09AF\u09BE\u09AA\u09CD\u09A4 \u0993\u09AF\u09BC\u09BE\u09B2\u09C7\u099F \u09AC\u09CD\u09AF\u09BE\u09B2\u09C7\u09A8\u09CD\u09B8 \u09A8\u09C7\u0987\u0964 \u09AA\u09CD\u09AF\u09BE\u0995\u09C7\u099C\u09C7\u09B0 \u09AE\u09C2\u09B2\u09CD\u09AF \u09F3${pkg.price.toLocaleString()} \u099F\u09BE\u0995\u09BE, \u0986\u09AA\u09A8\u09BE\u09B0 \u09AC\u09B0\u09CD\u09A4\u09AE\u09BE\u09A8 \u09AC\u09CD\u09AF\u09BE\u09B2\u09C7\u09A8\u09CD\u09B8 \u09F3${wallet.balance.toLocaleString()} \u099F\u09BE\u0995\u09BE\u0964 \u0985\u09A8\u09C1\u0997\u09CD\u09B0\u09B9 \u0995\u09B0\u09C7 \u09AA\u09CD\u09B0\u09A5\u09AE\u09C7 \u0993\u09AF\u09BC\u09BE\u09B2\u09C7\u099F\u09C7 \u09A1\u09BF\u09AA\u09CB\u099C\u09BF\u099F \u0995\u09B0\u09C1\u09A8\u0964`
    });
  }
  wallet.balance -= pkg.price;
  wallet.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  user.activePackageId = pkg.id;
  user.packageActivatedAt = (/* @__PURE__ */ new Date()).toISOString();
  user.isTrial = false;
  user.trialExpired = true;
  if (pkg.price >= 22500 && user.role === "Member") {
    user.role = "Manager";
  }
  store2.transactions.push({
    id: `tx_${Date.now()}`,
    userId: user.id,
    type: "package_purchase",
    amount: -pkg.price,
    description: `Purchased ${pkg.name} Package (${pkg.dailyIncome} TK daily / ${pkg.videosPerDay} videos)`,
    balanceAfter: wallet.balance,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    referenceId: pkg.id
  });
  if (user.referredBy) {
    const uplineA = store2.users.find((u) => u.referralCode === user.referredBy);
    if (uplineA) {
      const bonusA = pkg.price * store2.settings.levelAPercentage / 100;
      const walletA = store2.wallets.find((w) => w.userId === uplineA.id);
      if (walletA) {
        walletA.balance += bonusA;
        walletA.referralIncome += bonusA;
        walletA.totalEarned += bonusA;
        walletA.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        store2.referralCommissions.push({
          id: `ref_pkg_${Date.now()}`,
          fromUserId: user.id,
          fromUserPhone: user.phone,
          toUserId: uplineA.id,
          level: "A",
          type: "package_bonus",
          percentage: store2.settings.levelAPercentage,
          commissionAmount: bonusA,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        store2.transactions.push({
          id: `tx_${Date.now()}_ref`,
          userId: uplineA.id,
          type: "referral_bonus",
          amount: bonusA,
          description: `Level A Referral Bonus from ${user.phone} (${pkg.name} purchase)`,
          balanceAfter: walletA.balance,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        emitWalletUpdated(uplineA.id, walletA);
        emitReferralCommission(uplineA.id, {
          amount: bonusA,
          from: user.phone,
          level: "A",
          type: "Package Purchase Bonus"
        });
      }
    }
  }
  store2.notifications.push({
    id: `notif_${Date.now()}`,
    userId: user.id,
    type: "task",
    title: `${pkg.name} Package Activated!`,
    message: `Congratulations! Your ${pkg.name} package is active. You can now watch ${pkg.videosPerDay} videos daily for ${pkg.dailyIncome} TK.`,
    isRead: false,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveStore();
  emitWalletUpdated(user.id, wallet);
  emitNotificationNew(user.id, store2.notifications[store2.notifications.length - 1]);
  emitAdminDashboardUpdated();
  return res.json({
    success: true,
    message: `${pkg.name} package purchased and activated successfully!`,
    activePackage: pkg,
    newBalance: wallet.balance
  });
});
router.get("/referral/summary", authenticateUser, (req, res) => {
  const tokenUser = req.user;
  const store2 = getStore();
  const user = store2.users.find((u) => u.id === tokenUser.id);
  const wallet = store2.wallets.find((w) => w.userId === tokenUser.id);
  if (!user || !wallet) return res.status(404).json({ error: "User not found" });
  const levelAUsers = store2.users.filter((u) => u.referredBy === user.referralCode);
  const levelACodes = levelAUsers.map((u) => u.referralCode);
  const levelBUsers = store2.users.filter((u) => u.referredBy && levelACodes.includes(u.referredBy));
  const levelBCodes = levelBUsers.map((u) => u.referralCode);
  const levelCUsers = store2.users.filter((u) => u.referredBy && levelBCodes.includes(u.referredBy));
  const mapMember = (m, level) => {
    const pkg = store2.packages.find((p) => p.id === m.activePackageId);
    const comms = store2.referralCommissions.filter((c) => c.toUserId === user.id && c.fromUserId === m.id).reduce((acc, c) => acc + c.commissionAmount, 0);
    return {
      userId: m.id,
      phone: `${m.phone.slice(0, 4)}***${m.phone.slice(-3)}`,
      role: m.role,
      level,
      joinedAt: m.createdAt,
      activePackageName: pkg ? pkg.name : m.isTrial ? "Free Trial" : "None",
      commissionEarnedForUpline: comms
    };
  };
  const commissions = store2.referralCommissions.filter((c) => c.toUserId === user.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const paidTeamMembersCount = [...levelAUsers, ...levelBUsers, ...levelCUsers].filter((u) => !u.isTrial).length;
  let salaryTarget = 10;
  let salaryRole = "Manager (5,000 TK/mo)";
  if (paidTeamMembersCount >= 25) {
    salaryTarget = 50;
    salaryRole = "VIP (25,000 TK/mo)";
  } else if (paidTeamMembersCount >= 10) {
    salaryTarget = 25;
    salaryRole = "Senior Manager (12,000 TK/mo)";
  }
  return res.json({
    referralCode: user.referralCode,
    totalReferralEarnings: wallet.referralIncome,
    teamCounts: {
      total: levelAUsers.length + levelBUsers.length + levelCUsers.length,
      levelA: levelAUsers.length,
      levelB: levelBUsers.length,
      levelC: levelCUsers.length,
      paidCount: paidTeamMembersCount
    },
    percentages: {
      levelA: store2.settings.levelAPercentage,
      levelB: store2.settings.levelBPercentage,
      levelC: store2.settings.levelCPercentage
    },
    teamMembers: [
      ...levelAUsers.map((u) => mapMember(u, "A")),
      ...levelBUsers.map((u) => mapMember(u, "B")),
      ...levelCUsers.map((u) => mapMember(u, "C"))
    ],
    commissions: commissions.slice(0, 20),
    salaryProgress: {
      currentCount: paidTeamMembersCount,
      targetCount: salaryTarget,
      percentage: Math.min(100, Math.round(paidTeamMembersCount / salaryTarget * 100)),
      nextRole: salaryRole
    }
  });
});
router.get("/referral/team", authenticateUser, (req, res) => {
  const tokenUser = req.user;
  const store2 = getStore();
  const user = store2.users.find((u) => u.id === tokenUser.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const levelAUsers = store2.users.filter((u) => u.referredBy === user.referralCode);
  const levelACodes = levelAUsers.map((u) => u.referralCode);
  const levelBUsers = store2.users.filter((u) => u.referredBy && levelACodes.includes(u.referredBy));
  const levelBCodes = levelBUsers.map((u) => u.referralCode);
  const levelCUsers = store2.users.filter((u) => u.referredBy && levelBCodes.includes(u.referredBy));
  const formatMember = (m) => {
    const pkg = store2.packages.find((p) => p.id === m.activePackageId);
    return {
      id: m.id,
      phone: m.phone,
      role: m.role,
      hasActivePackage: Boolean(m.activePackageId && !m.isTrial),
      packageName: pkg ? pkg.name : m.isTrial ? "Free Trial" : "None",
      isTrial: Boolean(m.isTrial),
      createdAt: m.createdAt
    };
  };
  return res.json({
    levelA: levelAUsers.map(formatMember),
    levelB: levelBUsers.map(formatMember),
    levelC: levelCUsers.map(formatMember)
  });
});
router.get("/promotions", (req, res) => {
  const store2 = getStore();
  const activeCampaigns = store2.campaigns.filter((c) => c.isActive);
  return res.json({ campaigns: activeCampaigns });
});
router.post("/promotions/claim-code", authenticateUser, (req, res) => {
  const tokenUser = req.user;
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "\u09AA\u09CD\u09B0\u09AE\u09CB \u0995\u09CB\u09A1 \u09AA\u09CD\u09B0\u09A6\u09BE\u09A8 \u0995\u09B0\u09BE \u0986\u09AC\u09B6\u09CD\u09AF\u0995\u0964" });
  const store2 = getStore();
  const user = store2.users.find((u) => u.id === tokenUser.id);
  const wallet = store2.wallets.find((w) => w.userId === tokenUser.id);
  if (!user || !wallet) return res.status(404).json({ error: "\u0987\u0989\u099C\u09BE\u09B0 \u09AC\u09BE \u0993\u09AF\u09BC\u09BE\u09B2\u09C7\u099F \u09AA\u09BE\u0993\u09AF\u09BC\u09BE \u09AF\u09BE\u09AF\u09BC\u09A8\u09BF\u0964" });
  const promo = store2.promoCodes.find(
    (p) => p.code.toUpperCase() === code.trim().toUpperCase() && p.isActive
  );
  if (!promo) {
    return res.status(400).json({ error: "\u09AA\u09CD\u09B0\u09AE\u09CB \u0995\u09CB\u09A1\u099F\u09BF \u09B8\u09A0\u09BF\u0995 \u09A8\u09AF\u09BC \u0985\u09A5\u09AC\u09BE \u098F\u09B0 \u09AE\u09C7\u09AF\u09BC\u09BE\u09A6 \u09B6\u09C7\u09B7 \u09B9\u09AF\u09BC\u09C7 \u0997\u09C7\u099B\u09C7\u0964" });
  }
  if (promo.currentUsage >= promo.maxUsage) {
    return res.status(400).json({ error: "\u098F\u0987 \u09AA\u09CD\u09B0\u09AE\u09CB \u0995\u09CB\u09A1 \u09AC\u09CD\u09AF\u09AC\u09B9\u09BE\u09B0\u09C7\u09B0 \u09B8\u09B0\u09CD\u09AC\u09CB\u099A\u09CD\u099A \u09B8\u09C0\u09AE\u09BE \u09B6\u09C7\u09B7 \u09B9\u09AF\u09BC\u09C7\u099B\u09C7\u0964" });
  }
  const alreadyClaimed = store2.transactions.find(
    (t) => t.userId === user.id && t.type === "promo_code" && t.referenceId === promo.id
  );
  if (alreadyClaimed) {
    return res.status(400).json({ error: "\u0986\u09AA\u09A8\u09BF \u0987\u09A4\u09BF\u09AE\u09A7\u09CD\u09AF\u09C7 \u098F\u0987 \u09AA\u09CD\u09B0\u09AE\u09CB \u0995\u09CB\u09A1\u099F\u09BF \u0997\u09CD\u09B0\u09B9\u09A3 \u0995\u09B0\u09C7\u099B\u09C7\u09A8\u0964" });
  }
  promo.currentUsage += 1;
  wallet.balance += promo.rewardAmount;
  wallet.giftIncome += promo.rewardAmount;
  wallet.totalEarned += promo.rewardAmount;
  wallet.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  store2.transactions.push({
    id: `tx_${Date.now()}`,
    userId: user.id,
    type: "promo_code",
    amount: promo.rewardAmount,
    description: `Promo Code Redeemed: ${promo.code}`,
    balanceAfter: wallet.balance,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    referenceId: promo.id
  });
  store2.notifications.push({
    id: `notif_${Date.now()}`,
    userId: user.id,
    type: "gift",
    title: "Promo Reward Credited!",
    message: `${promo.rewardAmount} TK added to your wallet from promo code ${promo.code}.`,
    isRead: false,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveStore();
  emitWalletUpdated(user.id, wallet);
  emitNotificationNew(user.id, store2.notifications[store2.notifications.length - 1]);
  return res.json({
    success: true,
    message: `Promo code redeemed! +${promo.rewardAmount} TK credited to your wallet.`,
    rewardAmount: promo.rewardAmount,
    newBalance: wallet.balance
  });
});
router.get("/notifications", authenticateUser, (req, res) => {
  const tokenUser = req.user;
  const store2 = getStore();
  const list = store2.notifications.filter((n) => n.userId === tokenUser.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return res.json({ notifications: list });
});
router.post("/notifications/mark-read", authenticateUser, (req, res) => {
  const tokenUser = req.user;
  const store2 = getStore();
  store2.notifications.filter((n) => n.userId === tokenUser.id).forEach((n) => {
    n.isRead = true;
  });
  saveStore();
  return res.json({ success: true });
});
router.get("/settings/public", (req, res) => {
  const store2 = getStore();
  return res.json({
    settings: store2.settings,
    todayIsHoliday: store2.holidays.some(
      (h) => h.date === (/* @__PURE__ */ new Date()).toISOString().split("T")[0] && h.tasksDisabled
    ),
    onlineUsers: getOnlineUserCount()
  });
});
router.get("/admin/dashboard-stats", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const totalUsers = store2.users.length;
  const activeUsers = store2.users.filter((u) => u.status === "active").length;
  const freeTrialUsers = store2.users.filter((u) => u.isTrial).length;
  const activePaidUsers = store2.users.filter((u) => !u.isTrial && u.activePackageId).length;
  const totalDeposit = store2.deposits.filter((d) => d.status === "approved").reduce((acc, d) => acc + d.amount, 0);
  const totalWithdraw = store2.withdraws.filter((w) => w.status === "paid" || w.status === "approved").reduce((acc, w) => acc + w.amount, 0);
  const withdrawFeeRevenue = store2.withdraws.filter((w) => w.status === "paid" || w.status === "approved").reduce((acc, w) => acc + w.fee, 0);
  const totalReferralBonus = store2.referralCommissions.reduce((acc, r) => acc + r.commissionAmount, 0);
  const todayStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const todayRevenue = store2.deposits.filter((d) => d.status === "approved" && d.createdAt.startsWith(todayStr)).reduce((acc, d) => acc + d.amount, 0);
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
      onlineUsers: getOnlineUserCount()
    },
    pendingDepositsCount: store2.deposits.filter((d) => d.status === "pending").length,
    pendingWithdrawsCount: store2.withdraws.filter((w) => w.status === "pending").length,
    recentDeposits: store2.deposits.slice(-5).reverse(),
    recentWithdraws: store2.withdraws.slice(-5).reverse()
  });
});
router.get("/admin/users", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const { search, role, status } = req.query;
  let filtered = [...store2.users];
  if (search && typeof search === "string") {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter((u) => u.phone.includes(q) || u.referralCode.toLowerCase().includes(q));
  }
  if (role && typeof role === "string" && role !== "all") {
    filtered = filtered.filter((u) => u.role === role);
  }
  if (status && typeof status === "string" && status !== "all") {
    filtered = filtered.filter((u) => u.status === status);
  }
  const enriched = filtered.map((u) => {
    const wallet = store2.wallets.find((w) => w.userId === u.id);
    const pkg = store2.packages.find((p) => p.id === u.activePackageId);
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
      activePackageName: pkg ? pkg.name : u.isTrial ? "Free Trial" : "None",
      balance: wallet ? wallet.balance : 0,
      totalDeposit: wallet ? wallet.totalDeposit : 0,
      totalWithdraw: wallet ? wallet.totalWithdraw : 0,
      deviceFingerprint: u.deviceFingerprint,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt
    };
  });
  return res.json({ users: enriched });
});
router.get("/admin/users/:id", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const user = store2.users.find((u) => u.id === req.params.id || u.phone === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const wallet = store2.wallets.find((w) => w.userId === user.id) || {
    userId: user.id,
    balance: 0,
    pendingBalance: 0,
    totalDeposit: 0,
    totalWithdraw: 0,
    taskIncome: 0,
    referralIncome: 0,
    giftIncome: 0,
    salaryIncome: 0
  };
  const deposits = store2.deposits.filter((d) => d.userId === user.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const withdraws = store2.withdraws.filter((w) => w.userId === user.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const userTransactions = (store2.transactions || []).filter((t) => t.userId === user.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 30);
  const pkg = store2.packages.find((p) => p.id === user.activePackageId);
  const levelAUsers = store2.users.filter((u) => u.referredBy === user.referralCode);
  const levelACodes = levelAUsers.map((u) => u.referralCode);
  const levelBUsers = store2.users.filter((u) => u.referredBy && levelACodes.includes(u.referredBy));
  const levelBCodes = levelBUsers.map((u) => u.referralCode);
  const levelCUsers = store2.users.filter((u) => u.referredBy && levelBCodes.includes(u.referredBy));
  const formatTeamMember = (m, levelTag) => {
    const memberPkg = store2.packages.find((p) => p.id === m.activePackageId);
    const memberWallet = store2.wallets.find((w) => w.userId === m.id);
    return {
      id: m.id,
      phone: m.phone,
      role: m.role || "Member",
      level: levelTag,
      isTrial: m.isTrial,
      packageName: memberPkg ? memberPkg.name : m.isTrial ? "Free Trial" : "No Package",
      balance: memberWallet ? memberWallet.balance : 0,
      totalDeposit: memberWallet ? memberWallet.totalDeposit : 0,
      joinedAt: m.createdAt,
      status: m.isBanned ? "banned" : m.status || "active"
    };
  };
  const levelAList = levelAUsers.map((m) => formatTeamMember(m, "A"));
  const levelBList = levelBUsers.map((m) => formatTeamMember(m, "B"));
  const levelCList = levelCUsers.map((m) => formatTeamMember(m, "C"));
  const totalCommissions = (store2.referralCommissions || []).filter((c) => c.toUserId === user.id).reduce((acc, c) => acc + (c.commissionAmount || 0), 0);
  const approvedDepositsTotal = deposits.filter((d) => d.status === "approved").reduce((sum, d) => sum + d.amount, 0);
  const approvedWithdrawsTotal = withdraws.filter((w) => w.status === "approved" || w.status === "paid").reduce((sum, w) => sum + w.amount, 0);
  const pendingDepositsTotal = deposits.filter((d) => d.status === "pending").reduce((sum, d) => sum + d.amount, 0);
  const pendingWithdrawsTotal = withdraws.filter((w) => w.status === "pending").reduce((sum, w) => sum + w.amount, 0);
  const { passwordHash: _, withdrawPasswordHash: __, ...safeUser } = user;
  return res.json({
    user: {
      ...safeUser,
      activePackageName: pkg ? pkg.name : user.isTrial ? "Free Trial" : "None",
      withdrawSetupDone: Boolean(user.withdrawSetupDone || user.withdrawMethod && user.withdrawNumber),
      hasWithdrawPassword: Boolean(user.withdrawPasswordHash)
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
      totalCommissionEarned: totalCommissions
    },
    withdrawAccount: {
      paymentMethod: user.withdrawMethod || null,
      withdrawNumber: user.withdrawNumber || null,
      isConfigured: Boolean(user.withdrawMethod && user.withdrawNumber),
      isPasswordProtected: Boolean(user.withdrawPasswordHash)
    },
    referralBreakdown: {
      levelA: { count: levelAList.length, members: levelAList },
      levelB: { count: levelBList.length, members: levelBList },
      levelC: { count: levelCList.length, members: levelCList },
      totalTeamCount: levelAList.length + levelBList.length + levelCList.length,
      totalCommissionEarned: totalCommissions
    },
    recentDeposits: deposits.slice(0, 15),
    recentWithdrawals: withdraws.slice(0, 15),
    recentTransactions: userTransactions
  });
});
router.post("/admin/users/:id/action", authenticateAdmin, (req, res) => {
  const adminUser = req.user || req.admin || { id: "admin", name: "Admin" };
  const store2 = getStore();
  const user = store2.users.find((u) => u.id === req.params.id || u.phone === req.params.id);
  const wallet = user ? store2.wallets.find((w) => w.userId === user.id) : null;
  if (!user || !wallet) return res.status(404).json({ error: "User or wallet not found" });
  const { action, amount, reason, role, newPassword, packageId } = req.body;
  if (action === "add_balance") {
    const val = Number(amount);
    if (!val || val <= 0) return res.status(400).json({ error: "Valid positive amount required" });
    wallet.balance += val;
    wallet.giftIncome = (wallet.giftIncome || 0) + val;
    wallet.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    store2.transactions.push({
      id: `tx_${Date.now()}`,
      userId: user.id,
      type: "gift",
      amount: val,
      description: `Admin Credit: ${reason || "Administrative adjustment"}`,
      balanceAfter: wallet.balance,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    store2.notifications.push({
      id: `notif_${Date.now()}`,
      userId: user.id,
      type: "gift",
      title: "Wallet Balance Added by Admin",
      message: `${val} TK has been added to your wallet. Reason: ${reason || "Admin Credit"}.`,
      isRead: false,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    emitWalletUpdated(user.id, wallet);
    emitNotificationNew(user.id, store2.notifications[store2.notifications.length - 1]);
  } else if (action === "deduct_balance") {
    const val = Number(amount);
    if (!val || val <= 0 || wallet.balance < val) {
      return res.status(400).json({ error: "Invalid deduction amount or exceeds user balance" });
    }
    wallet.balance -= val;
    wallet.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    store2.transactions.push({
      id: `tx_${Date.now()}`,
      userId: user.id,
      type: "withdraw",
      amount: -val,
      description: `Admin Deduction: ${reason || "Administrative correction"}`,
      balanceAfter: wallet.balance,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    emitWalletUpdated(user.id, wallet);
  } else if (action === "assign_role") {
    if (!role) return res.status(400).json({ error: "Role is required" });
    user.role = role;
  } else if (action === "toggle_status" || action === "toggle_ban") {
    user.isBanned = !user.isBanned;
    user.status = user.isBanned ? "suspended" : "active";
  } else if (action === "toggle_free_withdraw") {
    user.freeWithdrawAllowed = !user.freeWithdrawAllowed;
  } else if (action === "reset_withdraw_account") {
    user.withdrawMethod = void 0;
    user.withdrawNumber = void 0;
    user.withdrawPasswordHash = void 0;
    user.withdrawSetupDone = false;
  } else if (action === "assign_package") {
    if (!packageId) return res.status(400).json({ error: "Package ID required" });
    const targetPkg = store2.packages.find((p) => p.id === packageId);
    if (!targetPkg) return res.status(404).json({ error: "Package not found" });
    user.activePackageId = targetPkg.id;
    user.isTrial = false;
  } else if (action === "reset_password") {
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    const salt = bcrypt2.genSaltSync(10);
    user.passwordHash = bcrypt2.hashSync(newPassword, salt);
  }
  store2.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name || "Admin",
    action: `User Action: ${action}`,
    target: user.phone,
    details: reason || `Updated user ${user.phone} (${action})`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveStore();
  emitAdminDashboardUpdated();
  return res.json({ success: true, message: `Action ${action} executed successfully`, user, wallet });
});
router.post("/admin/users/:id/toggle-free-withdraw", authenticateAdmin, (req, res) => {
  const adminUser = req.user;
  const store2 = getStore();
  const user = store2.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  user.freeWithdrawAllowed = !user.freeWithdrawAllowed;
  store2.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name || "Admin",
    action: `Toggle Free Withdraw: ${user.freeWithdrawAllowed ? "Allowed" : "Disallowed"}`,
    target: user.phone,
    details: `Toggled free user withdraw permission for ${user.phone} to ${user.freeWithdrawAllowed}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveStore();
  emitAdminDashboardUpdated();
  return res.json({
    success: true,
    message: `User ${user.phone} - Free withdraw permission ${user.freeWithdrawAllowed ? "ENABLED" : "DISABLED"}`,
    freeWithdrawAllowed: user.freeWithdrawAllowed
  });
});
router.post("/admin/users/:id/balance", authenticateAdmin, (req, res) => {
  const adminUser = req.user || req.admin || { id: "admin", name: "Admin" };
  const store2 = getStore();
  const user = store2.users.find((u) => u.id === req.params.id);
  const wallet = store2.wallets.find((w) => w.userId === req.params.id);
  if (!user || !wallet) return res.status(404).json({ error: "User or wallet not found" });
  const { amount, action, reason } = req.body;
  const val = Number(amount);
  if (!val || val <= 0) return res.status(400).json({ error: "Valid positive amount required" });
  const isAdd = action === "add" || action === "add_balance";
  const isDeduct = action === "deduct" || action === "deduct_balance";
  if (!isAdd && !isDeduct) {
    return res.status(400).json({ error: "Action must be add or deduct" });
  }
  const balanceBefore = wallet.balance;
  if (isAdd) {
    wallet.balance += val;
    wallet.giftIncome = (wallet.giftIncome || 0) + val;
    wallet.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    store2.transactions.push({
      id: `tx_${Date.now()}`,
      userId: user.id,
      type: "gift",
      amount: val,
      description: `Admin Credit: ${reason || "Administrative adjustment"}`,
      balanceAfter: wallet.balance,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    store2.notifications.push({
      id: `notif_${Date.now()}`,
      userId: user.id,
      type: "gift",
      title: "Wallet Balance Added by Admin",
      message: `${val} TK has been added to your wallet. Reason: ${reason || "Admin Credit"}.`,
      isRead: false,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  } else {
    if (wallet.balance < val) {
      return res.status(400).json({ error: "Deduction amount exceeds user balance" });
    }
    wallet.balance -= val;
    wallet.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    store2.transactions.push({
      id: `tx_${Date.now()}`,
      userId: user.id,
      type: "withdraw",
      amount: -val,
      description: `Admin Deduction: ${reason || "Administrative correction"}`,
      balanceAfter: wallet.balance,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    store2.notifications.push({
      id: `notif_${Date.now()}`,
      userId: user.id,
      type: "withdraw",
      title: "Wallet Balance Deducted by Admin",
      message: `${val} TK was deducted from your wallet. Reason: ${reason || "Administrative correction"}.`,
      isRead: false,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  store2.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name || "Admin",
    action: isAdd ? "Credit Balance" : "Deduct Balance",
    target: user.phone,
    details: `${isAdd ? "+" : "-"}${val} TK. Reason: ${reason || "None"}. Previous: ${balanceBefore}, New: ${wallet.balance}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveStore();
  emitWalletUpdated(user.id, wallet);
  emitNotificationNew(user.id, store2.notifications[store2.notifications.length - 1]);
  emitAdminDashboardUpdated();
  return res.json({ success: true, wallet, message: `Balance successfully ${isAdd ? "credited" : "deducted"}` });
});
router.post("/admin/users/:id/ban", authenticateAdmin, (req, res) => {
  const adminUser = req.user || req.admin || { id: "admin", name: "Admin" };
  const store2 = getStore();
  const user = store2.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const isBanned = req.body.isBanned !== void 0 ? Boolean(req.body.isBanned) : !user.isBanned;
  user.isBanned = isBanned;
  user.status = isBanned ? "suspended" : "active";
  store2.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name || "Admin",
    action: isBanned ? "Ban User" : "Unban User",
    target: user.phone,
    details: `User ${user.phone} was ${isBanned ? "banned" : "unbanned"} by ${adminUser.name || "Admin"}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveStore();
  emitAdminDashboardUpdated();
  return res.json({
    success: true,
    message: `User ${user.phone} has been ${isBanned ? "banned" : "unbanned"}.`,
    user
  });
});
router.get("/admin/deposits", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const { status } = req.query;
  let list = [...store2.deposits];
  if (status && typeof status === "string" && status !== "all") {
    list = list.filter((d) => d.status === status);
  }
  return res.json({ deposits: list.reverse() });
});
router.get("/admin/deposits/pending", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const list = store2.deposits.filter((d) => d.status === "pending");
  return res.json({ deposits: list.reverse() });
});
function handleDepositReview(req, res, targetStatus) {
  const adminUser = req.user || req.admin || { id: "admin", name: "Admin" };
  const store2 = getStore();
  const deposit = store2.deposits.find((d) => d.id === req.params.id);
  if (!deposit) return res.status(404).json({ error: "Deposit request not found" });
  const status = targetStatus || req.body.status;
  const rejectedReason = req.body.reason || req.body.rejectedReason;
  if (status !== "approved" && status !== "rejected") {
    return res.status(400).json({ error: "Status must be approved or rejected" });
  }
  deposit.status = status;
  deposit.reviewedAt = (/* @__PURE__ */ new Date()).toISOString();
  deposit.reviewedBy = adminUser.name || "Admin";
  const user = store2.users.find((u) => u.id === deposit.userId);
  const wallet = store2.wallets.find((w) => w.userId === deposit.userId);
  if (status === "approved" && wallet) {
    const balanceBefore = wallet.balance;
    wallet.balance += deposit.amount;
    wallet.totalDeposit += deposit.amount;
    wallet.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    const balanceAfter = wallet.balance;
    recordWalletLedgerEntry({
      userId: deposit.userId,
      transactionType: "Deposit Verification",
      amount: deposit.amount,
      balanceBefore,
      balanceAfter,
      reason: "Deposit Verification (Manual Review Approved)",
      referenceId: deposit.id,
      createdBy: adminUser.name || "Finance Admin",
      status: "completed"
    });
    recordFinancialAuditLog({
      adminId: adminUser.id || "admin",
      userId: deposit.userId,
      action: "DEPOSIT_MANUAL_APPROVED",
      oldBalance: balanceBefore,
      newBalance: balanceAfter,
      reference: `Deposit:${deposit.id}|TrxID:${deposit.transactionId}`,
      ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1"
    });
    store2.transactions.push({
      id: `tx_${Date.now()}`,
      userId: deposit.userId,
      type: "deposit",
      amount: deposit.amount,
      description: `${deposit.paymentMethod} Deposit Approved (TrxID: ${deposit.transactionId})`,
      balanceAfter: wallet.balance,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      referenceId: deposit.id
    });
    store2.notifications.push({
      id: `notif_${Date.now()}`,
      userId: deposit.userId,
      type: "deposit",
      title: "Deposit Approved!",
      message: `Your ${deposit.paymentMethod} deposit of ${deposit.amount} TK has been approved and added to your wallet balance.`,
      isRead: false,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    emitWalletUpdated(deposit.userId, wallet);
    emitNotificationNew(deposit.userId, store2.notifications[store2.notifications.length - 1]);
  } else if (status === "rejected") {
    deposit.rejectedReason = rejectedReason || "Transaction could not be verified";
    store2.notifications.push({
      id: `notif_${Date.now()}`,
      userId: deposit.userId,
      type: "deposit",
      title: "Deposit Rejected",
      message: `Your deposit of ${deposit.amount} TK was rejected. Reason: ${deposit.rejectedReason}`,
      isRead: false,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    emitNotificationNew(deposit.userId, store2.notifications[store2.notifications.length - 1]);
  }
  store2.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name || "Admin",
    action: `Deposit Review: ${status}`,
    target: deposit.transactionId,
    details: `${status} ${deposit.amount} TK for ${deposit.userPhone}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveStore();
  emitDepositStatusChanged(deposit.userId, deposit);
  emitAdminDashboardUpdated();
  return res.json({ success: true, deposit });
}
router.post("/admin/deposits/:id/review", authenticateAdmin, (req, res) => {
  return handleDepositReview(req, res);
});
router.post("/admin/deposits/:id/approve", authenticateAdmin, (req, res) => {
  return handleDepositReview(req, res, "approved");
});
router.post("/admin/deposits/:id/reject", authenticateAdmin, (req, res) => {
  return handleDepositReview(req, res, "rejected");
});
router.get("/admin/withdraws", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const { status } = req.query;
  let list = [...store2.withdraws];
  if (status && typeof status === "string" && status !== "all") {
    list = list.filter((w) => w.status === status);
  }
  return res.json({ withdraws: list.reverse() });
});
router.get("/admin/withdraws/pending", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const list = store2.withdraws.filter((w) => w.status === "pending");
  return res.json({ withdraws: list.reverse() });
});
function handleWithdrawAction(req, res, targetStatus) {
  const adminUser = req.user || req.admin || { id: "admin", name: "Admin" };
  const store2 = getStore();
  const withdraw = store2.withdraws.find((w) => w.id === req.params.id);
  if (!withdraw) return res.status(404).json({ error: "Withdraw request not found" });
  const status = targetStatus || req.body.status;
  const rejectedReason = req.body.reason || req.body.rejectedReason;
  const note = req.body.payoutTrxId ? `Paid by admin. TrxID: ${req.body.payoutTrxId}` : req.body.note || `Status updated to ${status} by ${adminUser.name || "Admin"}`;
  if (!["approved", "paid", "rejected"].includes(status)) {
    return res.status(400).json({ error: "Status must be approved, paid, or rejected" });
  }
  withdraw.status = status;
  withdraw.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  withdraw.timeline.push({
    step: status,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    note
  });
  if (status === "rejected") {
    withdraw.rejectedReason = rejectedReason || "Withdrawal rejected by finance administration";
    const wallet = store2.wallets.find((w) => w.userId === withdraw.userId);
    if (wallet) {
      wallet.balance += withdraw.amount;
      wallet.totalWithdraw -= withdraw.amount;
      wallet.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      store2.transactions.push({
        id: `tx_${Date.now()}`,
        userId: withdraw.userId,
        type: "gift",
        amount: withdraw.amount,
        description: `Refund for Rejected Withdraw #${withdraw.id}`,
        balanceAfter: wallet.balance,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      emitWalletUpdated(withdraw.userId, wallet);
    }
    store2.notifications.push({
      id: `notif_${Date.now()}`,
      userId: withdraw.userId,
      type: "withdraw",
      title: "Withdrawal Request Rejected",
      message: `Your withdrawal of ${withdraw.amount} TK was rejected. Amount has been refunded. Reason: ${withdraw.rejectedReason}`,
      isRead: false,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    emitNotificationNew(withdraw.userId, store2.notifications[store2.notifications.length - 1]);
  } else if (status === "paid") {
    store2.notifications.push({
      id: `notif_${Date.now()}`,
      userId: withdraw.userId,
      type: "withdraw",
      title: "Withdrawal Completed & Paid!",
      message: `Your ${withdraw.netAmount} TK has been sent via ${withdraw.paymentMethod} to ${withdraw.withdrawNumber}. ${note ? `(${note})` : ""}`,
      isRead: false,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    emitNotificationNew(withdraw.userId, store2.notifications[store2.notifications.length - 1]);
  }
  store2.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name || "Admin",
    action: `Withdraw Action: ${status}`,
    target: withdraw.withdrawNumber,
    details: `${status} ${withdraw.amount} TK to ${withdraw.userPhone}. Note: ${note}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveStore();
  emitWithdrawStatusChanged(withdraw.userId, withdraw);
  emitAdminDashboardUpdated();
  return res.json({ success: true, withdraw });
}
router.post("/admin/withdraws/:id/action", authenticateAdmin, (req, res) => {
  return handleWithdrawAction(req, res);
});
router.post("/admin/withdraws/:id/approve", authenticateAdmin, (req, res) => {
  return handleWithdrawAction(req, res, "approved");
});
router.post("/admin/withdraws/:id/pay", authenticateAdmin, (req, res) => {
  return handleWithdrawAction(req, res, "paid");
});
router.post("/admin/withdraws/:id/reject", authenticateAdmin, (req, res) => {
  return handleWithdrawAction(req, res, "rejected");
});
router.get("/admin/withdraw-cards", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const cards = [...store2.withdrawCards || []].sort((a, b) => a.order - b.order || a.amount - b.amount);
  return res.json({ withdrawCards: cards });
});
router.post("/admin/withdraw-cards", authenticateAdmin, (req, res) => {
  const adminUser = req.user;
  const store2 = getStore();
  const { amount, label, badge, badgeColor, minRole, isTrialAllowed, enabled, order, description } = req.body;
  const cardAmount = Number(amount);
  if (!cardAmount || cardAmount <= 0) {
    return res.status(400).json({ error: "\u09B8\u09A0\u09BF\u0995 \u09AA\u099C\u09BF\u099F\u09BF\u09AD \u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u09AA\u09B0\u09BF\u09AE\u09BE\u09A3 (TK) \u09AA\u09CD\u09B0\u09A6\u09BE\u09A8 \u0995\u09B0\u09C1\u09A8\u0964" });
  }
  const existing = store2.withdrawCards?.find((c) => c.amount === cardAmount);
  if (existing) {
    return res.status(400).json({ error: `\u09F3${cardAmount} \u099F\u09BE\u0995\u09BE\u09B0 \u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u0995\u09BE\u09B0\u09CD\u09A1 \u0987\u09A4\u09BF\u09AA\u09C2\u09B0\u09CD\u09AC\u09C7 \u09A4\u09C8\u09B0\u09BF \u0995\u09B0\u09BE \u09B0\u09DF\u09C7\u099B\u09C7 (ID: ${existing.id})\u0964` });
  }
  const newCard = {
    id: `wcard_${Date.now()}`,
    amount: cardAmount,
    label: label || `\u09F3${cardAmount} \u09AA\u09C7\u0986\u0989\u099F \u0995\u09BE\u09B0\u09CD\u09A1`,
    badge: badge || (cardAmount >= 1e4 ? "VIP ONLY" : cardAmount >= 5e3 ? "POPULAR" : "INSTANT"),
    badgeColor: badgeColor || (cardAmount >= 1e4 ? "amber" : cardAmount >= 5e3 ? "purple" : "emerald"),
    minRole: minRole || "Member",
    isTrialAllowed: isTrialAllowed !== void 0 ? Boolean(isTrialAllowed) : cardAmount === 100,
    enabled: enabled !== void 0 ? Boolean(enabled) : true,
    order: Number(order) || (store2.withdrawCards ? store2.withdrawCards.length + 1 : 1),
    description: description || `\u09AC\u09CD\u09AF\u09AC\u09B9\u09BE\u09B0\u0995\u09BE\u09B0\u09C0\u09A6\u09C7\u09B0 \u099C\u09A8\u09CD\u09AF \u09F3${cardAmount} \u099F\u09BE\u0995\u09BE \u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u0995\u09BE\u09B0\u09CD\u09A1`,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (!store2.withdrawCards) {
    store2.withdrawCards = [];
  }
  store2.withdrawCards.push(newCard);
  store2.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name || "Admin",
    action: "Create Withdraw Card",
    target: `\u09F3${cardAmount}`,
    details: `Created new withdraw card of \u09F3${cardAmount} (Label: ${newCard.label})`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveStore();
  emitAdminDashboardUpdated();
  return res.json({ success: true, message: `\u09F3${cardAmount} \u099F\u09BE\u0995\u09BE\u09B0 \u09A8\u09A4\u09C1\u09A8 \u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u0995\u09BE\u09B0\u09CD\u09A1 \u09B8\u09AB\u09B2\u09AD\u09BE\u09AC\u09C7 \u09A4\u09C8\u09B0\u09BF \u09B9\u09DF\u09C7\u099B\u09C7\u0964`, withdrawCard: newCard });
});
router.put("/admin/withdraw-cards/:id", authenticateAdmin, (req, res) => {
  const adminUser = req.user;
  const store2 = getStore();
  const card = store2.withdrawCards?.find((c) => c.id === req.params.id);
  if (!card) return res.status(404).json({ error: "\u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u0995\u09BE\u09B0\u09CD\u09A1 \u09AA\u09BE\u0993\u09DF\u09BE \u09AF\u09BE\u09DF\u09A8\u09BF\u0964" });
  const { amount, label, badge, badgeColor, minRole, isTrialAllowed, enabled, order, description } = req.body;
  if (amount !== void 0) {
    const newAmt = Number(amount);
    if (!newAmt || newAmt <= 0) {
      return res.status(400).json({ error: "\u09B8\u09A0\u09BF\u0995 \u09AA\u099C\u09BF\u099F\u09BF\u09AD \u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u09AA\u09B0\u09BF\u09AE\u09BE\u09A3 (TK) \u09AA\u09CD\u09B0\u09A6\u09BE\u09A8 \u0995\u09B0\u09C1\u09A8\u0964" });
    }
    const duplicate = store2.withdrawCards?.find((c) => c.amount === newAmt && c.id !== card.id);
    if (duplicate) {
      return res.status(400).json({ error: `\u09F3${newAmt} \u099F\u09BE\u0995\u09BE\u09B0 \u0985\u09A8\u09CD\u09AF \u098F\u0995\u099F\u09BF \u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u0995\u09BE\u09B0\u09CD\u09A1 \u09B0\u09DF\u09C7\u099B\u09C7\u0964` });
    }
    card.amount = newAmt;
  }
  if (label !== void 0) card.label = label;
  if (badge !== void 0) card.badge = badge;
  if (badgeColor !== void 0) card.badgeColor = badgeColor;
  if (minRole !== void 0) card.minRole = minRole;
  if (isTrialAllowed !== void 0) card.isTrialAllowed = Boolean(isTrialAllowed);
  if (enabled !== void 0) card.enabled = Boolean(enabled);
  if (order !== void 0) card.order = Number(order);
  if (description !== void 0) card.description = description;
  card.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  store2.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name || "Admin",
    action: "Update Withdraw Card",
    target: `\u09F3${card.amount}`,
    details: `Updated withdraw card #${card.id} (Amount: \u09F3${card.amount}, Label: ${card.label})`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveStore();
  emitAdminDashboardUpdated();
  return res.json({ success: true, message: `\u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u0995\u09BE\u09B0\u09CD\u09A1 \u09B8\u09AB\u09B2\u09AD\u09BE\u09AC\u09C7 \u0986\u09AA\u09A1\u09C7\u099F \u0995\u09B0\u09BE \u09B9\u09DF\u09C7\u099B\u09C7\u0964`, withdrawCard: card });
});
router.delete("/admin/withdraw-cards/:id", authenticateAdmin, (req, res) => {
  const adminUser = req.user;
  const store2 = getStore();
  const index = (store2.withdrawCards || []).findIndex((c) => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "\u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u0995\u09BE\u09B0\u09CD\u09A1 \u09AA\u09BE\u0993\u09DF\u09BE \u09AF\u09BE\u09DF\u09A8\u09BF\u0964" });
  const deleted = store2.withdrawCards[index];
  store2.withdrawCards.splice(index, 1);
  store2.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name || "Admin",
    action: "Delete Withdraw Card",
    target: `\u09F3${deleted.amount}`,
    details: `Deleted withdraw card #${deleted.id} of \u09F3${deleted.amount}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveStore();
  emitAdminDashboardUpdated();
  return res.json({ success: true, message: `\u09F3${deleted.amount} \u099F\u09BE\u0995\u09BE\u09B0 \u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u0995\u09BE\u09B0\u09CD\u09A1 \u09A1\u09BF\u09B2\u09BF\u099F \u0995\u09B0\u09BE \u09B9\u09DF\u09C7\u099B\u09C7\u0964` });
});
router.post("/admin/withdraw-cards/:id/toggle", authenticateAdmin, (req, res) => {
  const adminUser = req.user;
  const store2 = getStore();
  const card = store2.withdrawCards?.find((c) => c.id === req.params.id);
  if (!card) return res.status(404).json({ error: "\u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u0995\u09BE\u09B0\u09CD\u09A1 \u09AA\u09BE\u0993\u09DF\u09BE \u09AF\u09BE\u09DF\u09A8\u09BF\u0964" });
  card.enabled = !card.enabled;
  card.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  store2.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name || "Admin",
    action: `Toggle Withdraw Card: ${card.enabled ? "Enabled" : "Disabled"}`,
    target: `\u09F3${card.amount}`,
    details: `Toggled withdraw card #${card.id} to ${card.enabled ? "Active" : "Inactive"}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveStore();
  emitAdminDashboardUpdated();
  return res.json({ success: true, message: `\u0989\u0987\u09A5\u09A1\u09CD\u09B0 \u0995\u09BE\u09B0\u09CD\u09A1\u099F\u09BF ${card.enabled ? "\u09B8\u0995\u09CD\u09B0\u09BF\u09DF (Active)" : "\u09A8\u09BF\u09B7\u09CD\u0995\u09CD\u09B0\u09BF\u09DF (Inactive)"} \u0995\u09B0\u09BE \u09B9\u09DF\u09C7\u099B\u09C7\u0964`, withdrawCard: card });
});
router.get("/admin/packages", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  return res.json({ packages: store2.packages });
});
router.post("/admin/packages", authenticateAdmin, (req, res) => {
  const { name, price, dailyIncome, videosPerDay, validityDays, badgeColor, enabled, isPopular } = req.body;
  if (!name || price === void 0 || dailyIncome === void 0 || !videosPerDay) {
    return res.status(400).json({ error: "Package name, price, daily income, and daily videos count are required" });
  }
  const store2 = getStore();
  const vpd = Math.max(1, Number(videosPerDay));
  const income = Number(dailyIncome);
  const newPkg = {
    id: `pkg_${Date.now()}`,
    name: name.trim(),
    price: Number(price),
    dailyIncome: income,
    videosPerDay: vpd,
    incomePerVideo: Math.round(income / vpd * 100) / 100,
    validityDays: Number(validityDays) || 365,
    badgeColor: badgeColor || "emerald",
    enabled: enabled !== void 0 ? Boolean(enabled) : true,
    isPopular: Boolean(isPopular)
  };
  store2.packages.push(newPkg);
  saveStore();
  return res.json({ success: true, package: newPkg });
});
router.post("/admin/packages/:id", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const pkg = store2.packages.find((p) => p.id === req.params.id);
  if (!pkg) return res.status(404).json({ error: "Package not found" });
  const { name, price, dailyIncome, videosPerDay, validityDays, badgeColor, enabled, isPopular } = req.body;
  if (name !== void 0) pkg.name = name.trim();
  if (price !== void 0) pkg.price = Number(price);
  if (dailyIncome !== void 0) pkg.dailyIncome = Number(dailyIncome);
  if (videosPerDay !== void 0) {
    pkg.videosPerDay = Math.max(1, Number(videosPerDay));
  }
  if (pkg.dailyIncome && pkg.videosPerDay) {
    pkg.incomePerVideo = Math.round(pkg.dailyIncome / pkg.videosPerDay * 100) / 100;
  }
  if (validityDays !== void 0) pkg.validityDays = Number(validityDays);
  if (badgeColor !== void 0) pkg.badgeColor = badgeColor;
  if (enabled !== void 0) pkg.enabled = Boolean(enabled);
  if (isPopular !== void 0) pkg.isPopular = Boolean(isPopular);
  saveStore();
  return res.json({ success: true, package: pkg });
});
router.post("/admin/packages/:id/update", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const pkg = store2.packages.find((p) => p.id === req.params.id);
  if (!pkg) return res.status(404).json({ error: "Package not found" });
  const { name, price, dailyIncome, videosPerDay, validityDays, badgeColor, enabled, isPopular } = req.body;
  if (name !== void 0) pkg.name = name.trim();
  if (price !== void 0) pkg.price = Number(price);
  if (dailyIncome !== void 0) pkg.dailyIncome = Number(dailyIncome);
  if (videosPerDay !== void 0) {
    pkg.videosPerDay = Math.max(1, Number(videosPerDay));
  }
  if (pkg.dailyIncome && pkg.videosPerDay) {
    pkg.incomePerVideo = Math.round(pkg.dailyIncome / pkg.videosPerDay * 100) / 100;
  }
  if (validityDays !== void 0) pkg.validityDays = Number(validityDays);
  if (badgeColor !== void 0) pkg.badgeColor = badgeColor;
  if (enabled !== void 0) pkg.enabled = Boolean(enabled);
  if (isPopular !== void 0) pkg.isPopular = Boolean(isPopular);
  saveStore();
  return res.json({ success: true, package: pkg });
});
router.post("/admin/packages/:id/toggle", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const pkg = store2.packages.find((p) => p.id === req.params.id);
  if (!pkg) return res.status(404).json({ error: "Package not found" });
  pkg.enabled = !pkg.enabled;
  saveStore();
  return res.json({ success: true, package: pkg });
});
router.delete("/admin/packages/:id", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const idx = store2.packages.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Package not found" });
  if (store2.packages[idx].id === "pkg_trial") {
    return res.status(400).json({ error: "Cannot delete default Free Trial package" });
  }
  store2.packages.splice(idx, 1);
  saveStore();
  return res.json({ success: true, message: "Package deleted successfully" });
});
router.post("/admin/settings/referrals", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const { levelA, levelB, levelC } = req.body;
  if (levelA !== void 0) store2.settings.levelAPercentage = Number(levelA);
  if (levelB !== void 0) store2.settings.levelBPercentage = Number(levelB);
  if (levelC !== void 0) store2.settings.levelCPercentage = Number(levelC);
  saveStore();
  return res.json({ success: true, settings: store2.settings });
});
router.post("/admin/campaigns", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const { title, description, bannerUrl, type, startDate, endDate, isActive } = req.body;
  const campaign = {
    id: `camp_${Date.now()}`,
    title,
    description,
    bannerUrl: bannerUrl || "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1200&auto=format&fit=crop&q=80",
    type: type || "banner",
    startDate: startDate || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
    endDate: endDate || new Date(Date.now() + 30 * 864e5).toISOString().split("T")[0],
    isActive: isActive !== void 0 ? isActive : true
  };
  store2.campaigns.push(campaign);
  saveStore();
  emitCampaignUpdated(campaign);
  return res.json({ success: true, campaign });
});
router.get("/admin/campaigns", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  return res.json({ campaigns: store2.campaigns });
});
router.post("/admin/campaigns", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const { title, image, description, startDate, endDate, isActive } = req.body;
  if (!title) {
    return res.status(400).json({ error: "Campaign title is required" });
  }
  const campaign = {
    id: `camp_${Date.now()}`,
    title,
    image: image || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600",
    bannerUrl: image || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600",
    description: description || "",
    type: "banner",
    startDate: startDate || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
    endDate: endDate || new Date(Date.now() + 30 * 864e5).toISOString().split("T")[0],
    isActive: isActive !== void 0 ? isActive : true
  };
  store2.campaigns.push(campaign);
  saveStore();
  emitCampaignUpdated(campaign);
  return res.json({ success: true, campaign });
});
router.get("/admin/promocodes", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  return res.json({ promoCodes: store2.promoCodes });
});
router.post("/admin/promocodes", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const { code, rewardAmount, maxUsage, expiresAt } = req.body;
  if (!code || !rewardAmount) {
    return res.status(400).json({ error: "Code and reward amount are required" });
  }
  const promoCode = {
    id: `promo_${Date.now()}`,
    code: code.trim().toUpperCase(),
    rewardAmount: Number(rewardAmount),
    maxUsage: Number(maxUsage) || 500,
    currentUsage: 0,
    expiresAt: expiresAt || new Date(Date.now() + 30 * 864e5).toISOString().split("T")[0],
    isActive: true,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  store2.promoCodes.push(promoCode);
  saveStore();
  return res.json({ success: true, promoCode });
});
router.get("/admin/holidays", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  return res.json({ holidays: store2.holidays });
});
router.post("/admin/gift-balance", authenticateAdmin, (req, res) => {
  const adminUser = req.user;
  const { phone, amount, reason } = req.body;
  if (!phone || !amount || !reason) {
    return res.status(400).json({ error: "Target phone, amount, and reason are strictly required" });
  }
  const normalizedPhone = normalizeBdPhone(phone);
  const store2 = getStore();
  const user = store2.users.find((u) => u.phone === normalizedPhone);
  const wallet = store2.wallets.find((w) => w.userId === (user ? user.id : ""));
  if (!user || !wallet) {
    return res.status(404).json({ error: "User with this phone number was not found" });
  }
  const giftVal = Number(amount);
  wallet.balance += giftVal;
  wallet.giftIncome += giftVal;
  wallet.totalEarned += giftVal;
  wallet.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  store2.transactions.push({
    id: `tx_${Date.now()}`,
    userId: user.id,
    type: "gift",
    amount: giftVal,
    description: `Official Gift Balance: ${reason}`,
    balanceAfter: wallet.balance,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  store2.notifications.push({
    id: `notif_${Date.now()}`,
    userId: user.id,
    type: "gift",
    title: "Special Gift Balance Received!",
    message: `You received ${giftVal} TK gift balance in your wallet. Reason: ${reason}.`,
    isRead: false,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  store2.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name || "Admin",
    action: "Gift Balance Awarded",
    target: user.phone,
    details: `${giftVal} TK awarded. Reason: ${reason}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveStore();
  emitWalletUpdated(user.id, wallet);
  emitNotificationNew(user.id, store2.notifications[store2.notifications.length - 1]);
  return res.json({ success: true, message: `Gift balance of ${giftVal} TK sent to ${user.phone}`, newBalance: wallet.balance });
});
router.post("/admin/holidays", authenticateAdmin, (req, res) => {
  const { date, name, reason, tasksDisabled } = req.body;
  if (!date || !name || !reason) {
    return res.status(400).json({ error: "Date, name, and reason are required for holidays" });
  }
  const store2 = getStore();
  const holiday = {
    id: `hol_${Date.now()}`,
    date,
    name,
    reason,
    tasksDisabled: tasksDisabled !== void 0 ? Boolean(tasksDisabled) : true
  };
  store2.holidays.push(holiday);
  saveStore();
  emitHolidayUpdated(holiday);
  return res.json({ success: true, holiday });
});
router.get("/admin/payment-numbers", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  return res.json({ paymentNumbers: store2.paymentNumbers });
});
router.post("/admin/payment-numbers", authenticateAdmin, (req, res) => {
  const { method, number, accountType, dailyLimit } = req.body;
  if (!number || !isValidBdPhone(number)) {
    return res.status(400).json({ error: "Valid Bangladesh phone number is required" });
  }
  const store2 = getStore();
  const pn = {
    id: `num_${Date.now()}`,
    method: method || "bKash",
    number: normalizeBdPhone(number),
    accountType: accountType || "Personal",
    isActive: true,
    usageCount: 0,
    dailyLimit: Number(dailyLimit) || 2e5,
    currentDailyVolume: 0
  };
  store2.paymentNumbers.push(pn);
  saveStore();
  return res.json({ success: true, paymentNumber: pn });
});
router.post("/admin/payment-numbers/:id/toggle", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const pn = store2.paymentNumbers.find((p) => p.id === req.params.id);
  if (!pn) return res.status(404).json({ error: "Number not found" });
  pn.isActive = !pn.isActive;
  saveStore();
  return res.json({ success: true, paymentNumber: pn });
});
router.put("/admin/payment-numbers/:id", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const num = store2.paymentNumbers.find((p) => p.id === req.params.id);
  if (!num) return res.status(404).json({ error: "Payment number not found" });
  const { isActive, number, method, type } = req.body;
  if (isActive !== void 0) num.isActive = Boolean(isActive);
  if (number !== void 0 && number.trim()) num.number = normalizeBdPhone(number);
  if (method !== void 0) num.method = method;
  if (type !== void 0) num.accountType = type;
  saveStore();
  emitAdminDashboardUpdated();
  return res.json({ success: true, paymentNumber: num });
});
router.post("/admin/settings", authenticateAdmin, (req, res) => {
  const store2 = getStore();
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
    sundayIsOffDay
  } = req.body;
  if (websiteName !== void 0) store2.settings.websiteName = websiteName;
  if (tagline !== void 0) store2.settings.tagline = tagline;
  if (logoUrl !== void 0) store2.settings.logoUrl = logoUrl;
  if (mobileLogoUrl !== void 0) store2.settings.mobileLogoUrl = mobileLogoUrl;
  if (whatsappNumber !== void 0) store2.settings.whatsappNumber = whatsappNumber;
  if (telegramGroupUrl !== void 0) store2.settings.telegramGroupUrl = telegramGroupUrl;
  if (telegramChannelUrl !== void 0) store2.settings.telegramChannelUrl = telegramChannelUrl;
  if (facebookGroupUrl !== void 0) store2.settings.facebookGroupUrl = facebookGroupUrl;
  if (youtubeTutorialUrl !== void 0) store2.settings.youtubeTutorialUrl = youtubeTutorialUrl;
  if (appDownloadUrl !== void 0) store2.settings.appDownloadUrl = appDownloadUrl;
  if (marqueeNotice !== void 0) store2.settings.marqueeNotice = marqueeNotice;
  if (themePrimaryColor !== void 0) store2.settings.themePrimaryColor = themePrimaryColor;
  if (footerText !== void 0) store2.settings.footerText = footerText;
  if (minDepositAmount !== void 0) store2.settings.minDepositAmount = Number(minDepositAmount);
  if (maxDepositAmount !== void 0) store2.settings.maxDepositAmount = Number(maxDepositAmount);
  if (minWithdrawAmount !== void 0) store2.settings.minWithdrawAmount = Number(minWithdrawAmount);
  if (maxWithdrawAmount !== void 0) store2.settings.maxWithdrawAmount = Number(maxWithdrawAmount);
  if (withdrawFeePercentage !== void 0) store2.settings.withdrawFeePercentage = Number(withdrawFeePercentage);
  if (signupBonusAmount !== void 0) store2.settings.signupBonusAmount = Number(signupBonusAmount);
  const openingH = withdrawOpeningHour !== void 0 ? Number(withdrawOpeningHour) : withdrawStartHour !== void 0 ? Number(withdrawStartHour) : void 0;
  if (openingH !== void 0) {
    store2.settings.withdrawOpeningHour = openingH;
    store2.settings.withdrawStartHour = openingH;
  }
  const closingH = withdrawClosingHour !== void 0 ? Number(withdrawClosingHour) : withdrawEndHour !== void 0 ? Number(withdrawEndHour) : void 0;
  if (closingH !== void 0) {
    store2.settings.withdrawClosingHour = closingH;
    store2.settings.withdrawEndHour = closingH;
  }
  if (withdrawGloballyEnabled !== void 0) store2.settings.withdrawGloballyEnabled = Boolean(withdrawGloballyEnabled);
  if (isWithdrawDisabled !== void 0) {
    store2.settings.isWithdrawDisabled = Boolean(isWithdrawDisabled);
    store2.settings.withdrawGloballyEnabled = !Boolean(isWithdrawDisabled);
  }
  if (allowFreeUserWithdrawal !== void 0) {
    store2.settings.allowFreeUserWithdrawal = Boolean(allowFreeUserWithdrawal);
  }
  if (hybridDepositVerificationEnabled !== void 0) store2.settings.hybridDepositVerificationEnabled = Boolean(hybridDepositVerificationEnabled);
  if (maintenanceMode !== void 0) store2.settings.maintenanceMode = Boolean(maintenanceMode);
  if (levelAPercentage !== void 0) store2.settings.levelAPercentage = Number(levelAPercentage);
  if (levelBPercentage !== void 0) store2.settings.levelBPercentage = Number(levelBPercentage);
  if (levelCPercentage !== void 0) store2.settings.levelCPercentage = Number(levelCPercentage);
  if (dailyTaskResetHour !== void 0) store2.settings.dailyTaskResetHour = Number(dailyTaskResetHour);
  if (sundayIsOffDay !== void 0) store2.settings.sundayIsOffDay = Boolean(sundayIsOffDay);
  saveStore();
  emitBrandingUpdated(store2.settings);
  return res.json({ success: true, settings: store2.settings });
});
router.post("/admin/settings/branding", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const { websiteName, tagline, logoUrl, mobileLogoUrl, whatsappNumber, themePrimaryColor, footerText, withdrawOpeningHour, withdrawClosingHour, withdrawGloballyEnabled, isWithdrawDisabled, allowFreeUserWithdrawal, hybridDepositVerificationEnabled, sundayIsOffDay } = req.body;
  if (websiteName !== void 0) store2.settings.websiteName = websiteName;
  if (tagline !== void 0) store2.settings.tagline = tagline;
  if (logoUrl !== void 0) store2.settings.logoUrl = logoUrl;
  if (mobileLogoUrl !== void 0) store2.settings.mobileLogoUrl = mobileLogoUrl;
  if (whatsappNumber !== void 0) store2.settings.whatsappNumber = whatsappNumber;
  if (themePrimaryColor !== void 0) store2.settings.themePrimaryColor = themePrimaryColor;
  if (footerText !== void 0) store2.settings.footerText = footerText;
  if (withdrawOpeningHour !== void 0) store2.settings.withdrawOpeningHour = Number(withdrawOpeningHour);
  if (withdrawClosingHour !== void 0) store2.settings.withdrawClosingHour = Number(withdrawClosingHour);
  if (withdrawGloballyEnabled !== void 0) store2.settings.withdrawGloballyEnabled = Boolean(withdrawGloballyEnabled);
  if (isWithdrawDisabled !== void 0) store2.settings.isWithdrawDisabled = Boolean(isWithdrawDisabled);
  if (allowFreeUserWithdrawal !== void 0) store2.settings.allowFreeUserWithdrawal = Boolean(allowFreeUserWithdrawal);
  if (hybridDepositVerificationEnabled !== void 0) store2.settings.hybridDepositVerificationEnabled = Boolean(hybridDepositVerificationEnabled);
  if (sundayIsOffDay !== void 0) store2.settings.sundayIsOffDay = Boolean(sundayIsOffDay);
  saveStore();
  emitBrandingUpdated(store2.settings);
  return res.json({ success: true, settings: store2.settings });
});
router.post("/admin/users/:id/toggle-free-withdraw", authenticateAdmin, (req, res) => {
  const adminUser = req.user;
  const store2 = getStore();
  const user = store2.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  user.freeWithdrawAllowed = !user.freeWithdrawAllowed;
  store2.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: adminUser.id,
    adminName: adminUser.name || "Admin",
    action: `Toggle Free Withdraw: ${user.freeWithdrawAllowed ? "Enabled" : "Disabled"}`,
    target: user.phone,
    details: `Free withdrawal permission ${user.freeWithdrawAllowed ? "granted" : "revoked"} for ${user.phone}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  if (user.freeWithdrawAllowed) {
    store2.notifications.push({
      id: `notif_${Date.now()}`,
      userId: user.id,
      type: "withdraw",
      title: "Free Withdrawal Permission Granted!",
      message: "Admin has enabled withdrawal permission for your free account. You can now request your withdrawal.",
      isRead: false,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    emitNotificationNew(user.id, store2.notifications[store2.notifications.length - 1]);
  }
  saveStore();
  emitAdminDashboardUpdated();
  return res.json({
    success: true,
    message: `Free withdrawal permission ${user.freeWithdrawAllowed ? "enabled" : "disabled"} for ${user.phone}`,
    freeWithdrawAllowed: user.freeWithdrawAllowed
  });
});
function configureCloudinary() {
  const store2 = getStore();
  const cloudName = store2.cloudinarySettings?.cloudName || process.env.CLOUDINARY_CLOUD_NAME || store2.settings.cloudinaryCloudName;
  const apiKey = store2.cloudinarySettings?.apiKey || process.env.CLOUDINARY_API_KEY || store2.settings.cloudinaryApiKey;
  const apiSecret = store2.cloudinarySettings?.apiSecret || process.env.CLOUDINARY_API_SECRET || store2.settings.cloudinaryApiSecret;
  if (cloudName && apiKey && apiSecret && apiSecret !== "****************") {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true
    });
    return true;
  }
  return false;
}
router.post("/upload", async (req, res) => {
  try {
    const { image, folder } = req.body;
    if (!image) {
      return res.status(400).json({ error: "Image data is required (base64 string or image URL)." });
    }
    const isCloudinaryReady = configureCloudinary();
    const store2 = getStore();
    if (isCloudinaryReady) {
      try {
        const uploadResult = await cloudinary.uploader.upload(image, {
          folder: folder || "earnhub_bd_uploads",
          resource_type: "auto"
        });
        return res.json({
          success: true,
          url: uploadResult.secure_url,
          publicId: uploadResult.public_id,
          format: uploadResult.format,
          bytes: uploadResult.bytes,
          provider: "cloudinary",
          message: "Image uploaded to Cloudinary successfully!"
        });
      } catch (cloudinaryErr) {
        console.warn("Cloudinary upload attempt failed:", cloudinaryErr?.message || cloudinaryErr);
        if (typeof image === "string" && (image.startsWith("http://") || image.startsWith("https://"))) {
          return res.json({
            success: true,
            url: image,
            provider: "direct_url",
            warning: "Cloudinary upload failed, retained original URL: " + (cloudinaryErr?.message || "")
          });
        }
        return res.json({
          success: true,
          url: image,
          provider: "data_uri_fallback",
          warning: "Stored as data URI because Cloudinary rejected the request: " + (cloudinaryErr?.message || "")
        });
      }
    } else {
      return res.json({
        success: true,
        url: image,
        provider: "local_preview",
        warning: "Cloudinary credentials are not fully configured in Admin Settings. Using direct image data."
      });
    }
  } catch (err) {
    console.error("Upload route error:", err);
    return res.status(500).json({ error: err.message || "Image processing failed" });
  }
});
router.get("/cloudinary/public-config", (req, res) => {
  const store2 = getStore();
  const cloudName = store2.cloudinarySettings?.cloudName || process.env.CLOUDINARY_CLOUD_NAME || store2.settings.cloudinaryCloudName || "";
  const uploadPreset = store2.cloudinarySettings?.uploadPreset || process.env.CLOUDINARY_UPLOAD_PRESET || store2.settings.cloudinaryUploadPreset || "";
  const apiKey = store2.cloudinarySettings?.apiKey || process.env.CLOUDINARY_API_KEY || store2.settings.cloudinaryApiKey || "";
  return res.json({
    cloudName,
    uploadPreset,
    apiKey,
    isConfigured: Boolean(cloudName && apiKey)
  });
});
router.get("/admin/settings/cloudinary", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const cloudName = store2.cloudinarySettings?.cloudName || process.env.CLOUDINARY_CLOUD_NAME || store2.settings.cloudinaryCloudName || "";
  const apiKey = store2.cloudinarySettings?.apiKey || process.env.CLOUDINARY_API_KEY || store2.settings.cloudinaryApiKey || "";
  const hasSecret = Boolean(
    store2.cloudinarySettings?.apiSecret && store2.cloudinarySettings.apiSecret !== "" || process.env.CLOUDINARY_API_SECRET || store2.settings.cloudinaryApiSecret
  );
  const uploadPreset = store2.cloudinarySettings?.uploadPreset || process.env.CLOUDINARY_UPLOAD_PRESET || store2.settings.cloudinaryUploadPreset || "";
  return res.json({
    success: true,
    cloudinarySettings: {
      cloudName,
      apiKey,
      apiSecret: hasSecret ? "****************" : "",
      uploadPreset,
      isConfigured: Boolean(cloudName && apiKey && hasSecret)
    }
  });
});
router.post("/admin/settings/cloudinary", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const admin = req.admin;
  const { cloudName, apiKey, apiSecret, uploadPreset } = req.body;
  if (cloudName !== void 0) {
    store2.cloudinarySettings.cloudName = cloudName.trim();
    store2.settings.cloudinaryCloudName = cloudName.trim();
  }
  if (apiKey !== void 0) {
    store2.cloudinarySettings.apiKey = apiKey.trim();
    store2.settings.cloudinaryApiKey = apiKey.trim();
  }
  if (apiSecret && apiSecret.trim() !== "****************") {
    store2.cloudinarySettings.apiSecret = apiSecret.trim();
    store2.settings.cloudinaryApiSecret = apiSecret.trim();
  }
  if (uploadPreset !== void 0) {
    store2.cloudinarySettings.uploadPreset = uploadPreset.trim();
    store2.settings.cloudinaryUploadPreset = uploadPreset.trim();
  }
  store2.cloudinarySettings.isConfigured = Boolean(
    store2.cloudinarySettings.cloudName && store2.cloudinarySettings.apiKey && store2.cloudinarySettings.apiSecret && store2.cloudinarySettings.apiSecret !== "****************"
  );
  store2.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: admin?.id || "admin",
    adminName: admin?.name || "Chief Admin",
    action: "Configure Cloudinary Cloud Storage",
    target: store2.cloudinarySettings.cloudName || "Cloudinary",
    details: `Updated Cloudinary settings. Cloud Name: ${store2.cloudinarySettings.cloudName}, Preset: ${store2.cloudinarySettings.uploadPreset || "None"}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveStore();
  return res.json({
    success: true,
    message: "Cloudinary configuration saved successfully.",
    cloudinarySettings: {
      cloudName: store2.cloudinarySettings.cloudName,
      apiKey: store2.cloudinarySettings.apiKey,
      apiSecret: store2.cloudinarySettings.apiSecret ? "****************" : "",
      uploadPreset: store2.cloudinarySettings.uploadPreset,
      isConfigured: store2.cloudinarySettings.isConfigured
    }
  });
});
router.post("/admin/cloudinary/test", authenticateAdmin, async (req, res) => {
  try {
    const store2 = getStore();
    const { cloudName, apiKey, apiSecret } = req.body;
    const targetCloudName = (cloudName || store2.cloudinarySettings.cloudName || process.env.CLOUDINARY_CLOUD_NAME || "").trim();
    const targetApiKey = (apiKey || store2.cloudinarySettings.apiKey || process.env.CLOUDINARY_API_KEY || "").trim();
    let targetApiSecret = (apiSecret || "").trim();
    if (!targetApiSecret || targetApiSecret === "****************") {
      targetApiSecret = store2.cloudinarySettings.apiSecret || process.env.CLOUDINARY_API_SECRET || "";
    }
    if (!targetCloudName || !targetApiKey || !targetApiSecret || targetApiSecret === "****************") {
      return res.status(400).json({
        error: "Cloud Name, API Key, and a valid API Secret are required to test the connection."
      });
    }
    cloudinary.config({
      cloud_name: targetCloudName,
      api_key: targetApiKey,
      api_secret: targetApiSecret,
      secure: true
    });
    const ping = await cloudinary.api.ping();
    return res.json({
      success: true,
      message: 'Cloudinary connection verified! Cloud name "' + targetCloudName + '" is active and authorized.',
      status: ping.status || "ok"
    });
  } catch (err) {
    console.error("Cloudinary test error:", err);
    return res.status(400).json({
      error: "Cloudinary connection failed: " + (err.message || "Invalid credentials or network issue")
    });
  }
});
router.get("/admin/fraud-dashboard", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  return res.json({
    deviceRecords: store2.deviceFingerprints,
    trialWithdrawalCount: store2.deviceFingerprints.filter((d) => d.trialWithdrawalCompleted).length,
    multiAccountDevices: store2.deviceFingerprints.filter((d) => d.associatedUserIds.length > 1)
  });
});
router.get(["/admin/logs", "/admin/activity-logs"], authenticateAdmin, (req, res) => {
  const store2 = getStore();
  return res.json({ logs: (store2.activityLogs || []).slice(-100).reverse() });
});
router.get("/admin/search", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const query = (req.query.q || "").trim().toLowerCase();
  if (!query) {
    return res.json({ results: { users: [], deposits: [], withdraws: [], tickets: [], promos: [] } });
  }
  const matchedUsers = store2.users.filter((u) => {
    const phoneMatch = u.phone.toLowerCase().includes(query);
    const refMatch = u.referralCode.toLowerCase().includes(query);
    const idMatch = u.id.toLowerCase().includes(query);
    return phoneMatch || refMatch || idMatch;
  }).slice(0, 15).map((u) => {
    const wallet = store2.wallets.find((w) => w.userId === u.id);
    const pkg = store2.packages.find((p) => p.id === u.activePackageId);
    return {
      id: u.id,
      phone: u.phone,
      name: `User ${u.phone.slice(-4)}`,
      balance: wallet ? wallet.balance : 0,
      activePackageId: pkg ? pkg.name : u.isTrial ? "Free Trial" : "None",
      referralCode: u.referralCode
    };
  });
  const matchedDeposits = store2.deposits.filter((d) => {
    return d.transactionId.toLowerCase().includes(query) || d.userPhone.toLowerCase().includes(query) || d.amount.toString().includes(query);
  }).slice(0, 15);
  const matchedWithdraws = store2.withdraws.filter((w) => {
    return w.withdrawNumber.toLowerCase().includes(query) || w.userPhone.toLowerCase().includes(query) || w.amount.toString().includes(query);
  }).slice(0, 15);
  const matchedTickets = (store2.supportTickets || []).filter((t) => {
    return t.id.toLowerCase().includes(query) || t.subject.toLowerCase().includes(query) || t.userPhone.toLowerCase().includes(query);
  }).slice(0, 15);
  const matchedPromos = (store2.promoCodes || []).filter((p) => p.code.toLowerCase().includes(query)).slice(0, 15);
  return res.json({
    results: {
      users: matchedUsers,
      deposits: matchedDeposits,
      withdraws: matchedWithdraws,
      tickets: matchedTickets,
      promos: matchedPromos
    }
  });
});
function calculateSalaryEligibility(user, tiers, allUsers) {
  const directRefs = allUsers.filter((u) => u.referredBy === user.referralCode);
  const directPaidCount = directRefs.filter((u) => u.activePackageId && !u.isTrial).length;
  const directTotalCount = directRefs.length;
  const levelBRefs = allUsers.filter((u) => directRefs.some((dr) => dr.referralCode === u.referredBy));
  const levelBPaidCount = levelBRefs.filter((u) => u.activePackageId && !u.isTrial).length;
  const levelCRefs = allUsers.filter((u) => levelBRefs.some((lr) => lr.referralCode === u.referredBy));
  const levelCPaidCount = levelCRefs.filter((u) => u.activePackageId && !u.isTrial).length;
  const totalTeamPaidCount = directPaidCount + levelBPaidCount + levelCPaidCount;
  const activeTiers = (tiers || []).filter((t) => t.isActive !== false).sort((a, b) => Number(b.requiredReferrals) - Number(a.requiredReferrals));
  for (const tier of activeTiers) {
    const reqCount = Number(tier.requiredReferrals) || 0;
    let userCount = directPaidCount;
    if (tier.referralType === "total_paid") {
      userCount = totalTeamPaidCount;
    } else if (tier.referralType === "direct_all") {
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
        effectiveCount: userCount
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
    effectiveCount: directPaidCount
  };
}
router.get(["/admin/salary/tiers", "/api/admin/salary/tiers"], authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const tiers = store2.salaryTiers || [];
  const tiersWithStats = tiers.map((tier) => {
    let count = 0;
    store2.users.forEach((user) => {
      const eligibility = calculateSalaryEligibility(user, tiers, store2.users);
      if (eligibility.isEligible && eligibility.tier?.id === tier.id) {
        count++;
      }
    });
    return {
      ...tier,
      eligibleCount: count
    };
  });
  const eligibleUsers = store2.users.map((u) => {
    const eligibility = calculateSalaryEligibility(u, tiers, store2.users);
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
      effectiveCount: eligibility.effectiveCount
    };
  }).filter(Boolean);
  const totalMonthlyLiability = eligibleUsers.reduce((sum, u) => sum + (u.salaryAmount || 0), 0);
  return res.json({
    success: true,
    tiers: tiersWithStats,
    eligibleCount: eligibleUsers.length,
    totalMonthlyLiability,
    eligibleUsers
  });
});
router.post(["/admin/salary/tiers", "/api/admin/salary/tiers"], authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const admin = req.admin || req.user || { id: "admin", name: "Admin" };
  const { roleName, requiredReferrals, referralType, salaryAmount, badgeColor, description, isActive } = req.body;
  if (!roleName || !requiredReferrals || !salaryAmount) {
    return res.status(400).json({ error: "Role name, required referrals, and salary amount are required." });
  }
  if (!store2.salaryTiers) {
    store2.salaryTiers = [];
  }
  const newTier = {
    id: `tier_${Date.now()}`,
    tierNumber: store2.salaryTiers.length + 1,
    roleName: String(roleName).trim(),
    requiredReferrals: Math.max(1, Number(requiredReferrals)),
    referralType: referralType || "direct_paid",
    salaryAmount: Math.max(10, Number(salaryAmount)),
    badgeColor: badgeColor || "amber",
    description: description || `Min ${requiredReferrals} Active Referrals`,
    isActive: isActive !== false
  };
  store2.salaryTiers.push(newTier);
  store2.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: admin.id || "admin",
    adminName: admin.name || "Admin",
    action: "Create Salary Tier",
    target: newTier.roleName,
    details: `Added new salary tier: ${newTier.roleName} requiring ${newTier.requiredReferrals} (${newTier.referralType}) for \u09F3${newTier.salaryAmount}/mo.`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveStore();
  return res.json({ success: true, tier: newTier, tiers: store2.salaryTiers });
});
router.put(["/admin/salary/tiers/:id", "/api/admin/salary/tiers/:id"], authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const admin = req.admin || req.user || { id: "admin", name: "Admin" };
  const tier = (store2.salaryTiers || []).find((t) => t.id === req.params.id);
  if (!tier) {
    return res.status(404).json({ error: "Salary tier not found" });
  }
  const { roleName, requiredReferrals, referralType, salaryAmount, badgeColor, description, isActive } = req.body;
  if (roleName !== void 0) tier.roleName = String(roleName).trim();
  if (requiredReferrals !== void 0) tier.requiredReferrals = Math.max(1, Number(requiredReferrals));
  if (referralType !== void 0) tier.referralType = referralType;
  if (salaryAmount !== void 0) tier.salaryAmount = Math.max(10, Number(salaryAmount));
  if (badgeColor !== void 0) tier.badgeColor = badgeColor;
  if (description !== void 0) tier.description = description;
  if (isActive !== void 0) tier.isActive = Boolean(isActive);
  store2.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: admin.id || "admin",
    adminName: admin.name || "Admin",
    action: "Update Salary Tier",
    target: tier.roleName,
    details: `Updated salary tier: ${tier.roleName} - Req: ${tier.requiredReferrals} (${tier.referralType}), Salary: \u09F3${tier.salaryAmount}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveStore();
  return res.json({ success: true, tier, tiers: store2.salaryTiers });
});
router.delete(["/admin/salary/tiers/:id", "/api/admin/salary/tiers/:id"], authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const admin = req.admin || req.user || { id: "admin", name: "Admin" };
  const index = (store2.salaryTiers || []).findIndex((t) => t.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: "Salary tier not found" });
  }
  const [deletedTier] = store2.salaryTiers.splice(index, 1);
  store2.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: admin.id || "admin",
    adminName: admin.name || "Admin",
    action: "Delete Salary Tier",
    target: deletedTier.roleName,
    details: `Deleted salary tier: ${deletedTier.roleName}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveStore();
  return res.json({ success: true, deletedTier, tiers: store2.salaryTiers });
});
router.post(["/admin/salary/tiers/bulk", "/api/admin/salary/tiers/bulk"], authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const admin = req.admin || req.user || { id: "admin", name: "Admin" };
  const { tiers } = req.body;
  if (!Array.isArray(tiers)) {
    return res.status(400).json({ error: "Tiers must be an array" });
  }
  store2.salaryTiers = tiers.map((t, idx) => ({
    id: t.id || `tier_${Date.now()}_${idx}`,
    tierNumber: idx + 1,
    roleName: String(t.roleName || `Tier ${idx + 1}`).trim(),
    requiredReferrals: Math.max(1, Number(t.requiredReferrals) || 1),
    referralType: t.referralType || "direct_paid",
    salaryAmount: Math.max(10, Number(t.salaryAmount) || 100),
    badgeColor: t.badgeColor || "amber",
    description: t.description || `Min ${t.requiredReferrals} Active Referrals`,
    isActive: t.isActive !== false
  }));
  store2.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: admin.id || "admin",
    adminName: admin.name || "Admin",
    action: "Bulk Update Salary Tiers",
    target: `${store2.salaryTiers.length} Tiers`,
    details: `Updated all ${store2.salaryTiers.length} monthly salary configuration tiers.`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveStore();
  return res.json({ success: true, tiers: store2.salaryTiers });
});
router.post(["/admin/salary/distribute", "/api/admin/salary/distribute"], authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const admin = req.admin || req.user || { id: "admin", name: "Admin" };
  const tiers = store2.salaryTiers || [];
  let distributedCount = 0;
  let totalDistributedAmount = 0;
  const distributedUsers = [];
  store2.users.forEach((user) => {
    const eligibility = calculateSalaryEligibility(user, tiers, store2.users);
    if (eligibility.isEligible && eligibility.salaryAmount > 0) {
      const salaryAmount = eligibility.salaryAmount;
      const wallet = store2.wallets.find((w) => w.userId === user.id);
      if (wallet) {
        wallet.balance += salaryAmount;
        wallet.salaryIncome = (wallet.salaryIncome || 0) + salaryAmount;
        wallet.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        const trxId = `trx_sal_${Date.now()}_${user.id.slice(-4)}`;
        store2.transactions.push({
          id: trxId,
          userId: user.id,
          type: "salary",
          amount: salaryAmount,
          description: `Monthly Leadership Salary [${eligibility.tier?.roleName}] (${eligibility.effectiveCount} Active Members)`,
          balanceAfter: wallet.balance,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        recordWalletLedgerEntry({
          userId: user.id,
          transactionType: "Salary",
          amount: salaryAmount,
          balanceBefore: wallet.balance - salaryAmount,
          balanceAfter: wallet.balance,
          reason: `Monthly Leadership Salary [${eligibility.tier?.roleName}] (${eligibility.effectiveCount} Active Members)`,
          referenceId: trxId,
          createdBy: admin.name || "System Admin",
          status: "completed"
        });
        store2.notifications.push({
          id: `notif_sal_${Date.now()}_${user.id.slice(-4)}`,
          userId: user.id,
          type: "salary",
          title: "Monthly Salary Credited! \u09F3" + salaryAmount,
          message: `Congratulations! \u09F3${salaryAmount} monthly leadership salary for [${eligibility.tier?.roleName}] has been credited to your balance.`,
          isRead: false,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        distributedCount++;
        totalDistributedAmount += salaryAmount;
        distributedUsers.push({
          userId: user.id,
          phone: user.phone,
          tierName: eligibility.tier?.roleName,
          amount: salaryAmount
        });
        emitWalletUpdated(user.id, wallet);
      }
    }
  });
  store2.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: admin.id || "admin",
    adminName: admin.name || "Admin",
    action: "Distribute Monthly Salary",
    target: `${distributedCount} Leaders`,
    details: `Distributed total \u09F3${totalDistributedAmount} to ${distributedCount} qualifying leaders across active salary tiers.`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveStore();
  return res.json({
    success: true,
    distributedCount,
    totalDistributedAmount,
    distributedUsers,
    message: `Successfully distributed \u09F3${totalDistributedAmount.toLocaleString()} to ${distributedCount} qualifying leaders.`
  });
});
router.post(["/admin/users/:id/reset-password", "/api/admin/users/:id/reset-password"], authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const admin = req.admin || req.user || { id: "admin", name: "Admin" };
  const user = store2.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const newPass = req.body.newPassword || "123456";
  user.passwordHash = bcrypt2.hashSync(newPass, 10);
  saveStore();
  store2.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: admin.id || "admin",
    adminName: admin.name || "Admin",
    action: "Reset Password",
    target: user.phone,
    details: `Password reset to temporary password.`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveStore();
  return res.json({ success: true, message: `Password reset for ${user.phone}. New password: ${newPass}` });
});
router.post(["/admin/users/:id/change-package", "/api/admin/users/:id/change-package"], authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const admin = req.admin || req.user || { id: "admin", name: "Admin" };
  const user = store2.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const { packageId } = req.body;
  user.activePackageId = packageId;
  user.isTrial = false;
  user.packageActivatedAt = (/* @__PURE__ */ new Date()).toISOString();
  store2.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: admin.id || "admin",
    adminName: admin.name || "Admin",
    action: "Change User Package",
    target: user.phone,
    details: `Assigned package ID: ${packageId}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveStore();
  return res.json({ success: true, message: `Package updated for ${user.phone}` });
});
router.post(["/admin/users/:id/reset-trial", "/api/admin/users/:id/reset-trial"], authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const admin = req.admin || req.user || { id: "admin", name: "Admin" };
  const user = store2.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  user.isTrial = true;
  user.trialDaysUsed = 0;
  user.trialTotalEarned = 0;
  user.trialMissedDays = 0;
  user.trialExpired = false;
  user.trialStartDate = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  store2.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: admin.id || "admin",
    adminName: admin.name || "Admin",
    action: "Reset Free Trial",
    target: user.phone,
    details: `Reset 3-day free trial counter to fresh state.`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveStore();
  return res.json({ success: true, message: `Free trial reset for ${user.phone}` });
});
router.post(["/admin/security/ban-device", "/api/admin/security/ban-device"], authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const admin = req.admin || req.user || { id: "admin", name: "Admin" };
  const { deviceFingerprint } = req.body;
  if (!deviceFingerprint) return res.status(400).json({ error: "deviceFingerprint is required" });
  store2.users.forEach((u) => {
    if (u.deviceFingerprint === deviceFingerprint) {
      u.isBanned = true;
      u.status = "suspended";
    }
  });
  store2.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: admin.id || "admin",
    adminName: admin.name || "Admin",
    action: "Ban Device Fingerprint",
    target: deviceFingerprint,
    details: `Banned device and suspended all associated user accounts.`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveStore();
  return res.json({ success: true, message: `Device ${deviceFingerprint} and all associated accounts banned.` });
});
router.get("/admin/admin-users", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const safeAdmins = (store2.adminUsers || []).map((a) => ({
    id: a.id,
    phone: a.phone,
    name: a.name,
    role: a.role,
    permissions: a.permissions || [],
    status: a.status || "active",
    email: a.email || "",
    lastLoginAt: a.lastLoginAt,
    createdAt: a.createdAt
  }));
  return res.json({ adminUsers: safeAdmins });
});
router.post("/admin/admin-users", authenticateAdmin, (req, res) => {
  const currentAdmin = req.user || req.admin;
  if (currentAdmin.role !== "Main Admin") {
    return res.status(403).json({ error: "Only Main Admin can create new admin users." });
  }
  const { phone, name, role, password, permissions, email } = req.body;
  if (!phone || !name || !role || !password) {
    return res.status(400).json({ error: "Phone, name, role, and password are required." });
  }
  const store2 = getStore();
  const normalizedPhone = normalizeBdPhone(phone);
  if (store2.adminUsers.some((a) => a.phone === normalizedPhone)) {
    return res.status(400).json({ error: "An admin user with this phone number already exists." });
  }
  const salt = bcrypt2.genSaltSync(10);
  const passwordHash = bcrypt2.hashSync(password, salt);
  const newAdmin = {
    id: `admin_${Date.now()}`,
    phone: normalizedPhone,
    name: name.trim(),
    role,
    passwordHash,
    permissions: permissions || ["dashboard"],
    status: "active",
    email: email || "",
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  store2.adminUsers.push(newAdmin);
  store2.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: currentAdmin.id,
    adminName: currentAdmin.name || "Main Admin",
    action: "Create Admin User",
    target: newAdmin.phone,
    details: `Created admin user ${newAdmin.name} with role ${newAdmin.role}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
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
      status: newAdmin.status
    }
  });
});
router.post("/admin/admin-users/:id/update", authenticateAdmin, (req, res) => {
  const currentAdmin = req.user || req.admin;
  if (currentAdmin.role !== "Main Admin") {
    return res.status(403).json({ error: "Only Main Admin can update admin users." });
  }
  const store2 = getStore();
  const targetAdmin = store2.adminUsers.find((a) => a.id === req.params.id);
  if (!targetAdmin) return res.status(404).json({ error: "Admin user not found." });
  const { name, role, permissions, status, email, newPassword } = req.body;
  if (name !== void 0) targetAdmin.name = name.trim();
  if (role !== void 0) targetAdmin.role = role;
  if (permissions !== void 0) targetAdmin.permissions = permissions;
  if (status !== void 0) targetAdmin.status = status;
  if (email !== void 0) targetAdmin.email = email;
  if (newPassword && newPassword.length >= 6) {
    const salt = bcrypt2.genSaltSync(10);
    targetAdmin.passwordHash = bcrypt2.hashSync(newPassword, salt);
  }
  store2.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: currentAdmin.id,
    adminName: currentAdmin.name || "Main Admin",
    action: "Update Admin User",
    target: targetAdmin.phone,
    details: `Updated settings for admin ${targetAdmin.name}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveStore();
  return res.json({ success: true, message: "Admin user updated successfully." });
});
router.delete("/admin/admin-users/:id", authenticateAdmin, (req, res) => {
  const currentAdmin = req.user || req.admin;
  if (currentAdmin.role !== "Main Admin") {
    return res.status(403).json({ error: "Only Main Admin can delete admin accounts." });
  }
  const store2 = getStore();
  const idx = store2.adminUsers.findIndex((a) => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Admin user not found." });
  const target = store2.adminUsers[idx];
  if (target.id === currentAdmin.id) {
    return res.status(400).json({ error: "You cannot delete your own active administrator account." });
  }
  store2.adminUsers.splice(idx, 1);
  store2.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: currentAdmin.id,
    adminName: currentAdmin.name || "Main Admin",
    action: "Delete Admin User",
    target: target.phone,
    details: `Deleted admin account ${target.name} (${target.phone})`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveStore();
  return res.json({ success: true, message: `Admin account ${target.name} deleted.` });
});
router.get("/admin/roles", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  return res.json({ roles: store2.roles || [] });
});
router.post("/admin/roles", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const { roles } = req.body;
  if (Array.isArray(roles)) {
    store2.roles = roles;
    saveStore();
  }
  return res.json({ success: true, roles: store2.roles });
});
router.get("/admin/support/tickets", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const { status, priority, search } = req.query;
  let list = [...store2.supportTickets || []];
  if (status && status !== "all") {
    list = list.filter((t) => t.status === status);
  }
  if (priority && priority !== "all") {
    list = list.filter((t) => t.priority === priority);
  }
  if (search && typeof search === "string") {
    const q = search.toLowerCase();
    list = list.filter(
      (t) => t.userPhone.includes(q) || t.subject.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)
    );
  }
  return res.json({ tickets: list.reverse() });
});
router.get("/admin/support/tickets/:id", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const ticket = (store2.supportTickets || []).find((t) => t.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  return res.json({ ticket });
});
router.post("/admin/support/tickets/:id/reply", authenticateAdmin, (req, res) => {
  const currentAdmin = req.user || req.admin;
  const store2 = getStore();
  const ticket = (store2.supportTickets || []).find((t) => t.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  const { message, attachmentUrl, setStatus } = req.body;
  if (!message) return res.status(400).json({ error: "Reply message cannot be empty" });
  const newMsg = {
    id: `msg_${Date.now()}`,
    senderId: currentAdmin.id,
    senderName: `${currentAdmin.name || "Admin"} (Support Team)`,
    senderType: "admin",
    message: message.trim(),
    attachmentUrl,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  ticket.messages.push(newMsg);
  ticket.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  if (setStatus && ["open", "in_progress", "resolved", "closed"].includes(setStatus)) {
    ticket.status = setStatus;
  } else if (ticket.status === "open") {
    ticket.status = "in_progress";
  }
  store2.notifications.push({
    id: `notif_${Date.now()}`,
    userId: ticket.userId,
    type: "task",
    title: "Support Ticket Update",
    message: `New reply on ticket #${ticket.id}: ${message.slice(0, 80)}...`,
    isRead: false,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveStore();
  emitNotificationNew(ticket.userId, store2.notifications[store2.notifications.length - 1]);
  return res.json({ success: true, ticket, message: newMsg });
});
router.post("/admin/support/tickets/:id/status", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const ticket = (store2.supportTickets || []).find((t) => t.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  const { status } = req.body;
  if (!["open", "in_progress", "resolved", "closed"].includes(status)) {
    return res.status(400).json({ error: "Invalid ticket status" });
  }
  ticket.status = status;
  ticket.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  saveStore();
  return res.json({ success: true, ticket });
});
router.get(["/support/tickets", "/api/support/tickets"], authenticateUser, (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const store2 = getStore();
  const userTickets = (store2.supportTickets || []).filter((t) => t.userId === user.id);
  return res.json({ tickets: userTickets.reverse() });
});
router.post(["/support/tickets", "/api/support/tickets"], authenticateUser, (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const { subject, category, priority, message, attachmentUrl } = req.body;
  if (!subject || !message) {
    return res.status(400).json({ error: "Subject and message are required." });
  }
  const store2 = getStore();
  const newTicket = {
    id: `tkt_${Date.now().toString().slice(-6)}`,
    userId: user.id,
    userPhone: user.phone,
    subject: subject.trim(),
    category: category || "General Inquiry",
    priority: priority || "medium",
    status: "open",
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    messages: [
      {
        id: `msg_${Date.now()}`,
        senderId: user.id,
        senderName: user.phone,
        senderType: "user",
        message: message.trim(),
        attachmentUrl,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    ]
  };
  if (!store2.supportTickets) store2.supportTickets = [];
  store2.supportTickets.push(newTicket);
  saveStore();
  return res.json({ success: true, ticket: newTicket });
});
router.get("/admin/sliders", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  return res.json({ sliders: (store2.sliders || []).sort((a, b) => a.sortOrder - b.sortOrder) });
});
router.get("/sliders", (req, res) => {
  const store2 = getStore();
  const activeSliders = (store2.sliders || []).filter((s) => s.status === "active").sort((a, b) => a.sortOrder - b.sortOrder);
  return res.json({ sliders: activeSliders });
});
router.get("/sliders/public", (req, res) => {
  const store2 = getStore();
  const activeSliders = (store2.sliders || []).filter((s) => s.status === "active").sort((a, b) => a.sortOrder - b.sortOrder);
  return res.json({ sliders: activeSliders });
});
router.post("/admin/sliders", authenticateAdmin, (req, res) => {
  const { title, subtitle, tag, imageUrl, buttonText, buttonLink, status, sortOrder, startDate, endDate } = req.body;
  if (!title || !imageUrl) {
    return res.status(400).json({ error: "Slider title and image URL are required" });
  }
  const store2 = getStore();
  const newSlider = {
    id: `slide_${Date.now()}`,
    title: title.trim(),
    subtitle: subtitle || "",
    tag: tag || "",
    imageUrl,
    buttonText: buttonText || "Learn More",
    buttonLink: buttonLink || "/",
    status: status || "active",
    sortOrder: Number(sortOrder) || store2.sliders.length + 1,
    startDate,
    endDate,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (!store2.sliders) store2.sliders = [];
  store2.sliders.push(newSlider);
  saveStore();
  return res.json({ success: true, slider: newSlider });
});
router.post("/admin/sliders/:id/update", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const slider = (store2.sliders || []).find((s) => s.id === req.params.id);
  if (!slider) return res.status(404).json({ error: "Slider not found" });
  const { title, subtitle, tag, imageUrl, buttonText, buttonLink, status, sortOrder, startDate, endDate } = req.body;
  if (title !== void 0) slider.title = title.trim();
  if (subtitle !== void 0) slider.subtitle = subtitle;
  if (tag !== void 0) slider.tag = tag;
  if (imageUrl !== void 0) slider.imageUrl = imageUrl;
  if (buttonText !== void 0) slider.buttonText = buttonText;
  if (buttonLink !== void 0) slider.buttonLink = buttonLink;
  if (status !== void 0) slider.status = status;
  if (sortOrder !== void 0) slider.sortOrder = Number(sortOrder);
  if (startDate !== void 0) slider.startDate = startDate;
  if (endDate !== void 0) slider.endDate = endDate;
  saveStore();
  return res.json({ success: true, slider });
});
router.post("/admin/sliders/:id/toggle", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const slider = (store2.sliders || []).find((s) => s.id === req.params.id);
  if (!slider) return res.status(404).json({ error: "Slider not found" });
  slider.status = slider.status === "active" ? "inactive" : "active";
  saveStore();
  return res.json({ success: true, slider });
});
router.delete("/admin/sliders/:id", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const idx = (store2.sliders || []).findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Slider not found" });
  store2.sliders.splice(idx, 1);
  saveStore();
  return res.json({ success: true, message: "Slider deleted successfully" });
});
router.get("/admin/tasks", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  return res.json({ tasks: store2.videoTasks || [] });
});
router.post("/admin/tasks", authenticateAdmin, (req, res) => {
  const { title, videoUrl, thumbnailUrl, rewardAmount, durationSeconds, category, requiredPackageId, enabled } = req.body;
  if (!title || !videoUrl) {
    return res.status(400).json({ error: "Task title and video URL are required" });
  }
  const store2 = getStore();
  const newTask = {
    id: `task_${Date.now()}`,
    title: title.trim(),
    videoUrl,
    thumbnailUrl: thumbnailUrl || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600",
    rewardAmount: Number(rewardAmount) || 25,
    durationSeconds: 10,
    // STRICT 10-second requirement
    category: category || "Sponsor Ads",
    requiredPackageId: requiredPackageId || "all",
    enabled: enabled !== void 0 ? Boolean(enabled) : true,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  store2.videoTasks.push(newTask);
  saveStore();
  return res.json({ success: true, task: newTask });
});
router.post("/admin/tasks/:id/update", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const task = store2.videoTasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  const { title, videoUrl, thumbnailUrl, rewardAmount, category, requiredPackageId, enabled } = req.body;
  if (title !== void 0) task.title = title.trim();
  if (videoUrl !== void 0) task.videoUrl = videoUrl;
  if (thumbnailUrl !== void 0) task.thumbnailUrl = thumbnailUrl;
  if (rewardAmount !== void 0) task.rewardAmount = Number(rewardAmount);
  if (category !== void 0) task.category = category;
  if (requiredPackageId !== void 0) task.requiredPackageId = requiredPackageId;
  if (enabled !== void 0) task.enabled = Boolean(enabled);
  task.durationSeconds = 10;
  saveStore();
  return res.json({ success: true, task });
});
router.post("/admin/tasks/:id/toggle", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const task = store2.videoTasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  task.enabled = !task.enabled;
  saveStore();
  return res.json({ success: true, task });
});
router.delete("/admin/tasks/:id", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const idx = store2.videoTasks.findIndex((t) => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Task not found" });
  store2.videoTasks.splice(idx, 1);
  saveStore();
  return res.json({ success: true, message: "Task deleted successfully" });
});
router.get("/admin/system/health", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const uptime = process.uptime();
  const memory = process.memoryUsage();
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor(uptime % 86400 / 3600);
  const minutes = Math.floor(uptime % 3600 / 60);
  const uptimeFormatted = `${days}d ${hours}h ${minutes}m`;
  const isCloudinaryReady = configureCloudinary();
  const healthData = {
    serverStatus: "healthy",
    uptimeSeconds: Math.floor(uptime),
    uptimeFormatted,
    nodeVersion: process.version,
    memoryUsageMb: Math.round(memory.rss / (1024 * 1024)),
    heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024)),
    totalMemoryMb: Math.round(memory.heapTotal / (1024 * 1024)),
    socketConnections: getOnlineUserCount() || 1,
    cloudinaryStatus: isCloudinaryReady ? "connected" : "unconfigured",
    databaseStatus: "connected",
    lastBackupAt: (/* @__PURE__ */ new Date()).toISOString(),
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  return res.json({
    health: healthData,
    counts: {
      users: store2.users.length,
      deposits: store2.deposits.length,
      withdraws: store2.withdraws.length,
      tasks: store2.videoTasks.length,
      tickets: (store2.supportTickets || []).length,
      logs: store2.activityLogs.length,
      sliders: (store2.sliders || []).length
    }
  });
});
router.get("/admin/global-search", authenticateAdmin, (req, res) => {
  const { q } = req.query;
  if (!q || typeof q !== "string" || q.trim().length < 2) {
    return res.json({ users: [], deposits: [], withdraws: [], transactions: [], tickets: [] });
  }
  const query = q.trim().toLowerCase();
  const store2 = getStore();
  const users = store2.users.filter((u) => u.phone.includes(query) || u.id.toLowerCase().includes(query) || u.referralCode.toLowerCase().includes(query)).slice(0, 10);
  const deposits = store2.deposits.filter((d) => d.transactionId.toLowerCase().includes(query) || d.userPhone.includes(query) || d.senderNumber.includes(query)).slice(0, 10);
  const withdraws = store2.withdraws.filter((w) => w.withdrawNumber.includes(query) || w.userPhone.includes(query) || w.id.toLowerCase().includes(query)).slice(0, 10);
  const transactions = store2.transactions.filter((t) => t.id.toLowerCase().includes(query) || t.description && t.description.toLowerCase().includes(query)).slice(0, 10);
  const tickets = (store2.supportTickets || []).filter((t) => t.id.toLowerCase().includes(query) || t.userPhone.includes(query) || t.subject.toLowerCase().includes(query)).slice(0, 10);
  return res.json({ users, deposits, withdraws, transactions, tickets });
});
router.post("/admin/broadcast", authenticateAdmin, (req, res) => {
  const currentAdmin = req.user || req.admin;
  const { title, message, target, targetPhone, type } = req.body;
  if (!title || !message) {
    return res.status(400).json({ error: "Broadcast title and message are required" });
  }
  const store2 = getStore();
  let recipientCount = 0;
  if (target === "single" && targetPhone) {
    const user = store2.users.find((u) => u.phone === normalizeBdPhone(targetPhone));
    if (user) {
      const notif = {
        id: `notif_${Date.now()}`,
        userId: user.id,
        type: type || "task",
        title,
        message,
        isRead: false,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      store2.notifications.push(notif);
      emitNotificationNew(user.id, notif);
      recipientCount = 1;
    }
  } else {
    store2.users.forEach((u) => {
      let match = false;
      if (target === "all") match = true;
      else if (target === "free" && u.isTrial) match = true;
      else if (target === "paid" && !u.isTrial && u.activePackageId) match = true;
      if (match) {
        const notif = {
          id: `notif_${Date.now()}_${u.id.slice(-4)}`,
          userId: u.id,
          type: type || "task",
          title,
          message,
          isRead: false,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        store2.notifications.push(notif);
        emitNotificationNew(u.id, notif);
        recipientCount++;
      }
    });
  }
  store2.activityLogs.push({
    id: `log_${Date.now()}`,
    adminId: currentAdmin.id,
    adminName: currentAdmin.name || "Admin",
    action: "Send Push Broadcast",
    target: target === "single" ? targetPhone : `Target: ${target}`,
    details: `Broadcast sent to ${recipientCount} user(s). Title: ${title}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveStore();
  return res.json({ success: true, recipientCount, message: `Broadcast successfully dispatched to ${recipientCount} users.` });
});
function authenticateDevice(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : req.query.token || req.body && req.body.deviceToken;
  const store2 = getStore();
  const settings = store2.mfsSettings || getDefaultMfsSettings();
  if (!token) {
    return res.status(401).json({ error: "Device authorization token required" });
  }
  if (token === settings.deviceSecretToken) {
    return next();
  }
  const device = store2.verifyDevices?.find((d) => d.deviceToken === token && !d.isBanned);
  if (device) {
    req.verifyDevice = device;
    return next();
  }
  return res.status(403).json({ error: "Invalid or banned device token" });
}
router.post("/admin/sms/sync", authenticateDevice, (req, res) => {
  const store2 = getStore();
  const {
    deviceId,
    paymentMethod,
    trxId,
    amount,
    senderNumber,
    balanceAfter,
    smsTime,
    rawSms
  } = req.body;
  let finalMethod = paymentMethod;
  let finalTrx = trxId;
  let finalAmount = Number(amount);
  let finalSender = senderNumber;
  let finalBalance = balanceAfter;
  let finalTime = smsTime;
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
      error: "Missing required SMS fields: trxId, amount, and paymentMethod are required"
    });
  }
  const normalizedTrx = finalTrx.trim().toUpperCase();
  const existing = store2.smsTransactions.find((s) => s.trxId.toUpperCase() === normalizedTrx);
  if (existing) {
    return res.json({
      success: true,
      message: "SMS already received and indexed",
      duplicate: true,
      sms: existing
    });
  }
  const newSms = {
    id: `sms_${Date.now()}_${Math.floor(Math.random() * 1e3)}`,
    trxId: normalizedTrx,
    method: finalMethod === "Nagad" ? "Nagad" : "bKash",
    amount: finalAmount,
    senderNumber: cleanBdPhone(finalSender || ""),
    balanceAfter: finalBalance || "",
    smsTime: finalTime || (/* @__PURE__ */ new Date()).toISOString(),
    rawSms: rawSms || `Received Tk ${finalAmount} from ${finalSender}. TrxID ${normalizedTrx}`,
    deviceId: deviceId || "android_app",
    verified: false,
    used: false,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  store2.smsTransactions.unshift(newSms);
  if (deviceId) {
    const dev = store2.verifyDevices.find((d) => d.deviceId === deviceId);
    if (dev) {
      dev.lastSyncAt = (/* @__PURE__ */ new Date()).toISOString();
      dev.totalSmsForwarded += 1;
      dev.status = "online";
    }
  }
  saveStore();
  checkPendingDepositsForIncomingSms(newSms);
  return res.json({
    success: true,
    message: "SMS transaction synced and processed successfully",
    sms: newSms
  });
});
router.post("/admin/verify-app/heartbeat", authenticateDevice, (req, res) => {
  const store2 = getStore();
  const { deviceId, batteryPercent, networkType, phoneNumber, appVersion } = req.body;
  if (!deviceId) {
    return res.status(400).json({ error: "deviceId is required" });
  }
  let device = store2.verifyDevices.find((d) => d.deviceId === deviceId);
  if (!device) {
    device = {
      id: `dev_${Date.now()}`,
      deviceId,
      deviceName: "Android SMS Gateway",
      phoneNumber: phoneNumber || "01712345678",
      deviceToken: (req.headers.authorization || "").replace("Bearer ", "").trim(),
      batteryPercent: batteryPercent ?? 100,
      networkType: networkType || "WiFi",
      status: "online",
      lastSyncAt: (/* @__PURE__ */ new Date()).toISOString(),
      lastHeartbeatAt: (/* @__PURE__ */ new Date()).toISOString(),
      totalSmsForwarded: 0,
      appVersion: appVersion || "2.0.4",
      isBanned: false
    };
    store2.verifyDevices.push(device);
  } else {
    if (batteryPercent !== void 0) device.batteryPercent = batteryPercent;
    if (networkType) device.networkType = networkType;
    if (phoneNumber) device.phoneNumber = phoneNumber;
    if (appVersion) device.appVersion = appVersion;
    device.status = "online";
    device.lastHeartbeatAt = (/* @__PURE__ */ new Date()).toISOString();
  }
  saveStore();
  return res.json({
    success: true,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    status: "online"
  });
});
router.get("/admin/verify-app/devices", (req, res) => {
  const store2 = getStore();
  const now = Date.now();
  const updatedDevices = (store2.verifyDevices || []).map((d) => {
    const lastHb = new Date(d.lastHeartbeatAt).getTime();
    const isOffline = now - lastHb > 9e4;
    return {
      ...d,
      status: d.isBanned ? "offline" : isOffline ? "offline" : "online"
    };
  });
  return res.json({ devices: updatedDevices });
});
router.post("/admin/verify-app/devices/:id/ban", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const device = store2.verifyDevices.find((d) => d.id === req.params.id);
  if (!device) {
    return res.status(404).json({ error: "Device not found" });
  }
  device.isBanned = !device.isBanned;
  saveStore();
  return res.json({ success: true, device });
});
router.get("/admin/mfs/settings", (req, res) => {
  const store2 = getStore();
  return res.json({ settings: store2.mfsSettings || getDefaultMfsSettings() });
});
router.post("/admin/mfs/settings", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  if (!store2.mfsSettings) store2.mfsSettings = getDefaultMfsSettings();
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
    forceUpdateApk
  } = req.body;
  if (autoVerificationEnabled !== void 0) store2.mfsSettings.autoVerificationEnabled = Boolean(autoVerificationEnabled);
  if (manualVerificationEnabled !== void 0) store2.mfsSettings.manualVerificationEnabled = Boolean(manualVerificationEnabled);
  if (fallbackManualReview !== void 0) store2.mfsSettings.fallbackManualReview = Boolean(fallbackManualReview);
  if (verificationTimeoutMinutes !== void 0) store2.mfsSettings.verificationTimeoutMinutes = Number(verificationTimeoutMinutes);
  if (allowedSmsAgeHours !== void 0) store2.mfsSettings.allowedSmsAgeHours = Number(allowedSmsAgeHours);
  if (enableDeviceSync !== void 0) store2.mfsSettings.enableDeviceSync = Boolean(enableDeviceSync);
  if (deviceSecretToken) store2.mfsSettings.deviceSecretToken = String(deviceSecretToken).trim();
  if (apkDownloadUrl) store2.mfsSettings.apkDownloadUrl = String(apkDownloadUrl).trim();
  if (latestApkVersion) store2.mfsSettings.latestApkVersion = String(latestApkVersion).trim();
  if (forceUpdateApk !== void 0) store2.mfsSettings.forceUpdateApk = Boolean(forceUpdateApk);
  saveStore();
  return res.json({ success: true, settings: store2.mfsSettings });
});
router.get("/admin/sms/transactions", (req, res) => {
  const store2 = getStore();
  return res.json({ transactions: store2.smsTransactions || [] });
});
router.post("/admin/sms/simulate", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const { rawSms, method, amount, trxId, senderNumber } = req.body;
  let finalMethod = method;
  let finalTrx = trxId;
  let finalAmount = Number(amount);
  let finalSender = senderNumber;
  let finalBalance = "5,000.00";
  let finalTime = (/* @__PURE__ */ new Date()).toISOString();
  let parsed = null;
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
        error: parsed.error || "Failed to parse SMS. Please provide valid bKash or Nagad SMS content."
      });
    }
  }
  if (!finalTrx || !finalAmount || !finalMethod) {
    return res.status(400).json({ error: "trxId, amount, and payment method are required." });
  }
  const normalizedTrx = finalTrx.trim().toUpperCase();
  const newSms = {
    id: `sms_${Date.now()}_sim`,
    trxId: normalizedTrx,
    method: finalMethod === "Nagad" ? "Nagad" : "bKash",
    amount: finalAmount,
    senderNumber: cleanBdPhone(finalSender || "01711111111"),
    balanceAfter: finalBalance,
    smsTime: finalTime,
    rawSms: rawSms || `You have received Tk ${finalAmount} from ${finalSender}. TrxID ${normalizedTrx}`,
    deviceId: "admin_sms_simulator",
    verified: false,
    used: false,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  store2.smsTransactions.unshift(newSms);
  saveStore();
  checkPendingDepositsForIncomingSms(newSms);
  return res.json({
    success: true,
    message: "SMS simulated successfully. Parsed and processed through auto-verification pipeline.",
    parsed,
    sms: newSms
  });
});
router.get("/admin/mfs/logs", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  return res.json({
    verificationLogs: store2.verificationLogs || [],
    fraudLogs: store2.fraudLogs || []
  });
});
router.post("/admin/mfs/fraud-action", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const { logId, action } = req.body;
  const log = store2.fraudLogs?.find((l) => l.id === logId);
  if (log) {
    log.resolved = true;
  }
  if (action === "ban_user" && log && log.userId) {
    const user = store2.users.find((u) => u.id === log.userId);
    if (user) {
      user.status = "suspended";
    }
  }
  if (action === "ban_device" && log && log.deviceId) {
    const dev = store2.verifyDevices.find((d) => d.deviceId === log.deviceId);
    if (dev) {
      dev.isBanned = true;
    }
  }
  saveStore();
  return res.json({ success: true, message: `Fraud action '${action}' applied successfully.` });
});
router.get("/admin/mfs/numbers", (req, res) => {
  const store2 = getStore();
  return res.json({ numbers: store2.paymentNumbers || [] });
});
router.post("/admin/mfs/numbers", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const { method, number, accountType, dailyLimit } = req.body;
  if (!method || !number) {
    return res.status(400).json({ error: "Method and number are required" });
  }
  const cleanNum = cleanBdPhone(number);
  const newNum = {
    id: `pn_${Date.now()}`,
    method: method === "Nagad" ? "Nagad" : "bKash",
    number: cleanNum,
    accountType: accountType || "Personal",
    isActive: true,
    usageCount: 0,
    dailyLimit: Number(dailyLimit) || 5e4,
    currentDailyVolume: 0
  };
  store2.paymentNumbers.push(newNum);
  saveStore();
  return res.json({ success: true, number: newNum });
});
router.post("/admin/mfs/numbers/:id/toggle", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const num = store2.paymentNumbers.find((p) => p.id === req.params.id);
  if (!num) return res.status(404).json({ error: "Number not found" });
  num.isActive = !num.isActive;
  saveStore();
  return res.json({ success: true, number: num });
});
router.delete("/admin/mfs/numbers/:id", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const idx = store2.paymentNumbers.findIndex((p) => p.id === req.params.id);
  if (idx !== -1) {
    store2.paymentNumbers.splice(idx, 1);
    saveStore();
  }
  return res.json({ success: true, message: "Number deleted from pool" });
});
router.post("/admin/mfs/upload-apk", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const { version, downloadUrl, forceUpdate, releaseNotes, fileSize } = req.body;
  if (!store2.mfsSettings) store2.mfsSettings = getDefaultMfsSettings();
  if (version) store2.mfsSettings.latestApkVersion = version;
  if (downloadUrl) store2.mfsSettings.apkDownloadUrl = downloadUrl;
  if (forceUpdate !== void 0) store2.mfsSettings.forceUpdateApk = forceUpdate;
  if (version) {
    if (!store2.apkVersions) store2.apkVersions = [];
    store2.apkVersions.forEach((v) => {
      v.isCurrent = false;
    });
    store2.apkVersions.unshift({
      id: `apk_${Date.now()}`,
      version,
      releaseNotes: releaseNotes || "Official APK release with automated MFS background syncing.",
      fileSize: fileSize || "1.8 MB",
      downloadUrl: downloadUrl || "/downloads/EarnHubVerify.apk",
      downloadCount: 0,
      isCurrent: true,
      minSupportedVersion: "2.0.0",
      forceUpdate: Boolean(forceUpdate),
      releasedAt: (/* @__PURE__ */ new Date()).toISOString(),
      uploadedBy: req.admin?.name || "Administrator"
    });
  }
  saveStore();
  return res.json({ success: true, settings: store2.mfsSettings });
});
router.post("/admin/sms/retry-queue", authenticateAdmin, (req, res) => {
  const retriedCount = retryFailedSmsQueue();
  return res.json({
    success: true,
    retriedCount,
    message: `Processed ${retriedCount} queued SMS entries.`
  });
});
router.get("/admin/sms/queue", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const queueItems = (store2.smsTransactions || []).map((s) => ({
    id: s.id,
    trxId: s.trxId,
    method: s.method,
    amount: s.amount,
    senderNumber: s.senderNumber,
    queueStatus: s.queueStatus || (s.used ? "Used" : s.verified ? "Verified" : "Synced"),
    retryCount: s.retryCount || 0,
    deviceId: s.deviceId,
    createdAt: s.createdAt,
    usedByUser: s.usedByUser
  }));
  return res.json({ queue: queueItems });
});
router.get("/admin/fraud/dashboard", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const now = Date.now();
  const fraudLogs = store2.fraudLogs || [];
  const verificationLogs = store2.verificationLogs || [];
  const devices = store2.verifyDevices || [];
  const duplicateTrxLogs = fraudLogs.filter((f) => f.type === "duplicate_trx" || f.type === "reused_trx");
  const failedVerifications = verificationLogs.filter((v) => v.status === "fraud_mismatch" || v.status === "fraud_duplicate" || v.status === "manual_rejected");
  const duplicateSenderLogs = fraudLogs.filter((f) => f.type === "suspicious_sender_sharing" || f.type === "wrong_sender");
  const suspiciousDevices = devices.filter((d) => {
    const lastHb = d.lastHeartbeatAt ? new Date(d.lastHeartbeatAt).getTime() : 0;
    const isOffline = now - lastHb > 9e4;
    return d.isBanned || isOffline;
  });
  const blockedTransactions = store2.deposits.filter((d) => d.status === "rejected");
  const blockedDevices = devices.filter((d) => d.isBanned);
  return res.json({
    metrics: {
      duplicateTrxCount: duplicateTrxLogs.length,
      failedVerificationsCount: failedVerifications.length,
      duplicateSendersCount: duplicateSenderLogs.length,
      suspiciousDevicesCount: suspiciousDevices.length,
      blockedTransactionsCount: blockedTransactions.length,
      blockedDevicesCount: blockedDevices.length
    },
    duplicateTrx: duplicateTrxLogs.slice(0, 50),
    failedVerifications: failedVerifications.slice(0, 50),
    duplicateSenders: duplicateSenderLogs.slice(0, 50),
    suspiciousDevices,
    blockedTransactions: blockedTransactions.slice(0, 50),
    blockedDevices,
    allFraudLogs: fraudLogs.slice(0, 100),
    allVerificationLogs: verificationLogs.slice(0, 100)
  });
});
router.post("/admin/fraud/action", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const { logId, action, targetId } = req.body;
  if (logId) {
    const log = store2.fraudLogs?.find((f) => f.id === logId);
    if (log) {
      log.resolved = true;
    }
  }
  let actionMessage = "Fraud alert updated.";
  if (action === "ban_user" && targetId) {
    const user = store2.users.find((u) => u.id === targetId || u.phone === targetId);
    if (user) {
      user.status = "suspended";
      actionMessage = `User ${user.phone} (${user.id}) has been suspended.`;
    }
  } else if (action === "ban_device" && targetId) {
    const dev = store2.verifyDevices.find((d) => d.deviceId === targetId || d.id === targetId);
    if (dev) {
      dev.isBanned = true;
      dev.status = "offline";
      actionMessage = `Device ${dev.deviceId} has been blocked from forwarding SMS.`;
    }
  } else if (action === "unban_device" && targetId) {
    const dev = store2.verifyDevices.find((d) => d.deviceId === targetId || d.id === targetId);
    if (dev) {
      dev.isBanned = false;
      dev.status = "online";
      actionMessage = `Device ${dev.deviceId} has been unbanned.`;
    }
  } else if (action === "resolve_all") {
    (store2.fraudLogs || []).forEach((f) => {
      f.resolved = true;
    });
    actionMessage = "All fraud alerts marked as resolved.";
  }
  saveStore();
  return res.json({ success: true, message: actionMessage });
});
router.get("/admin/apk/versions", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  return res.json({
    versions: store2.apkVersions || [],
    currentSettings: store2.mfsSettings || getDefaultMfsSettings()
  });
});
router.post("/admin/apk/upload", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const { version, releaseNotes, fileSize, downloadUrl, forceUpdate, minSupportedVersion } = req.body;
  if (!version) {
    return res.status(400).json({ error: "Version number is required (e.g. 2.0.5)" });
  }
  if (!store2.apkVersions) store2.apkVersions = [];
  store2.apkVersions.forEach((v) => {
    v.isCurrent = false;
  });
  const newVersion = {
    id: `apk_v${version.replace(/\./g, "")}_${Date.now()}`,
    version,
    releaseNotes: releaseNotes || "EarnHub Verify APK update with enhanced telemetry and offline retry.",
    fileSize: fileSize || "1.8 MB",
    downloadUrl: downloadUrl || "/downloads/EarnHubVerify.apk",
    downloadCount: 0,
    isCurrent: true,
    minSupportedVersion: minSupportedVersion || "2.0.0",
    forceUpdate: Boolean(forceUpdate),
    releasedAt: (/* @__PURE__ */ new Date()).toISOString(),
    uploadedBy: req.admin?.name || "Administrator"
  };
  store2.apkVersions.unshift(newVersion);
  if (!store2.mfsSettings) store2.mfsSettings = getDefaultMfsSettings();
  store2.mfsSettings.latestApkVersion = version;
  store2.mfsSettings.apkDownloadUrl = newVersion.downloadUrl;
  store2.mfsSettings.forceUpdateApk = Boolean(forceUpdate);
  saveStore();
  return res.json({ success: true, version: newVersion, settings: store2.mfsSettings });
});
router.post("/admin/apk/toggle-force-update", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const { forceUpdate } = req.body;
  if (!store2.mfsSettings) store2.mfsSettings = getDefaultMfsSettings();
  store2.mfsSettings.forceUpdateApk = Boolean(forceUpdate);
  if (store2.apkVersions && store2.apkVersions[0]) {
    store2.apkVersions[0].forceUpdate = Boolean(forceUpdate);
  }
  saveStore();
  return res.json({ success: true, forceUpdate: store2.mfsSettings.forceUpdateApk });
});
router.get(["/apk/latest", "/api/apk/latest"], (req, res) => {
  const store2 = getStore();
  const settings = store2.mfsSettings || getDefaultMfsSettings();
  const currentRecord = store2.apkVersions?.find((v) => v.isCurrent) || store2.apkVersions?.[0];
  return res.json({
    latestVersion: settings.latestApkVersion || "2.0.4",
    downloadUrl: settings.apkDownloadUrl || "/downloads/EarnHubVerify.apk",
    forceUpdate: settings.forceUpdateApk || false,
    fileSize: currentRecord?.fileSize || "1.8 MB",
    releaseNotes: currentRecord?.releaseNotes || "EarnHub Verify V20 official native release."
  });
});
router.get("/admin/financial/audit-logs", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  return res.json({ auditLogs: store2.auditLogs || [] });
});
router.get("/admin/financial/ledger", authenticateAdmin, (req, res) => {
  const store2 = getStore();
  const { userId, type } = req.query;
  let ledger = store2.walletTransactions || [];
  if (userId) {
    ledger = ledger.filter((l) => l.userId === userId);
  }
  if (type) {
    ledger = ledger.filter((l) => l.transactionType.toLowerCase() === type.toLowerCase());
  }
  return res.json({ ledger: ledger.slice(0, 200) });
});
var routes_default = router;

// server/api.ts
import dotenv from "dotenv";
dotenv.config();
var app = express();
app.set("trust proxy", 1);
app.use(cors({ origin: true, credentials: true }));
app.use(applySecurityHeaders);
app.use(sanitizeRequestData);
connectMongoDB().then((connected) => {
  if (connected) initMongoSync().catch(() => {
  });
}).catch((err) => {
  console.warn("[Database] Optional MongoDB Atlas init deferred:", err?.message);
});
app.use(async (req, res, next) => {
  try {
    const connected = await connectMongoDB();
    if (connected) {
      await initMongoSync();
    }
  } catch (e) {
  }
  next();
});
app.use("/api", globalApiLimiter);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
var healthHandler = (req, res) => {
  res.json({
    status: "ok",
    service: "EarnNetwork BD (earnnetworkbd.com)",
    version: "v20.0.0-enterprise",
    time: (/* @__PURE__ */ new Date()).toISOString()
  });
};
app.get("/api/health", healthHandler);
app.get("/health", healthHandler);
app.use("/api", routes_default);
app.use("/", routes_default);
app.use((err, req, res, next) => {
  console.error("[API Runtime Error]:", err?.message || err);
  if (res.headersSent) {
    return next(err);
  }
  return res.status(err?.status || 500).json({
    error: err?.message || "\u098F\u0995\u099F\u09BF \u09B8\u09BE\u09B0\u09CD\u09AD\u09BE\u09B0 \u09A4\u09CD\u09B0\u09C1\u099F\u09BF \u0998\u099F\u09C7\u099B\u09C7\u0964 \u0985\u09A8\u09C1\u0997\u09CD\u09B0\u09B9 \u0995\u09B0\u09C7 \u09AA\u09C1\u09A8\u09B0\u09BE\u09AF\u09BC \u099A\u09C7\u09B7\u09CD\u099F\u09BE \u0995\u09B0\u09C1\u09A8\u0964"
  });
});
var api_default = app;
export {
  api_default as default
};
