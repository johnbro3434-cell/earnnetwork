import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  PlaySquare,
  Package,
  Users,
  Sparkles,
  Gift,
  Bell,
  User as UserIcon,
  CheckCircle2,
  Clock,
  ChevronRight,
  TrendingUp,
  ShieldAlert,
  Copy,
  Check,
  Share2,
  Link2,
  MessageCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { HomeCarousel } from './HomeCarousel';

interface UserDashboardProps {
  onNavigate: (view: string) => void;
}

export function UserDashboard({ onNavigate }: UserDashboardProps) {
  const { user, wallet, activePackage, settings } = useAuth();
  const { showToast } = useToast();
  const [taskData, setTaskData] = useState<any>(null);
  const [copiedRef, setCopiedRef] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    // Fetch today tasks progress
    apiRequest('/api/tasks/today')
      .then((data) => setTaskData(data))
      .catch((e) => console.warn('Task data fetch error:', e));

    // Fetch active promotions
    apiRequest('/api/promotions')
      .then((data) => setCampaigns(data.campaigns || []))
      .catch((e) => console.warn('Promotions fetch error:', e));

    // Fetch recent notifications
    apiRequest('/api/notifications')
      .then((data) => setNotifications((data.notifications || []).slice(0, 3)))
      .catch((e) => console.warn('Notifications fetch error:', e));
  }, []);

  const adminSlides = [
    {
      id: 1,
      title: 'Mega 15% bKash & Nagad Deposit Bonus',
      tag: 'Limited Ramadan Offer',
      desc: 'Top up your wallet today with 2,500 TK or more to receive an instant 15% top-up bonus!',
      badgeColor: 'emerald',
      action: 'wallet',
    },
    {
      id: 2,
      title: 'Upgrade to Golden or Diamond Tier',
      tag: 'Earn Up To 750 TK Daily',
      desc: 'Watch up to 15 video tasks daily (10s each) with lifetime 3-tier referral commissions.',
      badgeColor: 'amber',
      action: 'packages',
    },
  ];

  const handleCopyReferral = () => {
    if (!user) return;
    const link = `https://earnnetworkbd.com?ref=${user.referralCode}`;
    navigator.clipboard.writeText(link);
    setCopiedRef(true);
    showToast('success', 'Referral Link Copied', 'Share with friends to earn Level A 10% commission!');
    setTimeout(() => setCopiedRef(false), 2500);
  };

  const handleCopyCode = () => {
    if (!user?.referralCode) return;
    navigator.clipboard.writeText(user.referralCode);
    setCopiedCode(true);
    showToast('success', 'Referral Code Copied', user.referralCode);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleShare = async () => {
    if (!user) return;
    const link = `https://earnnetworkbd.com?ref=${user.referralCode}`;
    const text = `Join EarnNetwork BD (earnnetworkbd.com) using my referral code ${user.referralCode} and start earning daily! (রেজিস্ট্রেশনের জন্য রেফার কোড আবশ্যক): ${link}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'EarnNetwork BD Invitation',
          text,
          url: link,
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          handleCopyReferral();
        }
      }
    } else {
      const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const quickGridItems = [
    { id: 'tasks', label: 'Tasks', icon: PlaySquare, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
    { id: 'packages', label: 'VIP Plans', icon: Package, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
    { id: 'wallet', label: 'Deposit', icon: Wallet, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
    { id: 'withdraw', label: 'Withdraw', icon: ArrowUpRight, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
    { id: 'referral', label: 'Referral', icon: Users, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
    { id: 'promotion', label: 'Promotion', icon: Sparkles, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
    { id: 'salary', label: 'Salary', icon: TrendingUp, color: 'text-teal-400 bg-teal-500/10 border-teal-500/20' },
    { id: 'account', label: 'Account', icon: UserIcon, color: 'text-slate-300 bg-slate-700/20 border-slate-600/30' },
  ];

  return (
    <div id="user-dashboard-root" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 pb-24 md:pb-12">
      {/* 1. ADMIN CONTROLLED HOMEPAGE CAROUSEL */}
      <HomeCarousel onNavigate={onNavigate} />

      {/* 2 & 3. WALLET SUMMARY & TODAY'S INCOME & ACTIVE PACKAGE & TASK PROGRESS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Total Wallet Balance */}
        <div
          id="card-wallet-balance"
          className="p-5 sm:p-6 rounded-2xl sm:rounded-3xl glass-card glass-card-hover flex flex-col justify-between group relative overflow-hidden"
        >
          <div className="absolute -top-12 -right-12 w-28 h-28 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between relative z-10">
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">Wallet Balance</span>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.2)] group-hover:scale-110 transition-transform">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 relative z-10">
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight drop-shadow-sm">
              ৳ {(wallet?.balance || 0).toLocaleString()}
            </h2>
            <div className="mt-3 flex items-center gap-2 pt-2 border-t border-white/[0.08]">
              <button
                onClick={() => onNavigate('wallet')}
                className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/35 text-xs font-bold text-emerald-300 transition active:scale-95 flex items-center gap-1 cursor-pointer min-h-[32px] backdrop-blur-md"
              >
                + Deposit
              </button>
              <button
                onClick={() => onNavigate('withdraw')}
                className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/35 text-xs font-bold text-rose-300 transition active:scale-95 flex items-center gap-1 cursor-pointer min-h-[32px] backdrop-blur-md"
              >
                Withdraw
              </button>
            </div>
          </div>
        </div>

        {/* Today's Income */}
        <div
          id="card-today-income"
          className="p-5 sm:p-6 rounded-2xl sm:rounded-3xl glass-card glass-card-hover flex flex-col justify-between group relative overflow-hidden"
        >
          <div className="absolute -top-12 -right-12 w-28 h-28 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between relative z-10">
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">Today's Income</span>
            <div className="w-10 h-10 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-300 flex items-center justify-center shadow-[0_0_15px_rgba(20,184,166,0.2)] group-hover:scale-110 transition-transform">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 relative z-10">
            <h2 className="text-2xl sm:text-3xl font-black text-teal-300 tracking-tight drop-shadow-sm">
              ৳ {(wallet?.todayIncome || 0).toLocaleString()}
            </h2>
            <p className="text-[11px] font-medium text-slate-400 mt-2 pt-2 border-t border-white/[0.08] flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400 inline" /> Resets daily at 12:00 AM midnight
            </p>
          </div>
        </div>

        {/* 4. ACTIVE PACKAGE */}
        <div
          id="card-active-package"
          className="p-5 sm:p-6 rounded-2xl sm:rounded-3xl glass-card glass-card-hover flex flex-col justify-between group relative overflow-hidden"
        >
          <div className="absolute -top-12 -right-12 w-28 h-28 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between relative z-10">
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">Active Package</span>
            <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/35 uppercase tracking-wider backdrop-blur-md shadow-[0_0_10px_rgba(6,182,212,0.2)]">
              {user?.isTrial ? 'Trial Tier' : 'VIP Active'}
            </span>
          </div>
          <div className="mt-4 relative z-10">
            <h3 className="text-xl font-black text-white tracking-tight drop-shadow-sm">
              {activePackage?.name || (user?.isTrial ? 'Free Trial (4-Days)' : 'None')}
            </h3>
            <p className="text-xs text-slate-300 mt-1 line-clamp-1">
              {activePackage
                ? `${activePackage.videosPerDay} Videos/day • ৳${activePackage.dailyIncome} Daily`
                : 'Purchase package with wallet balance to start'}
            </p>
            <div className="mt-3 pt-2 border-t border-white/[0.08]">
              <button
                onClick={() => onNavigate('packages')}
                className="text-xs font-bold text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1 cursor-pointer transition active:scale-95"
              >
                Upgrade Package <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* 5. TODAY'S TASK PROGRESS */}
        <div
          id="card-task-progress"
          className="p-5 sm:p-6 rounded-2xl sm:rounded-3xl glass-card glass-card-hover flex flex-col justify-between group relative overflow-hidden"
        >
          <div className="absolute -top-12 -right-12 w-28 h-28 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between relative z-10">
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">Task Progress</span>
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 flex items-center justify-center shadow-[0_0_15px_rgba(168,85,247,0.2)] group-hover:scale-110 transition-transform">
              <PlaySquare className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 space-y-2 relative z-10">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-bold text-white">
                {taskData?.completedCount ?? 0} / {taskData?.totalAllowed ?? (activePackage?.videosPerDay || 1)} Videos
              </span>
              <span className="text-xs font-extrabold text-purple-300">
                {taskData?.totalAllowed
                  ? Math.round(((taskData.completedCount || 0) / taskData.totalAllowed) * 100)
                  : 0}
                %
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-950/80 rounded-full overflow-hidden p-0.5 border border-white/10">
              <div
                className="h-full bg-gradient-to-r from-purple-500 via-teal-400 to-emerald-400 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(168,85,247,0.4)]"
                style={{
                  width: `${
                    taskData?.totalAllowed
                      ? Math.min(100, ((taskData.completedCount || 0) / taskData.totalAllowed) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
            <div className="pt-2 border-t border-white/[0.08]">
              <button
                onClick={() => onNavigate('tasks')}
                className="text-xs font-bold text-purple-300 hover:text-purple-200 flex items-center gap-1 cursor-pointer transition active:scale-95"
              >
                Watch Video Tasks (10s) <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Free Trial Banner Alert if on active trial */}
      {user?.isTrial && (
        <div className="p-4 sm:p-5 rounded-2xl glass-panel border border-cyan-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-[0_0_20px_rgba(6,182,212,0.15)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">
                Active Free Trial (Day {user.trialDaysUsed + 1} of 4)
              </p>
              <p className="text-xs text-cyan-300/90 font-medium">
                Earned ৳{user.trialTotalEarned} / ৳100. Withdraw permitted at 100 TK once per device.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('tasks')}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl glass-btn-primary text-slate-950 font-bold text-xs shrink-0 active:scale-95 transition min-h-[40px] flex items-center justify-center cursor-pointer"
          >
            Start Task
          </button>
        </div>
      )}

      {/* 6. QUICK GRID MENU */}
      <div id="section-quick-grid" className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-extrabold text-slate-300 uppercase tracking-widest flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            Quick Navigation Hub
          </h3>
          <span className="text-[10px] text-slate-400 font-semibold">Touch friendly</span>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2.5 sm:gap-3.5">
          {quickGridItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                id={`btn-quick-grid-${item.id}`}
                onClick={() => onNavigate(item.id)}
                className="flex flex-col items-center justify-center p-2.5 sm:p-3.5 rounded-2xl sm:rounded-3xl glass-card glass-card-hover group cursor-pointer min-h-[84px] sm:min-h-[94px]"
              >
                <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center border mb-1.5 transition-transform group-hover:scale-110 shrink-0 shadow-inner ${item.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[11px] sm:text-xs font-bold text-slate-200 group-hover:text-emerald-300 transition-colors text-center truncate max-w-full block">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 7. PROMOTION BANNER */}
      {campaigns.length > 0 && (
        <div id="section-promotion-banner" className="relative rounded-3xl overflow-hidden glass-panel border border-amber-500/30 p-5 sm:p-6 shadow-xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-300 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(245,158,11,0.25)]">
                <Gift className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Featured Campaign</span>
                <h4 className="text-base font-bold text-white">{campaigns[0].title}</h4>
                <p className="text-xs text-slate-300 line-clamp-1">{campaigns[0].description}</p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('promotion')}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-xs shrink-0 cursor-pointer shadow-lg shadow-amber-950/50 transition active:scale-95 min-h-[40px] flex items-center justify-center"
            >
              Claim Promotion
            </button>
          </div>
        </div>
      )}

      {/* 8 & 9. RECENT NOTIFICATIONS & REFERRAL SUMMARY */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
        {/* 8. Recent Notifications */}
        <div id="section-recent-notifications" className="p-5 sm:p-6 rounded-2xl sm:rounded-3xl glass-card space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Bell className="w-4 h-4 text-emerald-400" />
              Recent Alerts
            </h4>
            <button
              onClick={() => onNavigate('notifications')}
              className="text-xs font-bold text-emerald-400 hover:text-emerald-300 cursor-pointer"
            >
              View All
            </button>
          </div>
          <div className="space-y-2.5">
            {notifications.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No alerts to display.</p>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.07] text-xs flex flex-col gap-1 hover:border-white/20 transition">
                  <div className="flex justify-between font-bold text-slate-200">
                    <span>{n.title}</span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(n.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <p className="text-slate-300 line-clamp-1">{n.message}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 9. Referral Summary & Sharing Hub */}
        <div id="section-referral-summary" className="p-5 sm:p-6 rounded-2xl sm:rounded-3xl glass-card space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-400" />
              Referral Invitation Center
            </h4>
            <div className="flex items-center gap-2">
              <button
                onClick={handleShare}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 text-xs font-bold border border-purple-500/35 transition active:scale-95 cursor-pointer min-h-[36px] backdrop-blur-md"
                title="Share Invitation"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </button>
              <button
                onClick={() => onNavigate('referral')}
                className="text-xs font-bold text-purple-400 hover:text-purple-300 cursor-pointer"
              >
                Team Tree
              </button>
            </div>
          </div>

          {/* Referral Code Row */}
          <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">Your Referral Code (রেফার কোড)</span>
              <span className="text-base font-mono font-black text-purple-300">{user?.referralCode}</span>
            </div>
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/35 text-xs font-bold transition active:scale-95 cursor-pointer min-h-[38px] backdrop-blur-md"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
            </button>
          </div>

          {/* Referral Link Row */}
          <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-between gap-2">
            <div className="truncate flex-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">Your Referral Link (রেফারেল লিংক)</span>
              <span className="text-xs text-slate-300 font-mono truncate block mt-0.5">
                {`https://earnnetworkbd.com?ref=${user?.referralCode || ''}`}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleCopyReferral}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/35 text-xs font-bold transition active:scale-95 cursor-pointer min-h-[38px] backdrop-blur-md"
              >
                {copiedRef ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
                <span>{copiedRef ? 'Copied' : 'Copy Link'}</span>
              </button>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-purple-950/40 border border-purple-500/25 text-[11px] text-purple-200 flex items-center gap-2 backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span>নতুন রেজিস্ট্রেশনের জন্য রেফার কোড আবশ্যক। ইনভাইট লিংক শেয়ার করলে কোড অটো যুক্ত হবে।</span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.07]">
              <span className="text-xs text-slate-400 block">Level A (10%)</span>
              <span className="text-sm font-bold text-white">Direct</span>
            </div>
            <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.07]">
              <span className="text-xs text-slate-400 block">Level B (5%)</span>
              <span className="text-sm font-bold text-white">Sub-Team</span>
            </div>
            <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.07]">
              <span className="text-xs text-slate-400 block">Level C (2%)</span>
              <span className="text-sm font-bold text-white">Extended</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
