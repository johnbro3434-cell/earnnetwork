import React, { useState, useEffect } from 'react';
import {
  Award,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Users,
  RefreshCw,
  DollarSign,
  TrendingUp,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  UserCheck,
  Eye,
  Settings,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { SalaryTier, User } from '../../types';

interface SalaryStats {
  tiers: SalaryTier[];
  eligibleCount: number;
  totalMonthlyLiability: number;
  eligibleUsers: Array<{
    userId: string;
    phone: string;
    role?: string;
    tierId?: string;
    tierTitle?: string;
    salaryAmount: number;
    directPaidCount: number;
    totalTeamPaidCount: number;
    directTotalCount: number;
    effectiveCount: number;
  }>;
}

interface SalaryManagerTabProps {
  onInspectUser?: (userIdOrPhone: string) => void;
}

export function SalaryManagerTab({ onInspectUser }: SalaryManagerTabProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [distributingSalary, setDistributingSalary] = useState(false);
  const [stats, setStats] = useState<SalaryStats | null>(null);

  // Edit / Add Tier modal state
  const [editingTier, setEditingTier] = useState<SalaryTier | null>(null);
  const [isNewTier, setIsNewTier] = useState(false);
  const [showEligibleList, setShowEligibleList] = useState(false);
  const [confirmDistributeModal, setConfirmDistributeModal] = useState(false);

  // Form State
  const [formRoleName, setFormRoleName] = useState('');
  const [formRequiredReferrals, setFormRequiredReferrals] = useState(10);
  const [formReferralType, setFormReferralType] = useState<'direct_paid' | 'total_paid' | 'direct_all'>('direct_paid');
  const [formSalaryAmount, setFormSalaryAmount] = useState(5000);
  const [formBadgeColor, setFormBadgeColor] = useState<'amber' | 'cyan' | 'purple' | 'emerald' | 'rose' | 'blue' | 'yellow' | 'indigo'>('amber');
  const [formDescription, setFormDescription] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);

  const loadSalaryData = async () => {
    try {
      setLoading(true);
      const res = await apiRequest('/api/admin/salary/tiers');
      if (res && res.success) {
        setStats(res);
      }
    } catch (e: any) {
      showToast('error', 'Error loading salary data', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSalaryData();
  }, []);

  const handleOpenAddTier = () => {
    const nextTierNum = (stats?.tiers.length || 0) + 1;
    setEditingTier(null);
    setIsNewTier(true);
    setFormRoleName(`Tier ${nextTierNum}: Leader Rank`);
    setFormRequiredReferrals(nextTierNum * 15);
    setFormReferralType('direct_paid');
    setFormSalaryAmount(nextTierNum * 6000);
    setFormBadgeColor('cyan');
    setFormDescription(`Min ${nextTierNum * 15} Active Paid Members`);
    setFormIsActive(true);
  };

  const handleOpenEditTier = (tier: SalaryTier) => {
    setEditingTier(tier);
    setIsNewTier(false);
    setFormRoleName(tier.roleName);
    setFormRequiredReferrals(tier.requiredReferrals);
    setFormReferralType(tier.referralType || 'direct_paid');
    setFormSalaryAmount(tier.salaryAmount);
    setFormBadgeColor((tier.badgeColor as any) || 'amber');
    setFormDescription(tier.description || '');
    setFormIsActive(tier.isActive !== false);
  };

  const handleSaveTier = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      if (isNewTier) {
        await apiRequest('/api/admin/salary/tiers', {
          method: 'POST',
          body: JSON.stringify({
            roleName: formRoleName,
            requiredReferrals: Number(formRequiredReferrals),
            referralType: formReferralType,
            salaryAmount: Number(formSalaryAmount),
            badgeColor: formBadgeColor,
            description: formDescription,
            isActive: formIsActive,
          }),
        });
        showToast('success', 'Salary Tier Created', `Tier ${formRoleName} added successfully.`);
      } else if (editingTier) {
        await apiRequest(`/api/admin/salary/tiers/${editingTier.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            roleName: formRoleName,
            requiredReferrals: Number(formRequiredReferrals),
            referralType: formReferralType,
            salaryAmount: Number(formSalaryAmount),
            badgeColor: formBadgeColor,
            description: formDescription,
            isActive: formIsActive,
          }),
        });
        showToast('success', 'Salary Tier Updated', `Tier ${formRoleName} updated successfully.`);
      }

      setEditingTier(null);
      setIsNewTier(false);
      await loadSalaryData();
    } catch (e: any) {
      showToast('error', 'Failed to save tier', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTier = async (tier: SalaryTier) => {
    if (!window.confirm(`Are you sure you want to delete "${tier.roleName}"?`)) return;
    try {
      await apiRequest(`/api/admin/salary/tiers/${tier.id}`, { method: 'DELETE' });
      showToast('success', 'Tier Deleted', `Salary tier removed.`);
      await loadSalaryData();
    } catch (e: any) {
      showToast('error', 'Delete Failed', e.message);
    }
  };

  const handleToggleActive = async (tier: SalaryTier) => {
    try {
      await apiRequest(`/api/admin/salary/tiers/${tier.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !tier.isActive }),
      });
      showToast('info', 'Status Updated', `${tier.roleName} is now ${!tier.isActive ? 'Active' : 'Disabled'}`);
      await loadSalaryData();
    } catch (e: any) {
      showToast('error', 'Update Failed', e.message);
    }
  };

  const handleRunDistribution = async () => {
    try {
      setDistributingSalary(true);
      const res = await apiRequest('/api/admin/salary/distribute', { method: 'POST' });
      showToast('success', 'Salary Distributed', res.message || 'Salaries successfully credited to all leaders.');
      setConfirmDistributeModal(false);
      await loadSalaryData();
    } catch (e: any) {
      showToast('error', 'Distribution Failed', e.message);
    } finally {
      setDistributingSalary(false);
    }
  };

  const getBadgeColorClass = (color?: string) => {
    switch (color) {
      case 'amber':
        return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
      case 'cyan':
        return 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10';
      case 'purple':
        return 'text-purple-400 border-purple-500/30 bg-purple-500/10';
      case 'emerald':
        return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
      case 'rose':
        return 'text-rose-400 border-rose-500/30 bg-rose-500/10';
      case 'blue':
        return 'text-blue-400 border-blue-500/30 bg-blue-500/10';
      case 'indigo':
        return 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10';
      default:
        return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
    }
  };

  const getTitleColorClass = (color?: string) => {
    switch (color) {
      case 'amber':
        return 'text-amber-400';
      case 'cyan':
        return 'text-cyan-400';
      case 'purple':
        return 'text-purple-400';
      case 'emerald':
        return 'text-emerald-400';
      case 'rose':
        return 'text-rose-400';
      case 'blue':
        return 'text-blue-400';
      case 'indigo':
        return 'text-indigo-400';
      default:
        return 'text-amber-400';
    }
  };

  const getReferralTypeLabel = (type?: string) => {
    switch (type) {
      case 'total_paid':
        return 'Total Team Paid (A+B+C)';
      case 'direct_all':
        return 'Direct Total Registered';
      case 'direct_paid':
      default:
        return 'Direct Active Paid Members';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                Monthly Salary Manager (মাসিক বেতন)
              </h3>
              <p className="text-xs text-slate-400">
                Configure required referral thresholds, role titles, and monthly payout amounts for team leaders.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleOpenAddTier}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-950/40 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Salary Tier</span>
            </button>

            <button
              onClick={loadSalaryData}
              disabled={loading}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              title="Refresh Salary Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Stats Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Active Salary Tiers</span>
            <span className="text-2xl font-black text-white mt-1 block">
              {stats?.tiers.filter((t) => t.isActive !== false).length || 0} Tiers
            </span>
            <span className="text-[11px] text-slate-400">Configured leadership payout levels</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Qualifying Leaders</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl font-black text-amber-400">
                {stats?.eligibleCount || 0} Leaders
              </span>
              <button
                onClick={() => setShowEligibleList(!showEligibleList)}
                className="text-xs font-bold text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                {showEligibleList ? 'Hide List' : 'View List'}
                {showEligibleList ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
            <span className="text-[11px] text-slate-400">Users meeting referral requirements</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Estimated Monthly Liability</span>
            <span className="text-2xl font-black text-emerald-400 mt-1 block">
              ৳{(stats?.totalMonthlyLiability || 0).toLocaleString()}
            </span>
            <span className="text-[11px] text-slate-400">Total monthly salary distribution cost</span>
          </div>
        </div>
      </div>

      {/* Eligible Leaders Review Table (Collapsible) */}
      {showEligibleList && stats?.eligibleUsers && (
        <div className="p-6 rounded-3xl bg-slate-900 border border-cyan-500/30 shadow-xl space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-base font-bold text-white flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-cyan-400" />
                Currently Qualified Leaders ({stats.eligibleUsers.length})
              </h4>
              <p className="text-xs text-slate-400">
                These users currently fulfill active team requirements and will receive salary upon distribution.
              </p>
            </div>
          </div>

          {stats.eligibleUsers.length === 0 ? (
            <div className="p-8 text-center bg-slate-950 rounded-2xl border border-slate-800 text-slate-500 text-xs">
              No users currently meet the required referral thresholds for active salary tiers.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Leader Mobile</th>
                    <th className="p-3">Rank / Badge</th>
                    <th className="p-3">Qualified Tier</th>
                    <th className="p-3">Direct Paid Refs</th>
                    <th className="p-3">Total Team Paid</th>
                    <th className="p-3">Monthly Salary</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {stats.eligibleUsers.map((u) => (
                    <tr key={u.userId} className="hover:bg-slate-850">
                      <td className="p-3 font-mono font-bold text-amber-400">{u.phone}</td>
                      <td className="p-3 font-semibold text-slate-300">{u.role || 'Member'}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[11px] font-bold">
                          {u.tierTitle}
                        </span>
                      </td>
                      <td className="p-3 font-mono font-bold text-emerald-400">{u.directPaidCount} members</td>
                      <td className="p-3 font-mono text-cyan-300">{u.totalTeamPaidCount} members</td>
                      <td className="p-3 font-mono font-bold text-emerald-400 text-sm">
                        ৳{u.salaryAmount.toLocaleString()}
                      </td>
                      <td className="p-3">
                        {onInspectUser && (
                          <button
                            onClick={() => onInspectUser(u.userId)}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Dossier
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Salary Tiers Management Grid */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-base font-bold text-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-amber-400" />
              Configured Monthly Salary Tiers
            </h4>
            <p className="text-xs text-slate-400">
              Click any tier to edit its title, referral requirements, calculation rule, or monthly salary amount.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {stats?.tiers.map((tier, idx) => (
            <div
              key={tier.id}
              className={`p-4 rounded-2xl bg-slate-950 border transition-all ${
                tier.isActive !== false ? 'border-slate-800 hover:border-slate-700' : 'border-rose-950/40 opacity-60'
              }`}
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold text-sm ${getTitleColorClass(tier.badgeColor)}`}>
                      {tier.roleName}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${getBadgeColorClass(
                        tier.badgeColor
                      )}`}
                    >
                      {tier.badgeColor || 'amber'}
                    </span>
                    {!tier.isActive && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                        DISABLED
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span className="font-semibold text-slate-200">
                      Requirement: Min <span className="font-mono text-amber-400 font-bold">{tier.requiredReferrals}</span>{' '}
                      {getReferralTypeLabel(tier.referralType)}
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="text-cyan-400 font-medium">
                      {tier.eligibleCount || 0} qualifying users
                    </span>
                  </div>

                  {tier.description && (
                    <p className="text-[11px] text-slate-500 italic">{tier.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Monthly Payout</span>
                    <span className="font-black text-emerald-400 text-base font-mono">
                      ৳{tier.salaryAmount.toLocaleString()} <span className="text-xs font-normal text-slate-400">/ mo</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleOpenEditTier(tier)}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold transition cursor-pointer"
                      title="Edit this Salary Tier"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggleActive(tier)}
                      className={`p-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                        tier.isActive !== false
                          ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                          : 'bg-slate-800 text-slate-500 hover:text-white'
                      }`}
                      title={tier.isActive !== false ? 'Disable Tier' : 'Enable Tier'}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteTier(tier)}
                      className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white text-xs font-bold transition cursor-pointer"
                      title="Delete Salary Tier"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Big Action Button */}
        <div className="pt-2">
          <button
            type="button"
            disabled={distributingSalary}
            onClick={() => setConfirmDistributeModal(true)}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm shadow-xl shadow-emerald-950/40 transition cursor-pointer flex items-center justify-center gap-2"
          >
            <Award className="w-5 h-5" />
            <span>
              {distributingSalary
                ? 'Distributing Monthly Salaries...'
                : 'Run Auto Monthly Salary Distribution Now'}
            </span>
          </button>
        </div>
      </div>

      {/* Edit / Add Tier Modal */}
      {(isNewTier || editingTier) && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" />
                {isNewTier ? 'Add New Monthly Salary Tier' : `Edit Salary Tier: ${editingTier?.roleName}`}
              </h3>
              <button
                onClick={() => {
                  setEditingTier(null);
                  setIsNewTier(false);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTier} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Tier Title / Role Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tier 1: Manager, Tier 4: Crown Ambassador"
                  value={formRoleName}
                  onChange={(e) => setFormRoleName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-semibold focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Required Referrals <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    required
                    placeholder="e.g. 10, 25, 50"
                    value={formRequiredReferrals}
                    onChange={(e) => setFormRequiredReferrals(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-mono font-bold focus:border-amber-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">Minimum team members needed</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Monthly Salary (৳) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={1000000}
                    required
                    placeholder="e.g. 5000, 12000, 25000"
                    value={formSalaryAmount}
                    onChange={(e) => setFormSalaryAmount(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-emerald-400 text-xs font-mono font-bold focus:border-emerald-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">Monthly payout amount in TK</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Referral Counting Rule
                </label>
                <select
                  value={formReferralType}
                  onChange={(e) => setFormReferralType(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-semibold focus:border-amber-500 focus:outline-none cursor-pointer"
                >
                  <option value="direct_paid">Direct Active Paid Members (Level A with Active VIP Package)</option>
                  <option value="total_paid">Total Team Paid Members (All Levels A + B + C with Active Package)</option>
                  <option value="direct_all">Direct Total Registered Users (Both Free & Paid)</option>
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  Choose how user team members are counted to qualify for this salary tier.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Badge Theme Color
                  </label>
                  <select
                    value={formBadgeColor}
                    onChange={(e) => setFormBadgeColor(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-semibold cursor-pointer"
                  >
                    <option value="amber">Amber Gold</option>
                    <option value="cyan">Cyan Blue</option>
                    <option value="purple">Royal Purple</option>
                    <option value="emerald">Emerald Green</option>
                    <option value="rose">Rose Red</option>
                    <option value="blue">Sapphire Blue</option>
                    <option value="indigo">Deep Indigo</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Tier Status
                  </label>
                  <select
                    value={formIsActive ? 'active' : 'disabled'}
                    onChange={(e) => setFormIsActive(e.target.value === 'active')}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-semibold cursor-pointer"
                  >
                    <option value="active">Active (Eligible for Payout)</option>
                    <option value="disabled">Disabled / Inactive</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Description / Badge Subtitle (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Min 10 Active Paid Members"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs"
                />
              </div>

              <div className="flex items-center gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setEditingTier(null);
                    setIsNewTier(false);
                  }}
                  className="w-1/2 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-1/2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition cursor-pointer"
                >
                  {saving ? 'Saving...' : isNewTier ? 'Create Tier' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Salary Distribution */}
      {confirmDistributeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-emerald-500/30 rounded-3xl p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <Award className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-white">Confirm Salary Distribution</h3>
              <p className="text-xs text-slate-400">
                Are you sure you want to run the automatic monthly salary distribution?
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Qualifying Leaders:</span>
                <span className="font-bold text-amber-400">{stats?.eligibleCount || 0} Members</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Payout Amount:</span>
                <span className="font-bold text-emerald-400 font-mono text-sm">
                  ৳{(stats?.totalMonthlyLiability || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Action:</span>
                <span className="text-slate-300">Instant credit to user wallet balances</span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDistributeModal(false)}
                className="w-1/2 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={distributingSalary}
                onClick={handleRunDistribution}
                className="w-1/2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                {distributingSalary ? 'Distributing...' : 'Confirm & Distribute'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
