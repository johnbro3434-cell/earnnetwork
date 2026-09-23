import React, { useState, useEffect } from 'react';
import { AlertOctagon, ShieldAlert, Monitor, UserX, RefreshCw, Smartphone, CheckCircle } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

export function FraudDashboardTab() {
  const { showToast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadFraudData = async () => {
    setLoading(true);
    try {
      const [f1, f2] = await Promise.allSettled([
        apiRequest('/api/admin/fraud-dashboard'),
        apiRequest('/api/admin/fraud/dashboard'),
      ]);

      let combined: any = {};
      if (f1.status === 'fulfilled') {
        combined = { ...combined, ...f1.value };
      }
      if (f2.status === 'fulfilled') {
        combined = { ...combined, ...f2.value };
      }
      setData(combined);
    } catch (e: any) {
      showToast('error', 'Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFraudData();
  }, []);

  const deviceRecords = data?.deviceRecords || [];
  const multiAccount = data?.multiAccountDevices || [];
  const duplicateTrx = data?.duplicateTrxLogs || [];
  const failedVerifications = data?.failedVerifications || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-500" />
            Anti-Fraud & Multi-Account Shield
          </h2>
          <p className="text-xs text-slate-400">
            Hardware fingerprint tracking, duplicate TrxID detection, and sybil prevention
          </p>
        </div>

        <button
          onClick={loadFraudData}
          className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 transition-colors flex items-center gap-1.5 text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Audit Now
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-2xl border border-white/10 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Tracked Devices</span>
            <Monitor className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-white">{deviceRecords.length}</div>
          <p className="text-[11px] text-slate-400">Unique browser fingerprints</p>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-white/10 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Multi-Account Clones</span>
            <AlertOctagon className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-rose-400">{multiAccount.length}</div>
          <p className="text-[11px] text-rose-300/80">Devices with &gt;1 account</p>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-white/10 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Reused TrxID Flags</span>
            <ShieldAlert className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400">{duplicateTrx.length}</div>
          <p className="text-[11px] text-slate-400">Intercepted replay attacks</p>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-white/10 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Trial Cashouts</span>
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white">
            {data?.trialWithdrawalCount || 0}
          </div>
          <p className="text-[11px] text-slate-400">One-per-device enforced</p>
        </div>
      </div>

      {/* Multi-Account Device Table */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-white/10">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Sybil Cluster / Shared Fingerprints</h3>
          <span className="text-xs text-slate-400">{multiAccount.length} suspicious devices</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-white/10">
              <tr>
                <th className="px-4 py-3">Fingerprint Hash</th>
                <th className="px-4 py-3">Accounts Linked</th>
                <th className="px-4 py-3">Trial Claimed</th>
                <th className="px-4 py-3">Last Seen IP</th>
                <th className="px-4 py-3 text-right">Risk Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Scanning biometric fingerprints...
                  </td>
                </tr>
              ) : multiAccount.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-emerald-400/80">
                    No multi-account device rings detected. Security parameters normal.
                  </td>
                </tr>
              ) : (
                multiAccount.map((rec: any, idx: number) => (
                  <tr key={idx} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-mono text-slate-300">{rec.fingerprint}</td>
                    <td className="px-4 py-3 text-rose-300 font-bold">
                      {(rec.associatedUserIds || []).length} accounts
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {rec.trialWithdrawalCompleted ? 'Yes (Locked)' : 'No'}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400">{rec.lastSeenIp || '103.x'}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 font-bold text-[10px]">
                        HIGH RISK
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
