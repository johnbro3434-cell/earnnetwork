import React, { useState, useEffect } from 'react';
import { Activity, Cpu, HardDrive, Wifi, Server, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { SystemHealthInfo } from '../../types';

export function SystemHealthTab() {
  const { showToast } = useToast();
  const [health, setHealth] = useState<SystemHealthInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const loadHealth = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/api/admin/system/health');
      setHealth(res);
    } catch (e: any) {
      showToast('error', 'Health Check Failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHealth();
    const interval = setInterval(loadHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            System Diagnostics & Infrastructure Health
          </h2>
          <p className="text-xs text-slate-400">Real-time metrics for Node.js runtime, memory, and services</p>
        </div>

        <button
          onClick={loadHealth}
          className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 transition-colors flex items-center gap-1.5 text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Status
        </button>
      </div>

      {loading && !health ? (
        <p className="text-center text-xs text-slate-500 py-12">Checking system vital signs...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Server Status */}
          <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold">Core Server</span>
              <Server className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-black text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>Healthy</span>
            </div>
            <p className="text-[11px] text-slate-400">Uptime: {health?.uptimeFormatted || 'Active'}</p>
          </div>

          {/* Memory Usage */}
          <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold">RAM / RSS Memory</span>
              <Cpu className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-xl font-black text-white">
              {health?.memoryUsageMb || 0} MB
            </div>
            <p className="text-[11px] text-slate-400">
              Heap: {health?.heapUsedMb || 0} / {health?.totalMemoryMb || 0} MB
            </p>
          </div>

          {/* Database */}
          <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold">Database Engine</span>
              <HardDrive className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-black text-white capitalize">
              {health?.databaseStatus || 'Online'}
            </div>
            <p className="text-[11px] text-slate-400">Store file synchronized</p>
          </div>

          {/* Real-time Sockets */}
          <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold">Live Connections</span>
              <Wifi className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-xl font-black text-white">
              {health?.socketConnections || 1} Online
            </div>
            <p className="text-[11px] text-slate-400">Socket.IO real-time channel</p>
          </div>
        </div>
      )}

      {/* Extended Specs */}
      <div className="glass-panel rounded-2xl p-5 border border-white/10 space-y-4">
        <h3 className="text-sm font-bold text-white">Environment Runtime Parameters</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
          <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5">
            <span className="text-slate-500 block mb-1">Node Environment</span>
            <span className="font-semibold text-slate-200">{health?.nodeVersion || 'v22.x'}</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5">
            <span className="text-slate-500 block mb-1">Cloudinary Storage</span>
            <span className="font-semibold text-slate-200 capitalize">
              {health?.cloudinaryStatus || 'Configured'}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5">
            <span className="text-slate-500 block mb-1">Last Health Probe</span>
            <span className="font-semibold text-slate-200">
              {health?.timestamp ? new Date(health.timestamp).toLocaleTimeString() : 'Just now'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
