import React, { useState, useEffect } from 'react';
import {
  Package as PackageIcon,
  Plus,
  Trash2,
  Edit2,
  CheckCircle,
  XCircle,
  Sparkles,
  TrendingUp,
  Clock,
  Tv,
  Coins,
  Shield,
  Star,
  AlertCircle,
  X,
  Layers,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { Package } from '../../types';

export function PackagesTab() {
  const { showToast } = useToast();
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingPkg, setEditingPkg] = useState<Package | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [price, setPrice] = useState<number>(1000);
  const [dailyIncome, setDailyIncome] = useState<number>(100);
  const [videosPerDay, setVideosPerDay] = useState<number>(5);
  const [validityDays, setValidityDays] = useState<number>(365);
  const [badgeColor, setBadgeColor] = useState('emerald');
  const [enabled, setEnabled] = useState(true);
  const [isPopular, setIsPopular] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchPackages = async () => {
    try {
      setLoading(true);
      const res = await apiRequest('/api/admin/packages');
      if (res && res.packages) {
        setPackages(res.packages);
      }
    } catch (err: any) {
      showToast('error', 'Failed to Load', err.message || 'Could not fetch package list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPackages();
  }, []);

  const openCreateModal = () => {
    setEditingPkg(null);
    setName('');
    setPrice(1000);
    setDailyIncome(100);
    setVideosPerDay(5);
    setValidityDays(365);
    setBadgeColor('emerald');
    setEnabled(true);
    setIsPopular(false);
    setShowModal(true);
  };

  const openEditModal = (pkg: Package) => {
    setEditingPkg(pkg);
    setName(pkg.name);
    setPrice(pkg.price);
    setDailyIncome(pkg.dailyIncome);
    setVideosPerDay(pkg.videosPerDay);
    setValidityDays(pkg.validityDays || 365);
    setBadgeColor(pkg.badgeColor || 'emerald');
    setEnabled(pkg.enabled);
    setIsPopular(Boolean(pkg.isPopular));
    setShowModal(true);
  };

  const handleSavePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('error', 'Validation Error', 'Package name is required.');
      return;
    }

    if (price <= 0 && editingPkg?.id !== 'pkg_trial') {
      showToast('error', 'Validation Error', 'Package price must be greater than 0 TK.');
      return;
    }

    if (dailyIncome <= 0 || videosPerDay <= 0) {
      showToast('error', 'Validation Error', 'Daily income and videos count must be greater than 0.');
      return;
    }

    try {
      setSaving(true);
      if (editingPkg) {
        await apiRequest(`/api/admin/packages/${editingPkg.id}/update`, {
          method: 'POST',
          body: JSON.stringify({
            name,
            price,
            dailyIncome,
            videosPerDay,
            validityDays,
            badgeColor,
            enabled,
            isPopular,
          }),
        });
        showToast('success', 'Package Updated', `"${name}" package updated successfully.`);
      } else {
        await apiRequest('/api/admin/packages', {
          method: 'POST',
          body: JSON.stringify({
            name,
            price,
            dailyIncome,
            videosPerDay,
            validityDays,
            badgeColor,
            enabled,
            isPopular,
          }),
        });
        showToast('success', 'Package Created', `New package "${name}" created live.`);
      }
      setShowModal(false);
      fetchPackages();
    } catch (err: any) {
      showToast('error', 'Save Failed', err.message || 'Could not save package.');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePackage = async (id: string, currentStatus: boolean, pkgName: string) => {
    try {
      await apiRequest(`/api/admin/packages/${id}/toggle`, { method: 'POST' });
      showToast('success', 'Status Changed', `${pkgName} is now ${!currentStatus ? 'Active' : 'Disabled'}.`);
      fetchPackages();
    } catch (err: any) {
      showToast('error', 'Toggle Failed', err.message || 'Failed to toggle package status.');
    }
  };

  const handleDeletePackage = async (id: string, pkgName: string) => {
    if (id === 'pkg_trial') {
      showToast('error', 'Action Restricted', 'Cannot delete the base Free Trial package.');
      return;
    }

    if (!confirm(`Are you sure you want to permanently delete "${pkgName}"? Users with this package will need re-assignment.`)) {
      return;
    }

    try {
      await apiRequest(`/api/admin/packages/${id}`, { method: 'DELETE' });
      showToast('success', 'Package Deleted', `"${pkgName}" was removed from the database.`);
      fetchPackages();
    } catch (err: any) {
      showToast('error', 'Delete Failed', err.message || 'Could not delete package.');
    }
  };

  // Color mapping helpers
  const getColorClasses = (color: string) => {
    switch (color) {
      case 'amber':
        return {
          badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
          accent: 'from-amber-500/20 to-amber-900/10',
          border: 'border-amber-500/30',
          text: 'text-amber-400',
        };
      case 'cyan':
        return {
          badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
          accent: 'from-cyan-500/20 to-cyan-900/10',
          border: 'border-cyan-500/30',
          text: 'text-cyan-400',
        };
      case 'purple':
        return {
          badge: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
          accent: 'from-purple-500/20 to-purple-900/10',
          border: 'border-purple-500/30',
          text: 'text-purple-400',
        };
      case 'rose':
        return {
          badge: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
          accent: 'from-rose-500/20 to-rose-900/10',
          border: 'border-rose-500/30',
          text: 'text-rose-400',
        };
      case 'indigo':
        return {
          badge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
          accent: 'from-indigo-500/20 to-indigo-900/10',
          border: 'border-indigo-500/30',
          text: 'text-indigo-400',
        };
      default:
        return {
          badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
          accent: 'from-emerald-500/20 to-emerald-900/10',
          border: 'border-emerald-500/30',
          text: 'text-emerald-400',
        };
    }
  };

  const calculatedPerVideo = videosPerDay > 0 ? (dailyIncome / videosPerDay).toFixed(2) : '0';
  const calculatedTotalYield = dailyIncome * validityDays;

  return (
    <div className="space-y-6">
      {/* Header & Stats Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-6 rounded-3xl shadow-xl">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
              <PackageIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                VIP Investment Packages Control (প্যাকেজ ম্যানেজমেন্ট)
              </h3>
              <p className="text-xs text-slate-400">
                Create, customize, price, and activate VIP tiers. Members purchase packages via wallet balance.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 active:scale-95 transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>+ Create New VIP Package</span>
        </button>
      </div>

      {/* Summary KPI Mini Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase">Total Packages</span>
          <p className="text-xl font-black text-white mt-1">{packages.length}</p>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase">Active Packages</span>
          <p className="text-xl font-black text-emerald-400 mt-1">
            {packages.filter((p) => p.enabled).length}
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase">Max Daily Yield</span>
          <p className="text-xl font-black text-amber-400 mt-1">
            ৳{Math.max(...packages.map((p) => p.dailyIncome || 0), 0).toLocaleString()}
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase">Top Tier Price</span>
          <p className="text-xl font-black text-cyan-400 mt-1">
            ৳{Math.max(...packages.map((p) => p.price || 0), 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Packages Grid */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 bg-slate-900/50 rounded-3xl border border-slate-800">
          <div className="inline-block animate-spin w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full mb-3" />
          <p className="text-xs">Loading package configurations...</p>
        </div>
      ) : packages.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-slate-900 rounded-3xl border border-slate-800 space-y-3">
          <PackageIcon className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-sm font-medium">No packages found.</p>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
          >
            Create Your First Package
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {packages.map((pkg) => {
            const styles = getColorClasses(pkg.badgeColor || 'emerald');
            const isTrial = pkg.id === 'pkg_trial';

            return (
              <div
                key={pkg.id}
                className={`relative rounded-3xl bg-slate-900/90 border ${
                  pkg.isPopular ? 'border-amber-500/50 shadow-amber-500/5 shadow-xl' : 'border-slate-800'
                } p-6 flex flex-col justify-between transition-all hover:border-slate-700 space-y-5`}
              >
                {/* Header row */}
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-black uppercase tracking-wider px-3 py-1 rounded-xl border ${styles.badge}`}>
                        {pkg.name}
                      </span>
                      {pkg.isPopular && (
                        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          <Star className="w-3 h-3 fill-amber-400" />
                          POPULAR
                        </span>
                      )}
                    </div>

                    {/* Status Toggle */}
                    <button
                      onClick={() => handleTogglePackage(pkg.id, pkg.enabled, pkg.name)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition border cursor-pointer ${
                        pkg.enabled
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20'
                      }`}
                    >
                      {pkg.enabled ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>ACTIVE</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5" />
                          <span>DISABLED</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Price & Primary Stats */}
                  <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-slate-400">Package Price</span>
                      <div className="text-right">
                        <span className="text-2xl font-black text-white font-mono">
                          ৳{pkg.price.toLocaleString()}
                        </span>
                        {isTrial && <span className="text-[10px] text-amber-400 block">Free Registration</span>}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                        <span className="text-[10px] text-slate-400 block">Daily Income</span>
                        <strong className="text-sm font-bold text-emerald-400 font-mono">
                          ৳{pkg.dailyIncome.toLocaleString()}
                        </strong>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                        <span className="text-[10px] text-slate-400 block">Daily Tasks</span>
                        <strong className="text-sm font-bold text-cyan-400 font-mono">
                          {pkg.videosPerDay} Videos/day
                        </strong>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-300 pt-1">
                      <div className="flex justify-between text-slate-400">
                        <span>Income Per Task:</span>
                        <span className="font-bold text-white font-mono">
                          ৳{(pkg.incomePerVideo || pkg.dailyIncome / (pkg.videosPerDay || 1)).toFixed(2)} TK
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Plan Validity:</span>
                        <span className="font-bold text-emerald-400 font-mono">
                          Lifetime (মেয়াদহীন)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="pt-4 border-t border-slate-800 flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(pkg)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Edit Package</span>
                  </button>

                  {!isTrial && (
                    <button
                      onClick={() => handleDeletePackage(pkg.id, pkg.name)}
                      title="Delete Package"
                      className="p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE / EDIT PACKAGE MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <PackageIcon className="w-5 h-5 text-amber-400" />
                  {editingPkg ? `Edit "${editingPkg.name}" Package` : 'Create New VIP Package'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure package pricing, daily earning limits, and video tasks.
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePackage} className="space-y-4">
              {/* Package Name */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Package Name (প্যাকেজের নাম)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bronze VIP, Silver VIP, Gold VIP, Diamond Tier"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-semibold focus:border-amber-500 outline-none"
                />
              </div>

              {/* Price and Validity */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Price in BDT (মূল্য ৳)
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    placeholder="e.g. 1000"
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-mono font-bold focus:border-amber-500 outline-none"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Paid using member's wallet balance</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Plan Duration (মেয়াদের ধরণ)
                  </label>
                  <div className="w-full px-4 py-2.5 bg-slate-950/80 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs font-bold flex items-center justify-between">
                    <span>Lifetime Access (মেয়াদহীন)</span>
                    <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">No Expiry</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">All packages have unlimited lifetime access</span>
                </div>
              </div>

              {/* Daily Income & Videos Per Day */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Daily Total Income (দৈনিক আয় ৳)
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    placeholder="e.g. 100"
                    value={dailyIncome}
                    onChange={(e) => setDailyIncome(Number(e.target.value))}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-emerald-400 text-xs font-mono font-bold focus:border-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Daily Tasks / Videos Count
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    required
                    placeholder="e.g. 5"
                    value={videosPerDay}
                    onChange={(e) => setVideosPerDay(Number(e.target.value))}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-cyan-400 text-xs font-mono font-bold focus:border-cyan-500 outline-none"
                  />
                </div>
              </div>

              {/* Auto Calculated Preview Card */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Calculated Per Video Reward:</span>
                  <strong className="text-amber-400 font-mono">৳{calculatedPerVideo} TK / video</strong>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Total Calculated Yield (Validity):</span>
                  <strong className="text-emerald-400 font-mono">৳{calculatedTotalYield.toLocaleString()} TK</strong>
                </div>
              </div>

              {/* Badge Color & Options */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Badge Theme Color
                  </label>
                  <select
                    value={badgeColor}
                    onChange={(e) => setBadgeColor(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-semibold focus:border-amber-500 outline-none"
                  >
                    <option value="emerald">Emerald Green (Standard)</option>
                    <option value="amber">Amber Gold (VIP / Premium)</option>
                    <option value="cyan">Cyan Blue (Modern / Tech)</option>
                    <option value="purple">Purple (Royal / Elite)</option>
                    <option value="rose">Rose Red (Special Edition)</option>
                    <option value="indigo">Indigo (Corporate)</option>
                  </select>
                </div>

                <div className="flex flex-col justify-end space-y-2">
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPopular}
                      onChange={(e) => setIsPopular(e.target.checked)}
                      className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 w-4 h-4 bg-slate-950"
                    />
                    <span className="font-semibold">Mark as "Popular / Best Value"</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => setEnabled(e.target.checked)}
                      className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 w-4 h-4 bg-slate-950"
                    />
                    <span className="font-semibold">Active & Available for Purchase</span>
                  </label>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 active:scale-95 transition cursor-pointer"
                >
                  {saving ? 'Saving Package...' : editingPkg ? 'Update Package' : 'Create Package Live'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
