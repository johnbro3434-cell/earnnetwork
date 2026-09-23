import React, { useState, useEffect } from 'react';
import { Gift, Sparkles, CheckCircle2, ArrowRight, Tag } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PromotionCampaign } from '../../types';

export function PromotionView() {
  const { wallet, refreshUserData } = useAuth();
  const { showToast } = useToast();
  const [campaigns, setCampaigns] = useState<PromotionCampaign[]>([]);
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    apiRequest('/api/promotions')
      .then((res) => setCampaigns(res.campaigns || []))
      .catch((e) => console.warn(e));
  }, []);

  const handleClaimPromo = async (codeToClaim: string) => {
    if (!codeToClaim) {
      showToast('error', 'প্রমো কোড দিন', 'অনুগ্রহ করে একটি সঠিক প্রমো কোড লিখুন।');
      return;
    }

    try {
      setClaiming(true);
      const res = await apiRequest('/api/promotions/claim-code', {
        method: 'POST',
        body: JSON.stringify({ code: codeToClaim.trim().toUpperCase() }),
      });

      showToast('success', 'প্রমো বোনাস ক্রেডিট হয়েছে!', `৳${res.rewardAmount} আপনার ওয়ালেট ব্যালেন্সে যোগ করা হয়েছে!`);
      setPromoCodeInput('');
      await refreshUserData();
    } catch (err: any) {
      showToast('error', 'প্রমো কোড ব্যর্থ', err.message || 'প্রমো কোডটি সঠিক নয় অথবা মেয়াদ শেষ হয়ে গেছে।');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div id="promotion-view-root" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 pb-24 md:pb-12">
      {/* Header Banner */}
      <div className="p-6 sm:p-7 rounded-3xl glass-panel border border-white/10 shadow-2xl space-y-5 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-44 h-44 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-44 h-44 bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Exclusive Member Rewards
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-white">Promotions & Gift Bonuses</h2>
            <p className="text-xs text-slate-300">
              Redeem official promo codes and claim active festive reward drops directly into your wallet.
            </p>
          </div>

          {/* Quick Code Claim Input */}
          <div className="w-full md:w-auto flex gap-2">
            <input
              id="input-promo-code"
              type="text"
              value={promoCodeInput}
              onChange={(e) => setPromoCodeInput(e.target.value)}
              placeholder="ENTER PROMO CODE"
              className="px-4 py-2.5 glass-input rounded-xl text-white font-mono text-sm uppercase focus:outline-none flex-1 md:w-56 placeholder:text-slate-500"
            />
            <button
              id="btn-claim-promo"
              onClick={() => handleClaimPromo(promoCodeInput)}
              disabled={claiming}
              className="px-5 py-2.5 rounded-xl glass-btn-primary text-slate-950 font-bold text-xs shadow-md transition disabled:opacity-50 shrink-0 cursor-pointer active:scale-95"
            >
              {claiming ? 'Verifying...' : 'Redeem'}
            </button>
          </div>
        </div>
      </div>

      {/* Active Promotion Campaigns List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {campaigns.length === 0 ? (
          <div className="col-span-2 text-center py-12 text-slate-400 text-xs glass-card border border-white/10 rounded-3xl">
            No active promotional campaigns currently.
          </div>
        ) : (
          campaigns.map((camp) => (
            <div
              key={camp.id}
              className="rounded-3xl border border-white/10 glass-card overflow-hidden shadow-2xl flex flex-col justify-between group hover:border-white/20 transition-all duration-300"
            >
              <div className="relative h-48 overflow-hidden bg-slate-950">
                <img
                  src={camp.bannerUrl}
                  alt={camp.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent" />
                <div className="absolute top-3.5 left-3.5 bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 text-xs font-black px-3.5 py-1 rounded-full shadow-lg">
                  Bonus: ৳{camp.rewardAmount} TK
                </div>
              </div>

              <div className="p-5 sm:p-6 space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-purple-300 transition-colors">{camp.title}</h3>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">{camp.description}</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-amber-300" />
                    <span className="text-xs font-mono font-bold text-white tracking-wider">{camp.code}</span>
                  </div>
                  <button
                    onClick={() => handleClaimPromo(camp.code)}
                    className="text-xs font-bold text-amber-300 hover:text-amber-200 flex items-center gap-1 cursor-pointer transition"
                  >
                    Claim ৳{camp.rewardAmount} <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
