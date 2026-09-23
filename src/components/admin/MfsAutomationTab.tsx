import React, { useState, useEffect } from 'react';
import { Smartphone, RefreshCw, CheckCircle, AlertTriangle, Play, Shield, Key, Download } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

export function MfsAutomationTab() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Simulation form
  const [simSender, setSimSender] = useState('bKash');
  const [simBody, setSimBody] = useState(
    'You have received Tk 1,000.00 from 01712345678. Ref: EHBD. TrxID 9K8L7M6N5P at 23/09/2026 12:30.'
  );

  const loadAll = async () => {
    setLoading(true);
    try {
      const [settingsRes, txRes, devRes] = await Promise.allSettled([
        apiRequest('/api/admin/mfs/settings'),
        apiRequest('/api/admin/sms/transactions'),
        apiRequest('/api/admin/verify-app/devices'),
      ]);

      if (settingsRes.status === 'fulfilled') {
        setSettings(settingsRes.value.settings || settingsRes.value);
      }
      if (txRes.status === 'fulfilled') {
        setTransactions(Array.isArray(txRes.value) ? txRes.value : txRes.value.transactions || []);
      }
      if (devRes.status === 'fulfilled') {
        setDevices(Array.isArray(devRes.value) ? devRes.value : devRes.value.devices || []);
      }
    } catch (e: any) {
      showToast('error', 'Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleUpdateSettings = async (field: string, value: any) => {
    try {
      const updated = { ...settings, [field]: value };
      await apiRequest('/api/admin/mfs/settings', {
        method: 'POST',
        body: JSON.stringify(updated),
      });
      setSettings(updated);
      showToast('success', 'Settings Saved', 'MFS gateway settings updated.');
    } catch (e: any) {
      showToast('error', 'Failed', e.message);
    }
  };

  const handleSimulateSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simBody.trim()) return;

    try {
      const res = await apiRequest('/api/admin/sms/simulate', {
        method: 'POST',
        body: JSON.stringify({ sender: simSender, body: simBody.trim() }),
      });
      showToast('success', 'Simulation Complete', res.message || 'SMS parsed and matched successfully.');
      loadAll();
    } catch (e: any) {
      showToast('error', 'Simulation Failed', e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-emerald-400" />
            bKash / Nagad MFS Auto-Verification Engine
          </h2>
          <p className="text-xs text-slate-400">
            Automated SMS synchronization via Android listener and zero-latency TrxID ledger
          </p>
        </div>

        <button
          onClick={loadAll}
          className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 transition-colors flex items-center gap-1.5 text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Sync Data
        </button>
      </div>

      {/* Control Switchboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel p-4 rounded-2xl border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-white block">Automatic Deposit Verification</span>
            <span className="text-[11px] text-slate-400">Match TrxID and fund wallet instantly</span>
          </div>
          <button
            onClick={() =>
              handleUpdateSettings('autoVerificationEnabled', !settings?.autoVerificationEnabled)
            }
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              settings?.autoVerificationEnabled
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {settings?.autoVerificationEnabled ? 'Active' : 'Disabled'}
          </button>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-white block">Manual Review Fallback</span>
            <span className="text-[11px] text-slate-400">Send unparsed SMS to admin approval queue</span>
          </div>
          <button
            onClick={() =>
              handleUpdateSettings('fallbackManualReview', !settings?.fallbackManualReview)
            }
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              settings?.fallbackManualReview
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {settings?.fallbackManualReview ? 'Active' : 'Disabled'}
          </button>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-white block">Android APK Listener Sync</span>
            <span className="text-[11px] text-slate-400">Accept live SMS push from verified phone</span>
          </div>
          <button
            onClick={() => handleUpdateSettings('enableDeviceSync', !settings?.enableDeviceSync)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              settings?.enableDeviceSync
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {settings?.enableDeviceSync ? 'Active' : 'Disabled'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Simulator Panel */}
        <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Play className="w-4 h-4 text-emerald-400" />
              Simulate MFS Incoming SMS
            </h3>
            <span className="text-[10px] text-slate-400 font-medium">Test Regex & Engine</span>
          </div>

          <form onSubmit={handleSimulateSms} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">MFS Sender Tag</label>
              <select
                value={simSender}
                onChange={e => setSimSender(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none"
              >
                <option value="bKash">bKash (16247)</option>
                <option value="NAGAD">NAGAD (16167)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Raw SMS Content</label>
              <textarea
                rows={3}
                value={simBody}
                onChange={e => setSimBody(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none resize-none font-mono"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Dispatch & Run Parsing Algorithm
            </button>
          </form>
        </div>

        {/* Connected Android Listeners */}
        <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-cyan-400" />
              Active Verification Gateways (Phones)
            </h3>
            <a
              href="/downloads/EarnNetworkVerify.apk"
              download
              className="text-[11px] text-emerald-400 hover:underline inline-flex items-center gap-1"
            >
              <Download className="w-3 h-3" />
              Download APK
            </a>
          </div>

          <div className="space-y-2 max-h-[220px] overflow-y-auto">
            {devices.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                No Android listener devices connected. Install EarnNetworkVerify.apk to stream SMS.
              </p>
            ) : (
              devices.map((dev: any) => (
                <div
                  key={dev.id}
                  className="p-3 rounded-xl bg-slate-900/60 border border-white/5 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-bold text-white block">{dev.deviceName || 'Android Device'}</span>
                    <span className="text-[10px] text-slate-400">
                      Last ping: {new Date(dev.lastSeenAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      dev.status === 'online'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    {dev.status || 'Active'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Captured SMS Table */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-white/10">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Parsed SMS Inbound Stream</h3>
          <span className="text-xs text-slate-400">{transactions.length} total messages</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-white/10">
              <tr>
                <th className="px-4 py-3">Gateway</th>
                <th className="px-4 py-3">Sender Phone</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">TrxID</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Received At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Loading SMS transactions...
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No SMS transactions captured yet.
                  </td>
                </tr>
              ) : (
                transactions.map((tx: any) => (
                  <tr key={tx.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-semibold text-white">{tx.method || tx.sender}</td>
                    <td className="px-4 py-3 text-slate-300">{tx.senderNumber || tx.phone}</td>
                    <td className="px-4 py-3 font-bold text-emerald-400">৳{tx.amount}</td>
                    <td className="px-4 py-3 font-mono text-slate-300">{tx.transactionId}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          tx.status === 'matched' || tx.status === 'processed'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-amber-500/10 text-amber-400'
                        }`}
                      >
                        {tx.status || 'Captured'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">
                      {new Date(tx.createdAt || tx.timestamp).toLocaleTimeString()}
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
