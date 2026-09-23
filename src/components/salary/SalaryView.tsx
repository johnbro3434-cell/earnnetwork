import React, { useState, useEffect } from 'react';
import { Award, CheckCircle2, TrendingUp, ShieldCheck, ChevronRight, Calendar } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../lib/api';

export function SalaryView() {
  const { user, wallet } = useAuth();
  const [teamStats, setTeamStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest('/api/referral/team')
      .then((res) => setTeamStats(res))
      .catch((e) => console.warn(e))
      .finally(() => setLoading(false));
  }, []);

  const activeLevelACount = teamStats?.levelA?.filter((m: any) => m.hasActivePackage)?.length || 0;

  const ranks = [
    {
      title: 'Manager',
      salary: 4000,
      reqActiveLevelA: 10,
      desc: '10 Level A Active Paid Members',
      badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    },
    {
      title: 'Middle Manager',
      salary: 12000,
      reqActiveLevelA: 25,
      desc: '25 Level A Active Paid Members',
      badge: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    },
    {
      title: 'Senior Manager',
      salary: 30000,
      reqActiveLevelA: 50,
      desc: '50 Level A Active Paid Members',
      badge: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    },
    {
      title: 'VIP',
      salary: 75000,
      reqActiveLevelA: 100,
      desc: '100 Level A Active Paid Members',
      badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    },
  ];

  return (
    <div id="salary-view-root" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 pb-24 md:pb-12">
      {/* Header Info */}
      <div className="p-6 sm:p-7 rounded-3xl glass-panel border border-white/10 shadow-2xl space-y-5 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-44 h-44 bg-teal-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-44 h-44 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
              Automated Monthly Salaries
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-white">Manager Salary System</h2>
            <p className="text-xs text-slate-300">
              Salaries are calculated automatically on the 1st of every month at 12:00 AM and credited directly to your wallet balance.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 text-right shrink-0">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Your Current Rank</span>
            <span className="text-base font-black text-teal-300">{user?.role || 'Member'}</span>
          </div>
        </div>

        {/* Level A Active Progress Bar */}
        <div className="p-4.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2.5 relative z-10">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-200">Level A Active Paid Referrals</span>
            <span className="font-mono font-bold text-teal-300 bg-teal-500/15 px-2 py-0.5 rounded-md border border-teal-500/30">{activeLevelACount} Active</span>
          </div>
          <div className="w-full h-3 bg-white/[0.08] rounded-full overflow-hidden p-0.5 border border-white/10">
            <div
              className="h-full bg-gradient-to-r from-teal-400 via-emerald-400 to-cyan-400 rounded-full transition-all duration-500 shadow-[0_0_12px_rgba(20,184,166,0.5)]"
              style={{ width: `${Math.min(100, (activeLevelACount / 100) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Salary Tiers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {ranks.map((rank) => {
          const isQualified = activeLevelACount >= rank.reqActiveLevelA;
          const progressPercent = Math.min(100, Math.round((activeLevelACount / rank.reqActiveLevelA) * 100));

          return (
            <div
              key={rank.title}
              className={`p-6 rounded-3xl border shadow-2xl flex flex-col justify-between transition-all duration-300 relative overflow-hidden ${
                isQualified
                  ? 'glass-card border-teal-400/50 bg-teal-500/15 text-white shadow-teal-950/30 ring-1 ring-teal-400/30'
                  : 'glass-panel border-white/10 text-slate-300 hover:border-white/20 hover:bg-white/[0.05]'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${rank.badge}`}>
                    {rank.title}
                  </span>
                  {isQualified ? (
                    <span className="text-xs font-bold text-emerald-300 flex items-center gap-1 bg-emerald-500/20 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                      <CheckCircle2 className="w-4 h-4" /> Qualified
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 font-medium">
                      {rank.reqActiveLevelA - activeLevelACount} More Needed
                    </span>
                  )}
                </div>

                <div>
                  <span className="text-xs text-slate-400 block">Monthly Base Salary</span>
                  <span className="text-3xl font-black text-white">৳ {rank.salary.toLocaleString()} TK</span>
                  <span className="text-xs text-slate-400 block mt-1">Credited every 1st of the month</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300">{rank.desc}</span>
                    <span className="font-bold text-white font-mono">{progressPercent}%</span>
                  </div>
                  <div className="w-full h-2 bg-white/[0.08] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-teal-400 to-cyan-400 rounded-full transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between text-xs text-slate-400 border-t border-white/[0.08] mt-4">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <Calendar className="w-3.5 h-3.5 text-teal-400" />
                  Auto-Dispatched on 1st
                </span>
                <span className="text-teal-300 font-semibold">Direct Wallet Credit</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
