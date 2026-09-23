import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Copy,
  Check,
  Upload,
  Clock,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  FileText,
  Lock,
  Phone,
  Layers,
  History,
  Info,
  MessageCircle,
  UserCheck,
  ShieldAlert,
  Sparkles,
  ExternalLink,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest, getDeviceFingerprint } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { DepositRequest, WithdrawRequest, Transaction, PaymentNumber, WithdrawCard } from '../../types';
import { ImageUploadInput } from '../common/ImageUploadInput';
import { TransactionHistorySection } from './TransactionHistorySection';

interface WalletViewProps {
  initialTab?: 'overview' | 'transactions' | 'deposit' | 'withdraw' | 'passbook' | 'tracker' | 'history' | 'deposit-history' | 'withdraw-history';
  onNavigate?: (view: string) => void;
}

export function WalletView({ initialTab = 'overview', onNavigate }: WalletViewProps) {
  const { user, wallet, settings, refreshUserData } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'deposit' | 'withdraw' | 'passbook' | 'deposit-history' | 'withdraw-history' | 'tracker'>(
    (initialTab === 'history' ? 'transactions' : initialTab) as any
  );

  // Free User Withdrawal Logic
  const isFreeUser = Boolean(user?.isTrial || !user?.activePackageId || user?.activePackageId === 'pkg_trial');
  const isFreeWithdrawPermitted = Boolean(settings?.allowFreeUserWithdrawal || user?.freeWithdrawAllowed);
  const isFreeWithdrawBlocked = isFreeUser && !isFreeWithdrawPermitted;
  const [showFreeWithdrawModal, setShowFreeWithdrawModal] = useState(false);

  // Deposit Form State
  const [depositAmount, setDepositAmount] = useState<number | ''>(1000);
  const [depositMethod, setDepositMethod] = useState<'bKash' | 'Nagad'>('bKash');
  const [paymentNumbers, setPaymentNumbers] = useState<PaymentNumber[]>([]);
  const [assignedNumber, setAssignedNumber] = useState<string>('');
  const [senderNumber, setSenderNumber] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyNumber = (num: string) => {
    if (!num) return;
    navigator.clipboard.writeText(num);
    setCopied(true);
    showToast('success', 'কপি সম্পন্ন!', `${depositMethod} নম্বরটি ক্লিপবোর্ডে কপি করা হয়েছে।`);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setScreenshotFile(e.target.files[0]);
    }
  };

  const handleManualDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(depositAmount);
    if (!amt || amt < 100 || amt > 25000) {
      showToast('error', 'ভুল পরিমাণ', 'ডিপোজিট পরিমাণ ১০০ টাকা থেকে ২৫,০০০ টাকার মধ্যে হতে হবে।');
      return;
    }

    if (!senderNumber || senderNumber.length < 11) {
      showToast('error', 'নম্বর দিন', 'সঠিক প্রেরক মোবাইল নম্বর প্রদান করুন।');
      return;
    }

    if (!transactionId || transactionId.trim().length < 6) {
      showToast('error', 'TrxID দিন', 'সঠিক ট্রানজেকশন আইডি (TrxID) প্রদান করুন।');
      return;
    }

    setLoading(true);
    try {
      const res: any = await apiRequest('/api/wallet/deposit', {
        method: 'POST',
        body: JSON.stringify({
          amount: amt,
          paymentMethod: depositMethod,
          assignedNumber: assignedNumber || (depositMethod === 'bKash' ? '01712345678' : '01823456789'),
          senderNumber,
          transactionId: transactionId.toUpperCase().trim(),
        }),
      });

      if (res && (res.autoVerified || res.status === 'approved')) {
        showToast('success', '⚡ ইনস্ট্যান্ট অটো-ভেরিফাইড!', `৳${amt.toLocaleString()} আপনার ওয়ালেটে জমা হয়েছে!`);
      } else {
        showToast('info', 'রিকোয়েস্ট জমা হয়েছে', res?.message || 'MFS গেটওয়ে থেকে SMS সিঙ্ক হওয়া মাত্রই স্বয়ংক্রিয়ভাবে ওয়ালেটে ব্যালেন্স জমা হবে।');
      }

      setTransactionId('');
      setSenderNumber('');
      setScreenshotFile(null);
      await refreshUserData();
      await loadHistories();
      setActiveTab('deposit-history');
    } catch (err: any) {
      showToast('error', 'ডিপোজিট ব্যর্থ', err.message || 'ডিপোজিট প্রসেস করা সম্ভব হয়নি।');
    } finally {
      setLoading(false);
    }
  };

  // Withdraw Form State
  const [selectedWithdrawCard, setSelectedWithdrawCard] = useState<number>(user?.isTrial ? 100 : 460);
  const [dynamicWithdrawCards, setDynamicWithdrawCards] = useState<WithdrawCard[]>([]);
  const [withdrawPassword, setWithdrawPassword] = useState('');
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);

  // Withdraw Setup (Once only) State
  const [setupMethod, setSetupMethod] = useState<'bKash' | 'Nagad'>('bKash');
  const [setupNumber, setSetupNumber] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupSubmitting, setSetupSubmitting] = useState(false);

  // Histories & Passbook
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [withdraws, setWithdraws] = useState<WithdrawRequest[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    // Load payment numbers
    apiRequest('/api/wallet/payment-numbers')
      .then((res) => {
        const nums = res.paymentNumbers || [];
        setPaymentNumbers(nums);
        const match = nums.find((n: PaymentNumber) => n.method === depositMethod);
        if (match) setAssignedNumber(match.number);
      })
      .catch((e) => console.warn(e));

    // Load dynamic withdraw denomination cards
    apiRequest('/api/withdraw-cards')
      .then((res) => {
        if (res && res.withdrawCards && res.withdrawCards.length > 0) {
          setDynamicWithdrawCards(res.withdrawCards);
          const activeList = res.withdrawCards;
          if (user?.isTrial) {
            const trialCard = activeList.find((c: WithdrawCard) => c.isTrialAllowed || c.amount === 100);
            if (trialCard) {
              setSelectedWithdrawCard(trialCard.amount);
            } else if (activeList[0]) {
              setSelectedWithdrawCard(activeList[0].amount);
            }
          } else {
            const defaultPaid = activeList.find((c: WithdrawCard) => !c.isTrialAllowed && c.amount >= 460) || activeList[0];
            if (defaultPaid) {
              setSelectedWithdrawCard(defaultPaid.amount);
            }
          }
        }
      })
      .catch((e) => console.warn('Withdraw cards load error:', e));

    loadHistories();
  }, [user?.isTrial]);

  useEffect(() => {
    const match = paymentNumbers.find((n) => n.method === depositMethod);
    if (match) {
      setAssignedNumber(match.number);
    }
  }, [depositMethod, paymentNumbers]);

  const loadHistories = async () => {
    try {
      setLoadingData(true);
      const [txRes, depRes, wdrRes] = await Promise.all([
        apiRequest('/api/wallet/passbook'),
        apiRequest('/api/wallet/deposit-history'),
        apiRequest('/api/wallet/withdraw-history'),
      ]);
      setTransactions(txRes.transactions || []);
      setDeposits(depRes.deposits || []);
      setWithdraws(wdrRes.withdraws || []);
    } catch (e) {
      console.warn('History load error:', e);
    } finally {
      setLoadingData(false);
    }
  };

  // Submit Withdraw Setup (Locked Once Forever)
  const handleWithdrawSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupNumber || setupNumber.length < 11) {
      showToast('error', 'ভুল মোবাইল নম্বর', 'অনুগ্রহ করে সঠিক ১১ ডিজিটের বাংলাদেশি মোবাইল নম্বর প্রদান করুন।');
      return;
    }
    if (!setupPassword || setupPassword.length < 4) {
      showToast('error', 'পাসওয়ার্ড প্রয়োজন', 'উইথড্র পাসওয়ার্ড অন্তত ৪ সংখ্যার হতে হবে।');
      return;
    }

    try {
      setSetupSubmitting(true);
      await apiRequest('/api/wallet/withdraw-setup', {
        method: 'POST',
        body: JSON.stringify({
          paymentMethod: setupMethod,
          withdrawNumber: setupNumber,
          withdrawPassword: setupPassword,
        }),
      });
      showToast('success', 'সেটআপ সম্পন্ন!', 'আপনার উইথড্র অ্যাকাউন্ট স্থায়ীভাবে লক করা হয়েছে।');
      await refreshUserData();
    } catch (err: any) {
      showToast('error', 'সেটআপ ব্যর্থ', err.message || 'উইথড্র সেটআপ সম্পন্ন করা যায়নি।');
    } finally {
      setSetupSubmitting(false);
    }
  };

  // Submit Withdraw Request
  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isFreeWithdrawBlocked) {
      setShowFreeWithdrawModal(true);
      showToast(
        'error',
        'উইথড্র অনুমতি সীমাবদ্ধ',
        'আপনার নিয়োগ ব্যবস্থাপকের সঙ্গে যোগাযোগ করুন'
      );
      return;
    }
    if (!user?.withdrawSetupDone) {
      showToast('error', 'সেটআপ প্রয়োজন', 'প্রথমে আপনার উইথড্র মেথড এবং পাসওয়ার্ড সেটআপ সম্পন্ন করুন।');
      return;
    }
    if (!withdrawPassword) {
      showToast('error', 'পাসওয়ার্ড দিন', 'অনুগ্রহ করে আপনার উইথড্র পাসওয়ার্ড লিখুন।');
      return;
    }

    try {
      setWithdrawSubmitting(true);
      const fp = getDeviceFingerprint();
      await apiRequest('/api/wallet/withdraw', {
        method: 'POST',
        body: JSON.stringify({
          amount: selectedWithdrawCard,
          withdrawPassword,
          deviceFingerprint: fp,
        }),
      });

      showToast('success', 'উইথড্র রিকোয়েস্ট গৃহীত!', `৳${selectedWithdrawCard} উইথড্রল রিকোয়েস্ট (${user.withdrawMethod}) প্রক্রিয়াধীন রয়েছে।`);
      setWithdrawPassword('');
      await refreshUserData();
      await loadHistories();
      setActiveTab('tracker');
    } catch (err: any) {
      if (err.message && (err.message.includes('ফ্রি ইউজার') || err.message.includes('Free users') || err.message.includes('referral member'))) {
        setShowFreeWithdrawModal(true);
      }
      showToast('error', 'উইথড্র ব্যর্থ', err.message || 'উইথড্র প্রক্রিয়া সম্পন্ন করা যায়নি।');
    } finally {
      setWithdrawSubmitting(false);
    }
  };

  // Available Dynamic Withdraw Cards (with fallback):
  const fallbackDefaultCards: WithdrawCard[] = [
    { id: 'wcard_100', amount: 100, label: 'ফ্রি ট্রায়াল কার্ড', badge: 'TRIAL', badgeColor: 'cyan', minRole: 'Member', isTrialAllowed: true, enabled: true, order: 1 },
    { id: 'wcard_460', amount: 460, label: 'স্ট্যান্ডার্ড পেআউট', badge: 'INSTANT', badgeColor: 'emerald', minRole: 'Member', isTrialAllowed: false, enabled: true, order: 2 },
    { id: 'wcard_1680', amount: 1680, label: 'পপুলার পেআউট', badge: 'POPULAR', badgeColor: 'purple', minRole: 'Member', isTrialAllowed: false, enabled: true, order: 3 },
    { id: 'wcard_5800', amount: 5800, label: 'প্রিমিয়াম পেআউট', badge: 'HOT', badgeColor: 'amber', minRole: 'Member', isTrialAllowed: false, enabled: true, order: 4 },
    { id: 'wcard_16800', amount: 16800, label: 'ভিআইপি পেআউট', badge: 'VIP ONLY', badgeColor: 'amber', minRole: 'VIP', isTrialAllowed: false, enabled: true, order: 5 },
    { id: 'wcard_49999', amount: 49999, label: 'এলিট পেআউট', badge: 'HIGH LIMIT', badgeColor: 'blue', minRole: 'VIP', isTrialAllowed: false, enabled: true, order: 6 },
    { id: 'wcard_150000', amount: 150000, label: 'রয়্যাল পেআউট', badge: 'MAX LIMIT', badgeColor: 'rose', minRole: 'VIP', isTrialAllowed: false, enabled: true, order: 7 },
  ];

  const rawCards = dynamicWithdrawCards.length > 0 ? dynamicWithdrawCards : fallbackDefaultCards;
  const activeWithdrawCards = rawCards
    .filter((c) => c.enabled)
    .sort((a, b) => (a.order || 0) - (b.order || 0) || a.amount - b.amount);

  const withdrawFee = (selectedWithdrawCard * 10) / 100;
  const withdrawNet = selectedWithdrawCard - withdrawFee;

  const getCardBadgeTheme = (color?: string) => {
    switch (color) {
      case 'amber':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      case 'rose':
        return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
      case 'purple':
        return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
      case 'cyan':
        return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
      case 'blue':
        return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
      case 'emerald':
      default:
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    }
  };

  return (
    <div id="wallet-view-root" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 pb-24 md:pb-12">
      {/* Wallet Navigation Tabs */}
      <div className="relative w-full min-w-0">
        <div className="w-full min-w-0 max-w-full flex items-center gap-2 pb-3 pt-1 border-b border-white/[0.08] flex-nowrap scroll-smooth-x scrollbar-thin">
          {[
            { id: 'overview', label: 'Overview', icon: Wallet },
            { id: 'transactions', label: 'Transaction History', icon: History },
            { id: 'deposit', label: 'Deposit', icon: ArrowDownLeft },
            { id: 'withdraw', label: 'Withdraw', icon: ArrowUpRight },
            { id: 'passbook', label: 'Passbook', icon: FileText },
            { id: 'tracker', label: 'Live Tracker', icon: Clock },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`tab-wallet-${tab.id}`}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold shrink-0 transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'glass-btn-primary text-slate-950 font-black shadow-lg shadow-emerald-950/40'
                    : 'text-slate-300 hover:text-white glass-pill border border-white/[0.08]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Balance Card */}
            <div className="p-6 rounded-3xl glass-card glass-card-hover border border-emerald-500/30 shadow-xl space-y-4 relative overflow-hidden">
              <div className="absolute -top-12 -right-12 w-28 h-28 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
              <div className="flex items-center justify-between relative z-10">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">Available Balance</span>
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 flex items-center justify-center shadow-[0_0_12px_rgba(16,185,129,0.25)]">
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight relative z-10 drop-shadow-sm">
                ৳ {(wallet?.balance || 0).toLocaleString()}
              </h2>
              <div className="flex gap-2 pt-2 relative z-10">
                <button
                  onClick={() => setActiveTab('deposit')}
                  className="flex-1 py-2.5 rounded-xl glass-btn-primary text-slate-950 font-black text-xs shadow-md transition cursor-pointer"
                >
                  Deposit
                </button>
                <button
                  onClick={() => setActiveTab('withdraw')}
                  className="flex-1 py-2.5 rounded-xl glass-btn-secondary text-white font-bold text-xs border border-white/10 transition cursor-pointer"
                >
                  Withdraw
                </button>
              </div>
            </div>

            {/* Total Deposited */}
            <div className="p-6 rounded-3xl glass-card glass-card-hover border border-blue-500/20 shadow-md flex flex-col justify-between relative overflow-hidden">
              <div className="absolute -top-12 -right-12 w-28 h-28 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
              <div className="flex items-center justify-between text-slate-300 relative z-10">
                <span className="text-xs font-bold uppercase tracking-wider">Total Deposited</span>
                <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/30 text-blue-300 flex items-center justify-center shadow-[0_0_12px_rgba(59,130,246,0.2)]">
                  <ArrowDownLeft className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4 relative z-10">
                <h3 className="text-2xl sm:text-3xl font-black text-white">
                  ৳ {(wallet?.totalDeposit || 0).toLocaleString()}
                </h3>
                <span className="text-xs text-slate-400 mt-1 block">Lifetime verified deposits</span>
              </div>
            </div>

            {/* Total Withdrawn */}
            <div className="p-6 rounded-3xl glass-card glass-card-hover border border-rose-500/20 shadow-md flex flex-col justify-between relative overflow-hidden">
              <div className="absolute -top-12 -right-12 w-28 h-28 bg-rose-500/10 rounded-full blur-2xl pointer-events-none" />
              <div className="flex items-center justify-between text-slate-300 relative z-10">
                <span className="text-xs font-bold uppercase tracking-wider">Total Withdrawn</span>
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 flex items-center justify-center shadow-[0_0_12px_rgba(244,63,94,0.2)]">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4 relative z-10">
                <h3 className="text-2xl sm:text-3xl font-black text-white">
                  ৳ {(wallet?.totalWithdraw || 0).toLocaleString()}
                </h3>
                <span className="text-xs text-slate-400 mt-1 block">Paid via bKash / Nagad</span>
              </div>
            </div>
          </div>

          {/* Breakdown Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl glass-card">
              <span className="text-[11px] text-slate-400 block font-semibold">Task Earnings</span>
              <span className="text-lg font-bold text-emerald-300">৳{(wallet?.totalEarned || 0).toLocaleString()}</span>
            </div>
            <div className="p-4 rounded-2xl glass-card">
              <span className="text-[11px] text-slate-400 block font-semibold">Referral Bonus</span>
              <span className="text-lg font-bold text-purple-300">৳{(wallet?.referralIncome || 0).toLocaleString()}</span>
            </div>
            <div className="p-4 rounded-2xl glass-card">
              <span className="text-[11px] text-slate-400 block font-semibold">Salary Credited</span>
              <span className="text-lg font-bold text-teal-300">৳{(wallet?.salaryIncome || 0).toLocaleString()}</span>
            </div>
            <div className="p-4 rounded-2xl glass-card">
              <span className="text-[11px] text-slate-400 block font-semibold">Gift / Promo Balance</span>
              <span className="text-lg font-bold text-amber-300">৳{(wallet?.giftIncome || 0).toLocaleString()}</span>
            </div>
          </div>

          {/* Transaction History Section (Recent bKash & Nagad Deposits/Withdrawals) */}
          <TransactionHistorySection
            deposits={deposits}
            withdraws={withdraws}
            loading={loadingData}
            onRefresh={loadHistories}
            onNavigateToDeposit={() => setActiveTab('deposit')}
            onNavigateToWithdraw={() => setActiveTab('withdraw')}
            initialLimit={5}
            showViewAllOption={true}
          />
        </div>
      )}

      {/* TAB: TRANSACTION HISTORY (FULL) */}
      {activeTab === 'transactions' && (
        <TransactionHistorySection
          deposits={deposits}
          withdraws={withdraws}
          loading={loadingData}
          onRefresh={loadHistories}
          onNavigateToDeposit={() => setActiveTab('deposit')}
          onNavigateToWithdraw={() => setActiveTab('withdraw')}
          initialLimit={25}
          showViewAllOption={true}
        />
      )}

      {/* TAB 2: DEPOSIT */}
      {activeTab === 'deposit' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 space-y-6">
            <div className="p-6 sm:p-7 rounded-3xl glass-panel border border-white/10 shadow-2xl space-y-6 relative overflow-hidden">
              <div className="absolute -top-16 -right-16 w-36 h-36 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
              
              {/* Header Banner */}
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-4 relative z-10">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-emerald-400" />
                    এড মানি / ডিপোজিট (Deposit)
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    অফিশিয়াল নম্বরে সেন্ড মানি করে সঠিক TrxID ও প্রেরক নম্বর দিয়ে সাবমিট করুন।
                  </p>
                </div>
              </div>

              {/* Form */}
              <form onSubmit={handleManualDepositSubmit} className="space-y-6 relative z-10">
                {/* 1. Payment Method Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    ১. মোবাইল ব্যাংকিং নির্বাচন করুন
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setDepositMethod('bKash')}
                      className={`py-3.5 px-4 rounded-2xl border flex items-center justify-center gap-2.5 font-black text-sm transition cursor-pointer ${
                        depositMethod === 'bKash'
                          ? 'bg-[#E2136E]/25 border-[#E2136E] text-pink-200 shadow-xl shadow-pink-950/40'
                          : 'bg-white/[0.04] border-white/10 text-slate-300 hover:border-white/20'
                      }`}
                    >
                      <span className="w-3.5 h-3.5 rounded-full bg-[#E2136E] shadow-[0_0_8px_rgba(226,19,110,0.6)]"></span>
                      <span>bKash (বিকাশ)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDepositMethod('Nagad')}
                      className={`py-3.5 px-4 rounded-2xl border flex items-center justify-center gap-2.5 font-black text-sm transition cursor-pointer ${
                        depositMethod === 'Nagad'
                          ? 'bg-[#F7931E]/25 border-[#F7931E] text-orange-200 shadow-xl shadow-orange-950/40'
                          : 'bg-white/[0.04] border-white/10 text-slate-300 hover:border-white/20'
                      }`}
                    >
                      <span className="w-3.5 h-3.5 rounded-full bg-[#F7931E] shadow-[0_0_8px_rgba(247,147,30,0.6)]"></span>
                      <span>Nagad (নগদ)</span>
                    </button>
                  </div>
                </div>

                {/* Assigned Official Number Display Box */}
                <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>অফিশিয়াল {depositMethod} পার্সোনাল নম্বর:</span>
                    <span className="text-[10px] bg-white/[0.08] px-2 py-0.5 rounded text-slate-300 font-mono border border-white/10">
                      Send Money Only
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-black text-xl text-white tracking-wider">
                      {assignedNumber}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyNumber(assignedNumber)}
                      className="px-3.5 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-emerald-300 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-white/10 active:scale-95"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copied ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                {/* 2. Amount Input */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                    ২. ডিপোজিট পরিমাণ (৳১০০ - ৳২৫,০০০)
                  </label>
                  <input
                    id="input-deposit-amount"
                    type="number"
                    min="100"
                    max="25000"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(Number(e.target.value) || '')}
                    className="w-full px-4 py-3 bg-[#0e1424] border border-white/10 rounded-2xl text-white font-black text-lg focus:border-emerald-400 focus:outline-none"
                    placeholder="1000"
                  />
                  <div className="flex flex-wrap gap-2 pt-1">
                    {[500, 1000, 2500, 5000, 7500, 22500].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setDepositAmount(amt)}
                        className={`text-xs px-3 py-1.5 rounded-xl font-bold transition cursor-pointer ${
                          depositAmount === amt
                            ? 'glass-btn-primary text-slate-950 shadow'
                            : 'bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 border border-white/[0.08]'
                        }`}
                      >
                        ৳{amt.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Sender Phone Number */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                    ৩. আপনার প্রেরক নম্বর (Sender Number)
                  </label>
                  <input
                    id="input-sender-number"
                    type="tel"
                    value={senderNumber}
                    onChange={(e) => setSenderNumber(e.target.value)}
                    className="w-full px-4 py-3 bg-[#0e1424] border border-white/10 rounded-2xl text-white font-mono font-bold text-base focus:border-emerald-400 focus:outline-none"
                    placeholder="017XXXXXXXX"
                  />
                </div>

                {/* 4. Transaction ID (TrxID) */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                    ৪. ট্রানজেকশন আইডি (TrxID)
                  </label>
                  <input
                    id="input-transaction-id"
                    type="text"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value.toUpperCase())}
                    className="w-full px-4 py-3 bg-[#0e1424] border border-white/10 rounded-2xl text-white font-mono font-black text-lg uppercase tracking-widest focus:border-emerald-400 focus:outline-none"
                    placeholder="e.g. BK9X82P8KL"
                  />
                </div>

                {/* Submit Action */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 rounded-2xl font-black text-sm glass-btn-primary text-slate-950 shadow-xl transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>
                    {loading
                      ? 'ভেরিফাই করা হচ্ছে...'
                      : 'ডিপোজিট সাবমিট করুন'}
                  </span>
                </button>
              </form>
            </div>
          </div>

          {/* Deposit Instructions Card */}
          <div className="lg:col-span-5 space-y-4">
            <div className="p-6 rounded-3xl glass-card border border-white/10 space-y-4">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                <Info className="w-4 h-4 text-emerald-400" />
                জরুরি নির্দেশনা
              </h4>
              <ul className="space-y-2.5 text-xs text-slate-300 leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-emerald-400">১.</span>
                  <span>উপরে দেওয়া অফিশিয়াল {depositMethod} নম্বরে শুধু "Send Money" করুন।</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-emerald-400">২.</span>
                  <span>টাকা পাঠানোর পর বিকাশ/নগদ অ্যাপ থেকে সঠিক TrxID ও প্রেরক নম্বর লিখুন।</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-emerald-400">৩.</span>
                  <span>তথ্য সাবমিট হওয়ার সাথে সাথেই স্বয়ংক্রিয়ভাবে ওয়ালেটে ব্যালেন্স জমা হয়ে যাবে।</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: WITHDRAW */}
      {activeTab === 'withdraw' && (
        <div className="max-w-3xl mx-auto space-y-6">
          {/* If withdraw setup is NOT done: show setup card */}
            {!user?.withdrawSetupDone ? (
              <div className="p-6 sm:p-7 rounded-3xl glass-panel border border-white/10 shadow-2xl space-y-5 relative overflow-hidden">
                <div className="absolute -top-16 -right-16 w-36 h-36 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="space-y-1 relative z-10">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
                    Setup Locked Once Forever
                  </span>
                  <h3 className="text-xl font-black text-white mt-1">Setup Withdraw Method & Password</h3>
                  <p className="text-xs text-slate-300">
                    Rule: Once submitted, your withdraw phone number and password can never be altered. Same withdraw number cannot be registered by another account.
                  </p>
                </div>

                <form onSubmit={handleWithdrawSetupSubmit} className="space-y-4 relative z-10">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Payment Method
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setSetupMethod('bKash')}
                        className={`py-3 rounded-xl border text-sm font-bold transition cursor-pointer ${
                          setupMethod === 'bKash'
                            ? 'bg-[#E2136E]/20 border-[#E2136E] text-pink-200 shadow-lg'
                            : 'bg-white/[0.04] border-white/10 text-slate-300 hover:border-white/20'
                        }`}
                      >
                        bKash
                      </button>
                      <button
                        type="button"
                        onClick={() => setSetupMethod('Nagad')}
                        className={`py-3 rounded-xl border text-sm font-bold transition cursor-pointer ${
                          setupMethod === 'Nagad'
                            ? 'bg-[#F7931E]/20 border-[#F7931E] text-orange-200 shadow-lg'
                            : 'bg-white/[0.04] border-white/10 text-slate-300 hover:border-white/20'
                        }`}
                      >
                        Nagad
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Withdraw {setupMethod} Number (Unique)
                    </label>
                    <input
                      id="input-setup-withdraw-number"
                      type="text"
                      value={setupNumber}
                      onChange={(e) => setSetupNumber(e.target.value)}
                      placeholder="017xxxxxxxx"
                      className="w-full px-4 py-2.5 bg-[#0e1424] border border-white/10 rounded-xl text-white text-sm focus:border-purple-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Create Secret Withdraw Password
                    </label>
                    <input
                      id="input-setup-withdraw-password"
                      type="password"
                      value={setupPassword}
                      onChange={(e) => setSetupPassword(e.target.value)}
                      placeholder="Secret 4+ digit PIN / Password"
                      className="w-full px-4 py-2.5 bg-[#0e1424] border border-white/10 rounded-xl text-white text-sm focus:border-purple-400 focus:outline-none"
                    />
                  </div>

                  <button
                    id="btn-submit-withdraw-setup"
                    type="submit"
                    disabled={setupSubmitting}
                    className="w-full py-3.5 rounded-xl glass-btn-primary text-slate-950 font-black text-sm shadow-xl transition disabled:opacity-50 cursor-pointer active:scale-95"
                  >
                    {setupSubmitting ? 'Locking Credentials...' : 'Lock Withdraw Credentials Forever'}
                  </button>
                </form>
              </div>
            ) : (
              // Active Withdraw Form with LOCKED AMOUNT CARDS
              <div className="p-6 sm:p-7 rounded-3xl glass-panel border border-white/10 shadow-2xl space-y-6 relative overflow-hidden">
                <div className="absolute -top-16 -right-16 w-36 h-36 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

                {/* Status Alert Banner: Free User Restriction / Admin Permission Granted / VIP Paid */}
                {isFreeWithdrawBlocked ? (
                  <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 shadow-xl space-y-4 relative z-10 backdrop-blur-md">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/35 flex items-center justify-center shrink-0 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
                        <ShieldAlert className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-base font-bold text-white">ফ্রি একাউন্ট উইথড্রয়াল সীমাবদ্ধতা</h4>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Permission Required
                          </span>
                        </div>
                        <p className="text-xs text-amber-200/90 leading-relaxed">
                          ফ্রি ইউজাররা সরাসরি টাকা উইথড্র করতে পারবেন না। টাকা উইথড্র করার অনুমতি পেতে অনুগ্রহ করে সাপোর্ট টিমে অথবা আপনার রেফারেল মেম্বারের সাথে যোগাযোগ করুন। প্যানেল থেকে এডমিন ফ্রি ইউজারদের টাকা উইথড্র করার পারমিশন এনাবল (Enable) করলে আপনি টাকা উইথড্র করতে পারবেন।
                        </p>
                      </div>
                    </div>

                    {/* Quick Action Buttons for Free Users */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-amber-500/20">
                      <a
                        href={`https://wa.me/${(settings?.whatsappNumber || '8801700000000').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                          `Hello Support Team, I am a free user on EarnNetwork BD (Phone: ${user?.phone}). I would like to request permission to withdraw my earnings. Please enable permission for my account.`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl glass-btn-primary text-slate-950 font-bold text-xs shadow-md transition cursor-pointer"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>Contact Support</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => setShowFreeWithdrawModal(true)}
                        className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/35 font-bold text-xs transition cursor-pointer"
                      >
                        <UserCheck className="w-4 h-4" />
                        <span>Contact Referral</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (onNavigate) {
                            onNavigate('packages');
                          } else {
                            setActiveTab('deposit');
                          }
                        }}
                        className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs transition cursor-pointer"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>Deposit & Buy Package</span>
                      </button>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.04] border border-amber-500/20 flex items-center justify-between text-xs text-slate-300">
                      <span className="text-[11px]">ডিপোজিট করে যেকোনো প্যাকেজ কিনলে কোনো বাধা ছাড়াই স্বাভাবিকভাবে কাজ ও আনলিমিটেড উইথড্র করতে পারবেন।</span>
                      <button
                        type="button"
                        onClick={() => setActiveTab('deposit')}
                        className="font-bold text-amber-400 hover:text-amber-300 underline shrink-0 ml-2 cursor-pointer"
                      >
                        ডিপোজিট করুন →
                      </button>
                    </div>
                  </div>
                ) : isFreeUser && isFreeWithdrawPermitted ? (
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 shadow-xl flex items-center gap-3 relative z-10 backdrop-blur-md">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white">✅ ফ্রি উইথড্র অনুমতি সক্রিয় (Admin Permitted)</h4>
                      </div>
                      <p className="text-xs text-emerald-300/90">
                        এডমিন আপনার ফ্রি একাউন্টের জন্য উইথড্র করার অনুমতি সক্রিয় করেছেন। আপনি এখন আপনার ১০০ টাকা বা ব্যালেন্স উইথড্র করতে পারবেন।
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 px-4 rounded-2xl glass-card border border-white/10 flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-bold text-slate-200">VIP Paid Member Account</span>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-400">স্বাভাবিক উইথড্র সচল (Unrestricted)</span>
                  </div>
                )}

                <div className="flex items-center justify-between relative z-10">
                  <div className="space-y-0.5">
                    <h3 className="text-lg font-bold text-white">Withdraw Funds</h3>
                    <p className="text-xs text-slate-300">
                      Destination: <span className="text-emerald-300 font-semibold">{user.withdrawMethod} {user.withdrawNumber}</span>
                    </p>
                  </div>
                  <span className="text-xs font-bold text-slate-300 bg-white/[0.06] px-3 py-1 rounded-xl border border-white/10">
                    Fee: 10%
                  </span>
                </div>

                {/* Amount Cards Selector (LOCKED - MUST BE CARDS, NOT DROPDOWN!) */}
                <div className="space-y-2.5 relative z-10">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                      উইথড্রল কার্ড নির্বাচন করুন (Select Amount Card)
                    </label>
                    <span className="text-[11px] font-medium text-slate-400">
                      মোট {activeWithdrawCards.length} টি কার্ড সক্রিয়
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {activeWithdrawCards.map((card) => {
                      const isSelected = selectedWithdrawCard === card.amount;
                      const cardFee = (card.amount * 10) / 100;
                      const cardNet = card.amount - cardFee;

                      return (
                        <button
                          key={card.id || card.amount}
                          type="button"
                          id={`card-withdraw-${card.amount}`}
                          onClick={() => setSelectedWithdrawCard(card.amount)}
                          className={`relative p-3.5 sm:p-4 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between gap-2.5 cursor-pointer min-h-[110px] group ${
                            isSelected
                              ? 'glass-card border-purple-500/60 shadow-xl shadow-purple-950/40 ring-2 ring-purple-500/40 bg-purple-500/10'
                              : 'bg-white/[0.03] hover:bg-white/[0.07] border-white/[0.08] hover:border-white/20 text-slate-300'
                          }`}
                        >
                          {/* Top Badges & Status */}
                          <div className="flex items-center justify-between gap-1 w-full">
                            {card.badge ? (
                              <span
                                className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${getCardBadgeTheme(
                                  card.badgeColor
                                )}`}
                              >
                                {card.badge}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-medium">Card</span>
                            )}

                            <div
                              className={`w-4 h-4 rounded-full flex items-center justify-center border transition ${
                                isSelected
                                  ? 'bg-purple-500 border-purple-400 text-white shadow-[0_0_8px_rgba(168,85,247,0.5)]'
                                  : 'border-white/20 bg-white/[0.05]'
                              }`}
                            >
                              {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                            </div>
                          </div>

                          {/* Card Amount Display */}
                          <div className="space-y-0.5">
                            <span className="text-[10px] text-slate-400 font-medium block truncate">
                              {card.label || 'কার্ড ভ্যালু'}
                            </span>
                            <div className="flex items-baseline gap-1">
                              <span className="text-base sm:text-lg font-black text-white group-hover:text-purple-300 transition">
                                ৳ {card.amount.toLocaleString()}
                              </span>
                            </div>
                          </div>

                          {/* Net Payout Footnote */}
                          <div className="pt-1.5 border-t border-white/[0.08] flex items-center justify-between text-[10px]">
                            <span className="text-slate-400">পাবেন (Net):</span>
                            <span className="font-bold text-emerald-300">৳ {cardNet.toLocaleString()}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Net Breakdown */}
                <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2 text-xs relative z-10">
                  <div className="flex justify-between text-slate-300">
                    <span>Withdrawal Amount:</span>
                    <span className="font-bold text-white">৳ {selectedWithdrawCard.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Platform Fee (10%):</span>
                    <span className="font-bold text-rose-300">- ৳ {withdrawFee.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-white font-bold pt-2 border-t border-white/10 text-sm">
                    <span>You Receive in {user.withdrawMethod}:</span>
                    <span className="text-emerald-300 font-black">৳ {withdrawNet.toLocaleString()}</span>
                  </div>
                </div>

                <form onSubmit={handleWithdrawSubmit} className="space-y-4 relative z-10">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Withdraw Password (Required)
                    </label>
                    <input
                      id="input-withdraw-password"
                      type="password"
                      value={withdrawPassword}
                      onChange={(e) => setWithdrawPassword(e.target.value)}
                      placeholder="Enter your confidential withdraw password"
                      className="w-full px-4 py-3 bg-[#0e1424] border border-white/10 rounded-2xl text-white text-sm focus:border-purple-400 focus:outline-none"
                    />
                  </div>

                  {isFreeWithdrawBlocked ? (
                    <button
                      id="btn-submit-withdraw-card-blocked"
                      type="button"
                      onClick={() => setShowFreeWithdrawModal(true)}
                      className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-600 via-rose-600 to-pink-600 hover:from-amber-500 hover:to-pink-500 text-white font-bold text-sm shadow-xl shadow-amber-950/50 transition cursor-pointer flex items-center justify-center gap-2 active:scale-95"
                    >
                      <ShieldAlert className="w-4 h-4" />
                      <span>Contact Support or Referral Member to Enable Withdrawal</span>
                    </button>
                  ) : (
                    <button
                      id="btn-submit-withdraw-card"
                      type="submit"
                      disabled={withdrawSubmitting}
                      className="w-full py-3.5 rounded-2xl glass-btn-primary text-slate-950 font-black text-sm shadow-xl transition disabled:opacity-50 cursor-pointer active:scale-95"
                    >
                      {withdrawSubmitting ? 'Submitting Request...' : `Request ৳${selectedWithdrawCard.toLocaleString()} Withdrawal`}
                    </button>
                  )}
                </form>
              </div>
            )}
        </div>
      )}

      {/* TAB 4: PASSBOOK */}
      {activeTab === 'passbook' && (
        <div className="p-6 sm:p-7 rounded-3xl glass-panel border border-white/10 shadow-2xl space-y-4 relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-400" />
              Wallet Passbook
            </h3>
            <span className="text-xs text-slate-300 bg-white/[0.06] px-2.5 py-1 rounded-full border border-white/10">{transactions.length} Total Records</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/[0.03] text-slate-300 uppercase tracking-wider text-[10px] border-b border-white/[0.08]">
                <tr>
                  <th className="p-3">Type</th>
                  <th className="p-3">Description</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Balance After</th>
                  <th className="p-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400">No transaction entries found.</td>
                  </tr>
                ) : (
                  transactions.map((tx, idx) => (
                    <tr key={`${tx.id || 'tx'}_${idx}`} className="hover:bg-white/[0.03] transition">
                      <td className="p-3 font-semibold uppercase text-slate-200">{tx.type}</td>
                      <td className="p-3 text-slate-300">{tx.description}</td>
                      <td className={`p-3 font-bold ${tx.amount >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {tx.amount >= 0 ? `+৳${tx.amount}` : `-৳${Math.abs(tx.amount)}`}
                      </td>
                      <td className="p-3 font-semibold text-white">৳{(tx.balanceAfter || 0).toLocaleString()}</td>
                      <td className="p-3 text-slate-400">{new Date(tx.createdAt).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: DEPOSIT HISTORY */}
      {activeTab === 'deposit-history' && (
        <div className="p-6 sm:p-7 rounded-3xl glass-panel border border-white/10 shadow-2xl space-y-4 relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <ArrowDownLeft className="w-5 h-5 text-emerald-400" />
              Deposit History
            </h3>
            <span className="text-xs text-slate-300 bg-white/[0.06] px-2.5 py-1 rounded-full border border-white/10">{deposits.length} Requests</span>
          </div>

          <div className="space-y-3">
            {deposits.length === 0 ? (
              <p className="text-center py-8 text-slate-400 text-xs">No deposit requests recorded yet.</p>
            ) : (
              deposits.map((dep, idx) => (
                <div key={`${dep.id || 'dep'}_${idx}`} className="p-4 rounded-2xl glass-card border border-white/[0.08] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-base">৳ {dep.amount.toLocaleString()}</span>
                      <span className="text-xs px-2.5 py-0.5 rounded-lg bg-white/[0.06] text-slate-300 font-semibold border border-white/10">{dep.paymentMethod}</span>
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase border ${
                        dep.status === 'approved'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : dep.status === 'rejected'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      }`}>
                        {dep.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 font-mono">
                      TrxID: {dep.transactionId} • Sender: {dep.senderNumber}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(dep.createdAt).toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 6: WITHDRAW HISTORY */}
      {activeTab === 'withdraw-history' && (
        <div className="p-6 sm:p-7 rounded-3xl glass-panel border border-white/10 shadow-2xl space-y-4 relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <ArrowUpRight className="w-5 h-5 text-rose-400" />
              Withdrawal History
            </h3>
            <span className="text-xs text-slate-300 bg-white/[0.06] px-2.5 py-1 rounded-full border border-white/10">{withdraws.length} Requests</span>
          </div>

          <div className="space-y-3">
            {withdraws.length === 0 ? (
              <p className="text-center py-8 text-slate-400 text-xs">No withdrawal records found.</p>
            ) : (
              withdraws.map((wdr, idx) => (
                <div key={`${wdr.id || 'wdr'}_${idx}`} className="p-4 rounded-2xl glass-card border border-white/[0.08] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-base">৳ {wdr.amount.toLocaleString()}</span>
                      <span className="text-xs text-slate-300 font-semibold">Net: ৳{wdr.netAmount.toLocaleString()}</span>
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase border ${
                        wdr.status === 'paid'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : wdr.status === 'approved'
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                          : wdr.status === 'rejected'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      }`}>
                        {wdr.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Destination: {wdr.paymentMethod} {wdr.withdrawNumber}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(wdr.createdAt).toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 7: WITHDRAW TRACKER */}
      {activeTab === 'tracker' && (
        <div className="p-6 sm:p-7 rounded-3xl glass-panel border border-white/10 shadow-2xl space-y-6 relative overflow-hidden">
          <div className="space-y-1 border-b border-white/[0.08] pb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-purple-400" />
              Live Withdrawal Tracker
            </h3>
            <p className="text-xs text-slate-300">Real-time status tracking for your latest payouts.</p>
          </div>

          {withdraws.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              No active withdrawal in transit.
            </div>
          ) : (
            <div className="space-y-6">
              {withdraws.slice(0, 3).map((wdr) => (
                <div key={wdr.id} className="p-5 rounded-2xl glass-card border border-white/10 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs text-slate-400 block">Withdrawal ID #{wdr.id}</span>
                      <h4 className="text-base font-bold text-white">
                        ৳ {wdr.amount.toLocaleString()} via {wdr.paymentMethod} ({wdr.withdrawNumber})
                      </h4>
                    </div>
                    <span className="text-xs font-mono text-emerald-300 font-semibold bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                      Net: ৳{wdr.netAmount.toLocaleString()}
                    </span>
                  </div>

                  {/* Step Timeline: Pending -> Approved -> Paid */}
                  <div className="grid grid-cols-3 gap-2 text-center pt-2">
                    <div className={`p-3 rounded-xl border transition ${
                      ['pending', 'approved', 'paid'].includes(wdr.status)
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-sm'
                        : 'bg-white/[0.03] border-white/[0.08] text-slate-400'
                    }`}>
                      <span className="text-xs font-bold block">1. Pending</span>
                      <span className="text-[10px] opacity-80">Queued in Engine</span>
                    </div>

                    <div className={`p-3 rounded-xl border transition ${
                      ['approved', 'paid'].includes(wdr.status)
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-sm'
                        : 'bg-white/[0.03] border-white/[0.08] text-slate-400'
                    }`}>
                      <span className="text-xs font-bold block">2. Approved</span>
                      <span className="text-[10px] opacity-80">Finance Verification</span>
                    </div>

                    <div className={`p-3 rounded-xl border transition ${
                      wdr.status === 'paid'
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-sm'
                        : wdr.status === 'rejected'
                        ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 shadow-sm'
                        : 'bg-white/[0.03] border-white/[0.08] text-slate-400'
                    }`}>
                      <span className="text-xs font-bold block">
                        {wdr.status === 'rejected' ? '3. Rejected' : '3. Paid'}
                      </span>
                      <span className="text-[10px] opacity-80">Sent to Wallet</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Free User Withdrawal Support & Referral Modal */}
      <AnimatePresence>
        {showFreeWithdrawModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg glass-panel border border-white/15 rounded-3xl p-6 shadow-2xl space-y-5 text-slate-100 relative overflow-hidden"
            >
              <div className="absolute -top-16 -right-16 w-36 h-36 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
              <button
                type="button"
                onClick={() => setShowFreeWithdrawModal(false)}
                className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.08] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 shadow-[0_0_15px_rgba(245,158,11,0.25)]">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">ফ্রি একাউন্ট উইথড্রয়াল সীমাবদ্ধতা</h3>
                  <p className="text-xs text-slate-300">Withdrawal Permission Notice for Free Users</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2 text-xs leading-relaxed text-slate-300 relative z-10">
                <p className="font-bold text-amber-300 text-sm">
                  আপনার নিয়োগ ব্যবস্থাপকের সঙ্গে যোগাযোগ করুন
                </p>
                <p>
                  ফ্রি একাউন্ট থেকে টাকা উইথড্র করার জন্য আপনার নিয়োগ ব্যবস্থাপকের অনুমতি প্রয়োজন। এডমিন প্যানেল থেকে আপনার অ্যাকাউন্টের উইথড্র পারমিশন এনাবল করার পর আপনি কোনো সমস্যা ছাড়াই সহজে টাকা উইথড্র করতে পারবেন।
                </p>
                <p className="text-emerald-300 pt-1 border-t border-white/[0.08]">
                  💡 বিকল্প স্থায়ী সমাধান: আপনি ডিপোজিট করে যেকোনো মেম্বারশিপ প্যাকেজ ক্রয় করলে কোনো আলাদা অনুমতি ছাড়াই রোল বা শর্ত ছাড়া স্বাভাবিকভাবে টাকা উইথড্র করতে পারবেন।
                </p>
              </div>

              <div className="space-y-3 relative z-10">
                {/* Action 1: Contact Support */}
                <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <MessageCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white block">Official Support</span>
                      <span className="text-[11px] text-slate-300">সাপোর্টে যোগাযোগ করে পারমিশন রিকোয়েস্ট করুন</span>
                    </div>
                  </div>
                  <a
                    href={`https://wa.me/${(settings?.whatsappNumber || '8801700000000').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                      `Hello Support Team, I am a free user on EarnNetwork BD (Phone: ${user?.phone}). I would like to request permission to withdraw my earnings. Please check and enable permission for my account.`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 rounded-xl glass-btn-primary text-slate-950 font-bold text-xs shadow-md transition shrink-0"
                  >
                    WhatsApp Support
                  </a>
                </div>

                {/* Action 2: Contact Referral Member */}
                <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                        <UserCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-white block">Your Referral Member</span>
                        <span className="text-[11px] text-slate-300">আপনার আপলাইন মেম্বার</span>
                      </div>
                    </div>
                    <span className="font-mono text-xs font-bold text-purple-300 bg-purple-500/20 px-2.5 py-1 rounded-lg border border-purple-500/30">
                      {user?.referredBy || 'Official Admin'}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-300">
                    আপনার রেফারেল মেম্বারকে জানান যাতে তিনি এডমিনের সাথে যোগাযোগ করে আপনার একাউন্টে উইথড্র পারমিশন সক্রিয় করার সুপারিশ করেন।
                  </p>

                  {user?.uplineInfo?.phone && (
                    <div className="flex items-center justify-between pt-2 border-t border-white/[0.08]">
                      <span className="text-xs font-mono text-slate-300 font-semibold">
                        📞 {user.uplineInfo.phone}
                      </span>
                      <div className="flex gap-2">
                        <a
                          href={`tel:${user.uplineInfo.phone}`}
                          className="px-2.5 py-1 rounded-lg bg-white/[0.08] text-slate-200 text-xs font-semibold hover:bg-white/[0.15]"
                        >
                          Call
                        </a>
                        <a
                          href={`https://wa.me/${user.uplineInfo.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                            `আসসালামু আলাইকুম, আমি আপনার রেফারেল মেম্বার (ফোন: ${user?.phone})। আমার ফ্রি একাউন্টে উইথড্র পারমিশন প্রয়োজন। অনুগ্রহ করে এডমিনকে বলে সহায়তা করবেন কি?`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold hover:bg-emerald-500/30"
                        >
                          WhatsApp
                        </a>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action 3: Deposit & Purchase Package */}
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white block">ডিপোজিট করে প্যাকেজ চালু করুন</span>
                      <span className="text-[11px] text-slate-300">প্যাকেজ কিনলে আজীবন যেকোনো সময় উইথড্র সুবিধা</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowFreeWithdrawModal(false);
                      if (onNavigate) {
                        onNavigate('packages');
                      } else {
                        setActiveTab('deposit');
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-300 hover:to-orange-300 text-slate-950 font-bold text-xs shadow-md transition shrink-0 cursor-pointer"
                  >
                    Deposit & Buy
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowFreeWithdrawModal(false)}
                className="w-full py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-slate-300 hover:text-white font-bold text-xs transition cursor-pointer border border-white/10"
              >
                Close Notice
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
