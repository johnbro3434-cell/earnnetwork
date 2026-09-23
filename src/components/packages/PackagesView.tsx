import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Crown, Check, ShieldCheck, Zap, Sparkles, ArrowRight, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { Package } from '../../types';

interface PackagesViewProps {
  onNavigate: (view: string) => void;
}

export function PackagesView({ onNavigate }: PackagesViewProps) {
  const { user, wallet, activePackage, refreshUserData } = useAuth();
  const { showToast } = useToast();
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);

  useEffect(() => {
    apiRequest('/api/packages')
      .then((res) => setPackages(res.packages || []))
      .catch((e) => console.warn('Packages error:', e))
      .finally(() => setLoading(false));
  }, []);

  const handleBuyPackage = async (pkg: Package) => {
    if (!wallet || wallet.balance < pkg.price) {
      showToast(
        'error',
        'অপর্যাপ্ত ব্যালেন্স',
        `এই প্যাকেজটি কেনার জন্য আপনার ওয়ালেটে ৳${pkg.price.toLocaleString()} টাকা প্রয়োজন। অনুগ্রহ করে প্রথমে ডিপোজিট করুন।`
      );
      onNavigate('wallet');
      return;
    }

    try {
      setPurchasingId(pkg.id);
      await apiRequest('/api/packages/purchase', {
        method: 'POST',
        body: JSON.stringify({ packageId: pkg.id }),
      });

      showToast(
        'success',
        'প্যাকেজ সক্রিয় হয়েছে!',
        `অভিনন্দন! আপনার ${pkg.name} প্যাকেজ সফলভাবে চালু হয়েছে (প্রতিদিন ${pkg.videosPerDay}টি ভিডিও টাস্ক)।`
      );
      await refreshUserData();
    } catch (err: any) {
      showToast('error', 'প্যাকেজ ক্রয় ব্যর্থ', err.message || 'প্যাকেজ সক্রিয় করা যায়নি।');
    } finally {
      setPurchasingId(null);
    }
  };

  const getTierColor = (name: string) => {
    switch (name) {
      case 'Bronze':
        return {
          border: 'border-amber-500/30 hover:border-amber-400/60 shadow-[0_8px_30px_rgba(245,158,11,0.12)]',
          bg: 'bg-gradient-to-b from-white/[0.07] to-amber-950/20 backdrop-blur-xl',
          badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          btn: 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold shadow-lg shadow-amber-950/40',
        };
      case 'Golden':
        return {
          border: 'border-yellow-400/40 hover:border-yellow-300/70 shadow-[0_8px_30px_rgba(234,179,8,0.18)]',
          bg: 'bg-gradient-to-b from-white/[0.08] to-yellow-950/25 backdrop-blur-xl',
          badge: 'bg-yellow-400/25 text-yellow-200 border-yellow-400/50 shadow-[0_0_10px_rgba(234,179,8,0.2)]',
          btn: 'bg-gradient-to-r from-yellow-400 to-amber-400 hover:from-yellow-300 hover:to-amber-300 text-slate-950 font-black shadow-lg shadow-yellow-950/40',
        };
      case 'Diamond':
        return {
          border: 'border-cyan-400/40 hover:border-cyan-300/70 shadow-[0_8px_30px_rgba(6,182,212,0.18)]',
          bg: 'bg-gradient-to-b from-white/[0.08] to-cyan-950/25 backdrop-blur-xl',
          badge: 'bg-cyan-400/25 text-cyan-200 border-cyan-400/50 shadow-[0_0_10px_rgba(6,182,212,0.2)]',
          btn: 'bg-gradient-to-r from-cyan-400 to-teal-400 hover:from-cyan-300 hover:to-teal-300 text-slate-950 font-black shadow-lg shadow-cyan-950/40',
        };
      case 'Platinum':
        return {
          border: 'border-purple-400/45 hover:border-purple-300/75 shadow-[0_8px_30px_rgba(168,85,247,0.2)]',
          bg: 'bg-gradient-to-b from-white/[0.08] to-purple-950/30 backdrop-blur-xl',
          badge: 'bg-purple-400/25 text-purple-200 border-purple-400/50 shadow-[0_0_12px_rgba(168,85,247,0.25)]',
          btn: 'bg-gradient-to-r from-purple-500 via-pink-500 to-purple-600 hover:from-purple-400 hover:to-pink-400 text-white font-black shadow-lg shadow-purple-950/40',
        };
      default:
        return {
          border: 'border-white/10 hover:border-white/20',
          bg: 'glass-card backdrop-blur-xl',
          badge: 'bg-white/[0.08] text-slate-200 border-white/15',
          btn: 'glass-btn-primary text-slate-950 font-bold',
        };
    }
  };

  return (
    <div id="packages-view-root" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 pb-24 md:pb-12">
      {/* Header Banner */}
      <div className="p-6 sm:p-7 rounded-3xl glass-panel border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-44 h-44 bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />
        
        <div className="space-y-1 relative z-10">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              Authorized Member Tiers
            </span>
            <span className="text-xs text-slate-300 font-medium">Lifetime Unlimited</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">Membership Packages</h2>
          <p className="text-xs text-slate-300">
            Packages are purchased strictly with your verified wallet balance.
          </p>
        </div>

        <div className="flex items-center gap-3 relative z-10">
          <div className="px-4 py-2.5 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center gap-2.5">
            <Wallet className="w-4 h-4 text-emerald-400" />
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-bold">Your Wallet</span>
              <span className="text-sm font-black text-white">৳ {(wallet?.balance || 0).toLocaleString()}</span>
            </div>
          </div>
          <button
            onClick={() => onNavigate('wallet')}
            className="px-4 py-2.5 rounded-2xl glass-btn-primary text-slate-950 font-bold text-xs shadow-md transition cursor-pointer active:scale-95"
          >
            + Add Funds
          </button>
        </div>
      </div>

      {/* Package Cards Grid (Locked Specifications) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {packages.map((pkg) => {
          const colors = getTierColor(pkg.name);
          const isCurrentActive = activePackage?.id === pkg.id;
          const isLowerTier = activePackage && activePackage.price > pkg.price;

          return (
            <motion.div
              key={pkg.id}
              whileHover={{ y: -6 }}
              className={`rounded-3xl border p-6 flex flex-col justify-between shadow-2xl transition-all duration-300 relative overflow-hidden ${colors.border} ${colors.bg}`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${colors.badge}`}>
                    {pkg.name}
                  </span>
                  {isCurrentActive && (
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-emerald-400 text-slate-950 shadow-md">
                      Current
                    </span>
                  )}
                </div>

                <div>
                  <span className="text-xs text-slate-400 block">Package Price</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-white">৳{pkg.price.toLocaleString()}</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1">
                  <span className="text-[11px] text-slate-400 block">Guaranteed Daily Return</span>
                  <span className="text-xl font-black text-emerald-300">৳{pkg.dailyIncome} TK / Day</span>
                  <span className="text-[10px] text-slate-400 block">
                    (৳{pkg.incomePerVideo} TK x {pkg.videosPerDay} videos)
                  </span>
                </div>

                <div className="space-y-2.5 text-xs text-slate-200">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{pkg.videosPerDay} Video Tasks Daily (10s each)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Lifetime Access (কোনো মেয়াদের সীমাবদ্ধতা নেই)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>3-Tier Referral Commissions (10%-5%-2%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Manager Salary Eligibility</span>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                {isCurrentActive ? (
                  <button
                    disabled
                    className="w-full py-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-xs cursor-default flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Active Package</span>
                  </button>
                ) : isLowerTier ? (
                  <button
                    disabled
                    className="w-full py-3 rounded-2xl bg-white/[0.05] border border-white/10 text-slate-500 font-semibold text-xs cursor-not-allowed"
                  >
                    Lower Tier Locked
                  </button>
                ) : (
                  <button
                    id={`btn-buy-package-${pkg.name.toLowerCase()}`}
                    onClick={() => handleBuyPackage(pkg)}
                    disabled={purchasingId === pkg.id}
                    className={`w-full py-3 rounded-2xl shadow-lg transition flex items-center justify-center gap-2 text-xs font-bold cursor-pointer active:scale-95 ${colors.btn}`}
                  >
                    {purchasingId === pkg.id ? (
                      'Activating...'
                    ) : (
                      <>
                        <span>Activate {pkg.name}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
