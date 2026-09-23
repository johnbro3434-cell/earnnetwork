import React, { useState, useEffect } from 'react';
import {
  X,
  Phone,
  Shield,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Users,
  Award,
  Lock,
  Unlock,
  KeyRound,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  Check,
  RefreshCw,
  Clock,
  Sparkles,
  DollarSign,
  Package,
  Layers,
  FileText,
  UserCheck,
  UserX,
  CreditCard,
  Send,
  MessageCircle,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

interface UserDossierModalProps {
  userIdOrPhone: string;
  onClose: () => void;
  onUserUpdated?: () => void;
}

export function UserDossierModal({ userIdOrPhone, onClose, onUserUpdated }: UserDossierModalProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [packages, setPackages] = useState<any[]>([]);

  // Sub-tabs in Dossier Modal
  const [activeTab, setActiveTab] = useState<'overview' | 'referrals' | 'finance' | 'admin_actions'>('overview');
  const [referralSubTab, setReferralSubTab] = useState<'levelA' | 'levelB' | 'levelC'>('levelA');

  // Admin Actions State
  const [selectedRole, setSelectedRole] = useState<string>('Member');
  const [customRole, setCustomRole] = useState<string>('');
  const [savingRole, setSavingRole] = useState(false);

  // Balance Adjustment
  const [balanceAmount, setBalanceAmount] = useState<number>(100);
  const [balanceAction, setBalanceAction] = useState<'add' | 'deduct'>('add');
  const [balanceReason, setBalanceReason] = useState<string>('Admin Manual Credit');
  const [adjustingBalance, setAdjustingBalance] = useState(false);

  // Package Assignment
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [assigningPackage, setAssigningPackage] = useState(false);

  // Password Reset
  const [newPassword, setNewPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  // Action in progress
  const [processingAction, setProcessingAction] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, field: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    showToast('success', 'Copied', `${text} copied to clipboard`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const fetchUserData = async () => {
    try {
      setLoading(true);
      const [res, pkgRes] = await Promise.all([
        apiRequest(`/api/admin/users/${userIdOrPhone}`),
        apiRequest('/api/packages').catch(() => ({ packages: [] })),
      ]);

      if (res && res.user) {
        setData(res);
        setSelectedRole(res.user.role || 'Member');
        if (res.activePackage) {
          setSelectedPackageId(res.activePackage.id);
        }
      }
      if (pkgRes && pkgRes.packages) {
        setPackages(pkgRes.packages);
      }
    } catch (err: any) {
      showToast('error', 'Load Failed', err.message || 'Could not load user dossier details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userIdOrPhone) {
      fetchUserData();
    }
  }, [userIdOrPhone]);

  // Handle Role Assignment
  const handleAssignRole = async (roleToSet?: string) => {
    const finalRole = roleToSet || (selectedRole === 'Custom' ? customRole.trim() : selectedRole);
    if (!finalRole) {
      showToast('error', 'Invalid Role', 'Please specify a role name.');
      return;
    }

    try {
      setSavingRole(true);
      const res = await apiRequest(`/api/admin/users/${data.user.id}/action`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'assign_role',
          role: finalRole,
          reason: `Admin changed role to ${finalRole}`,
        }),
      });

      showToast('success', 'Role Updated', `User role successfully assigned to "${finalRole}"`);
      await fetchUserData();
      if (onUserUpdated) onUserUpdated();
    } catch (err: any) {
      showToast('error', 'Update Failed', err.message || 'Could not assign role');
    } finally {
      setSavingRole(false);
    }
  };

  // Handle Balance Adjust
  const handleAdjustBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!balanceAmount || balanceAmount <= 0) {
      showToast('error', 'Invalid Amount', 'Enter a valid amount in TK');
      return;
    }

    try {
      setAdjustingBalance(true);
      const actionKey = balanceAction === 'add' ? 'add_balance' : 'deduct_balance';
      await apiRequest(`/api/admin/users/${data.user.id}/action`, {
        method: 'POST',
        body: JSON.stringify({
          action: actionKey,
          amount: balanceAmount,
          reason: balanceReason || 'Admin Manual Adjustment',
        }),
      });

      showToast(
        'success',
        balanceAction === 'add' ? 'Balance Added' : 'Balance Deducted',
        `৳${balanceAmount.toLocaleString()} TK ${balanceAction === 'add' ? 'added to' : 'deducted from'} user wallet.`
      );
      setBalanceAmount(100);
      setBalanceReason('');
      await fetchUserData();
      if (onUserUpdated) onUserUpdated();
    } catch (err: any) {
      showToast('error', 'Adjustment Failed', err.message || 'Could not update balance');
    } finally {
      setAdjustingBalance(false);
    }
  };

  // Handle Package Assignment
  const handleAssignPackage = async () => {
    if (!selectedPackageId) {
      showToast('error', 'Select Package', 'Please choose a package tier');
      return;
    }

    try {
      setAssigningPackage(true);
      await apiRequest(`/api/admin/users/${data.user.id}/action`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'assign_package',
          packageId: selectedPackageId,
          reason: 'Admin assigned package directly',
        }),
      });

      showToast('success', 'Package Assigned', 'Package activated successfully for user!');
      await fetchUserData();
      if (onUserUpdated) onUserUpdated();
    } catch (err: any) {
      showToast('error', 'Assignment Failed', err.message || 'Could not assign package');
    } finally {
      setAssigningPackage(false);
    }
  };

  // Handle Generic Action (Toggle Ban, Toggle Free Withdraw, Reset Withdraw Setup)
  const handleRunAction = async (action: string, successMsg: string, extraBody: any = {}) => {
    try {
      setProcessingAction(true);
      await apiRequest(`/api/admin/users/${data.user.id}/action`, {
        method: 'POST',
        body: JSON.stringify({ action, ...extraBody }),
      });

      showToast('success', 'Action Success', successMsg);
      await fetchUserData();
      if (onUserUpdated) onUserUpdated();
    } catch (err: any) {
      showToast('error', 'Action Failed', err.message || 'Could not perform action');
    } finally {
      setProcessingAction(false);
    }
  };

  // Handle Password Reset
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      showToast('error', 'Password Too Short', 'Password must be at least 6 characters');
      return;
    }

    try {
      setResettingPassword(true);
      await apiRequest(`/api/admin/users/${data.user.id}/action`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'reset_password',
          newPassword,
          reason: 'Admin password override',
        }),
      });

      showToast('success', 'Password Reset', `Password for ${data.user.phone} updated successfully.`);
      setNewPassword('');
    } catch (err: any) {
      showToast('error', 'Reset Failed', err.message || 'Could not reset password');
    } finally {
      setResettingPassword(false);
    }
  };

  const presetRoles = [
    { value: 'Member', label: 'Standard Member (সাধারণ সদস্য)', color: 'bg-slate-700 text-slate-200' },
    { value: 'VIP Investor', label: 'VIP Investor (ভিআইপি ইনভেস্টর)', color: 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40' },
    { value: 'Agent', label: 'Authorized Agent (অফিসিয়াল এজেন্ট)', color: 'bg-cyan-600/30 text-cyan-300 border border-cyan-500/40' },
    { value: 'Manager', label: 'Team Manager (টিম ম্যানেজার - বেতন যোগ্য)', color: 'bg-purple-600/30 text-purple-300 border border-purple-500/40' },
    { value: 'Senior Manager', label: 'Senior Manager (সিনিয়র ম্যানেজার)', color: 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40' },
    { value: 'VIP Partner', label: 'Executive VIP Partner (পার্টনার)', color: 'bg-amber-600/30 text-amber-300 border border-amber-500/40' },
    { value: 'Moderator', label: 'Platform Moderator (মডারেটর)', color: 'bg-blue-600/30 text-blue-300 border border-blue-500/40' },
    { value: 'Admin', label: 'System Administrator (অ্যাডমিন)', color: 'bg-rose-600/30 text-rose-300 border border-rose-500/40' },
  ];

  if (loading && !data) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
          <RefreshCw className="w-10 h-10 text-amber-400 animate-spin mx-auto" />
          <h3 className="text-base font-bold text-white">Loading Complete User CRM Dossier...</h3>
          <p className="text-xs text-slate-400 font-mono">Fetching balances, 3-tier tree, MFS accounts & logs...</p>
        </div>
      </div>
    );
  }

  if (!data || !data.user) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto" />
          <h3 className="text-base font-bold text-white">User Profile Not Found</h3>
          <p className="text-xs text-slate-400">Could not find user with ID or phone: {userIdOrPhone}</p>
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const { user, wallet, activePackage, financialSummary, withdrawAccount, referralBreakdown, recentDeposits, recentWithdrawals, recentTransactions } = data;

  const currentReferralList =
    referralSubTab === 'levelA'
      ? referralBreakdown.levelA.members
      : referralSubTab === 'levelB'
      ? referralBreakdown.levelB.members
      : referralBreakdown.levelC.members;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-5xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-6 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 p-0.5 shadow-lg shadow-amber-500/20 shrink-0">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Users className="w-6 h-6 text-amber-400" />
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg sm:text-xl font-black text-white font-mono flex items-center gap-2">
                  <span>{user.phone}</span>
                  <button
                    onClick={() => copyToClipboard(user.phone, 'phone')}
                    className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
                    title="Copy Phone Number"
                  >
                    {copiedField === 'phone' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </h3>

                <a
                  href={`https://wa.me/880${user.phone.replace(/^0/, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold flex items-center gap-1 hover:bg-emerald-500 hover:text-slate-950 transition"
                  title="Chat on WhatsApp"
                >
                  <MessageCircle className="w-3 h-3" />
                  <span>WhatsApp</span>
                </a>

                {/* Status Badges */}
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    user.isBanned
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  }`}
                >
                  {user.isBanned ? '⛔ BANNED' : '✓ ACTIVE'}
                </span>

                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  Role: {user.role || 'Member'}
                </span>

                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  Tier: {user.activePackageName || (user.isTrial ? 'Free Trial' : 'Regular')}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-1">
                <span className="flex items-center gap-1 font-mono">
                  <span>Ref Code:</span>
                  <strong className="text-amber-400">{user.referralCode}</strong>
                  <button
                    onClick={() => copyToClipboard(user.referralCode, 'refCode')}
                    className="text-slate-400 hover:text-white"
                  >
                    {copiedField === 'refCode' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </span>
                <span>•</span>
                <span>
                  Referred By: <strong className="text-white font-mono">{user.referredBy || 'Direct / System (No Uplink)'}</strong>
                </span>
                <span>•</span>
                <span>Joined: {new Date(user.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={fetchUserData}
              disabled={loading}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 transition cursor-pointer"
              title="Close Modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div className="px-4 sm:px-6 bg-slate-950/60 border-b border-slate-800 flex items-center gap-2 overflow-x-auto shrink-0 py-2.5">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shrink-0 ${
              activeTab === 'overview'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Overview & Wallet</span>
          </button>

          <button
            onClick={() => setActiveTab('referrals')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shrink-0 ${
              activeTab === 'referrals'
                ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>3-Tier Referral Tree ({referralBreakdown.totalTeamCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('finance')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shrink-0 ${
              activeTab === 'finance'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Financial Ledger</span>
          </button>

          <button
            onClick={() => setActiveTab('admin_actions')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shrink-0 ${
              activeTab === 'admin_actions'
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Admin Controls & Role</span>
          </button>
        </div>

        {/* MODAL BODY CONTENT */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* TAB 1: OVERVIEW & WALLET */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Top 4 Financial Metric Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {/* 1. Total Balance */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 via-slate-950 to-slate-900 border border-amber-500/30 relative overflow-hidden">
                  <span className="text-[10px] uppercase font-bold text-amber-400 block">Total Current Balance</span>
                  <h4 className="text-2xl sm:text-3xl font-black text-white font-mono mt-1">
                    ৳{(wallet.balance || 0).toLocaleString()}
                  </h4>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                    <span>Pending: ৳{(wallet.pendingBalance || 0).toLocaleString()}</span>
                    <button
                      onClick={() => setActiveTab('admin_actions')}
                      className="text-amber-400 font-bold hover:underline cursor-pointer"
                    >
                      Adjust ±
                    </button>
                  </div>
                </div>

                {/* 2. Total Deposits */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-slate-950 to-slate-900 border border-emerald-500/30">
                  <span className="text-[10px] uppercase font-bold text-emerald-400 block">Total Approved Deposit</span>
                  <h4 className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono mt-1">
                    ৳{financialSummary.totalDeposited.toLocaleString()}
                  </h4>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                    <span>{financialSummary.depositCount} Total Deposits</span>
                    {financialSummary.pendingDepositAmount > 0 && (
                      <span className="text-amber-400 font-bold">৳{financialSummary.pendingDepositAmount} Pending</span>
                    )}
                  </div>
                </div>

                {/* 3. Total Withdrawn */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-rose-500/10 via-slate-950 to-slate-900 border border-rose-500/30">
                  <span className="text-[10px] uppercase font-bold text-rose-400 block">Total Withdrawn Out</span>
                  <h4 className="text-2xl sm:text-3xl font-black text-rose-400 font-mono mt-1">
                    ৳{financialSummary.totalWithdrawn.toLocaleString()}
                  </h4>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                    <span>{financialSummary.withdrawCount} Withdrawals</span>
                    {financialSummary.pendingWithdrawAmount > 0 && (
                      <span className="text-amber-400 font-bold">৳{financialSummary.pendingWithdrawAmount} Queue</span>
                    )}
                  </div>
                </div>

                {/* 4. Earnings Breakdown */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-500/10 via-slate-950 to-slate-900 border border-purple-500/30">
                  <span className="text-[10px] uppercase font-bold text-purple-400 block">Total Referral Income</span>
                  <h4 className="text-2xl sm:text-3xl font-black text-purple-300 font-mono mt-1">
                    ৳{financialSummary.totalCommissionEarned.toLocaleString()}
                  </h4>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                    <span>Task: ৳{financialSummary.taskIncome.toLocaleString()}</span>
                    <span>Gift: ৳{financialSummary.giftIncome.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* MFS WITHDRAW ACCOUNT & SECURITY LOCK BOX */}
              <div className="p-5 sm:p-6 rounded-3xl bg-slate-950 border border-slate-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <CreditCard className="w-5 h-5 text-amber-400" />
                    <div>
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                        Locked MFS Withdraw Account & Security
                      </h4>
                      <p className="text-xs text-slate-400">Payment method bound for automated/manual dispatches</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {withdrawAccount.isConfigured ? (
                      <span className="px-3 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5" />
                        <span>Security Locked</span>
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5">
                        <Unlock className="w-3.5 h-3.5" />
                        <span>Not Configured Yet</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Payment Method */}
                  <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Withdraw Payment Method</span>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-pink-500 inline-block"></span>
                      <strong className="text-base text-white font-bold">
                        {withdrawAccount.paymentMethod || 'None / Not Set'}
                      </strong>
                    </div>
                  </div>

                  {/* Withdraw Account Number */}
                  <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Locked Mobile Number</span>
                    <div className="flex items-center justify-between">
                      <strong className="text-base text-white font-mono font-bold">
                        {withdrawAccount.withdrawNumber || 'Not Bound'}
                      </strong>
                      {withdrawAccount.withdrawNumber && (
                        <button
                          onClick={() => copyToClipboard(withdrawAccount.withdrawNumber, 'wdrNumber')}
                          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                          title="Copy Withdraw Number"
                        >
                          {copiedField === 'wdrNumber' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Withdraw Password & Free Withdraw Status */}
                  <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">PIN / Free User Rule</span>
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`font-bold ${withdrawAccount.isPasswordProtected ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {withdrawAccount.isPasswordProtected ? '✓ PIN Protected' : 'No PIN Set'}
                        </span>
                        <span>•</span>
                        <span className={`font-bold ${user.freeWithdrawAllowed ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {user.freeWithdrawAllowed ? 'Free Withdraw Allowed' : 'Free Withdraw Blocked'}
                        </span>
                      </div>
                    </div>

                    {withdrawAccount.isConfigured && (
                      <button
                        onClick={() => {
                          if (confirm(`Are you sure you want to reset the locked withdraw account for ${user.phone}? The user will be able to bind a new bKash/Nagad number.`)) {
                            handleRunAction('reset_withdraw_account', 'Withdraw account unlocked and reset.');
                          }
                        }}
                        disabled={processingAction}
                        className="mt-2 text-left text-xs text-rose-400 hover:text-rose-300 font-bold hover:underline cursor-pointer"
                      >
                        Reset / Unlock Withdraw Number
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Role & Permissions Banner */}
              <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-purple-950/40 via-slate-950 to-indigo-950/40 border border-purple-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Shield className="w-4 h-4" />
                    <span>Current User Role: <strong className="text-white">{user.role || 'Member'}</strong></span>
                  </span>
                  <p className="text-xs text-slate-400">
                    Admins can promote this user to Agent, Manager (Salary Eligible), Senior Manager, VIP Partner, or Admin.
                  </p>
                </div>

                <button
                  onClick={() => setActiveTab('admin_actions')}
                  className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-900/40 flex items-center gap-2 transition cursor-pointer self-start sm:self-auto"
                >
                  <Award className="w-4 h-4" />
                  <span>Assign New Role / Edit Controls</span>
                </button>
              </div>

              {/* System & Device Audit Info */}
              <div className="p-5 rounded-3xl bg-slate-950/70 border border-slate-800 text-xs space-y-2">
                <h5 className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">Device & Network Intelligence</h5>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-slate-400 font-mono text-[11px]">
                  <div>Device Fingerprint: <span className="text-slate-200">{user.deviceFingerprint || 'Unknown'}</span></div>
                  <div>Last Login: <span className="text-slate-200">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never logged in'}</span></div>
                  <div>Account ID: <span className="text-slate-200">{user.id}</span></div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: 3-TIER REFERRAL TREE */}
          {activeTab === 'referrals' && (
            <div className="space-y-6">
              {/* Summary Header */}
              <div className="p-5 rounded-3xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-base font-bold text-white flex items-center gap-2">
                    <Users className="w-5 h-5 text-purple-400" />
                    <span>3-Tier Downline Network ({referralBreakdown.totalTeamCount} Members)</span>
                  </h4>
                  <p className="text-xs text-slate-400">
                    Total Referral Commission Earned by this user: <strong className="text-emerald-400">৳{financialSummary.totalCommissionEarned.toLocaleString()} TK</strong>
                  </p>
                </div>

                {/* Sub tabs: Level A, Level B, Level C */}
                <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-2xl border border-slate-800">
                  <button
                    onClick={() => setReferralSubTab('levelA')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      referralSubTab === 'levelA'
                        ? 'bg-purple-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Level A (10%) • {referralBreakdown.levelA.count}
                  </button>
                  <button
                    onClick={() => setReferralSubTab('levelB')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      referralSubTab === 'levelB'
                        ? 'bg-purple-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Level B (5%) • {referralBreakdown.levelB.count}
                  </button>
                  <button
                    onClick={() => setReferralSubTab('levelC')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      referralSubTab === 'levelC'
                        ? 'bg-purple-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Level C (2%) • {referralBreakdown.levelC.count}
                  </button>
                </div>
              </div>

              {/* Members Table */}
              <div className="bg-slate-950 rounded-3xl border border-slate-800 overflow-hidden">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    {referralSubTab === 'levelA'
                      ? 'Direct Referrals (Level A - 10% Commission)'
                      : referralSubTab === 'levelB'
                      ? 'Secondary Downlines (Level B - 5% Commission)'
                      : 'Tertiary Downlines (Level C - 2% Commission)'}
                  </span>
                  <span className="text-xs text-slate-400">{currentReferralList.length} Members listed</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-400 uppercase text-[10px]">
                      <tr>
                        <th className="p-3">Phone</th>
                        <th className="p-3">Role</th>
                        <th className="p-3">Package Tier</th>
                        <th className="p-3">Balance</th>
                        <th className="p-3">Total Deposit</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Joined Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {currentReferralList.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-500">
                            No team members found in this tier.
                          </td>
                        </tr>
                      ) : (
                        currentReferralList.map((m: any, idx: number) => (
                          <tr key={m.id || idx} className="hover:bg-slate-900/60">
                            <td className="p-3 font-mono font-bold text-white">{m.phone}</td>
                            <td className="p-3 text-slate-300">{m.role}</td>
                            <td className="p-3 text-amber-300">{m.packageName}</td>
                            <td className="p-3 font-bold text-emerald-400 font-mono">৳{(m.balance || 0).toLocaleString()}</td>
                            <td className="p-3 font-mono text-slate-300">৳{(m.totalDeposit || 0).toLocaleString()}</td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  m.status === 'banned' ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
                                }`}
                              >
                                {m.status}
                              </span>
                            </td>
                            <td className="p-3 text-slate-400">{new Date(m.joinedAt).toLocaleDateString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: FINANCIAL LEDGER */}
          {activeTab === 'finance' && (
            <div className="space-y-6">
              {/* Deposits History */}
              <div className="bg-slate-950 rounded-3xl border border-slate-800 overflow-hidden">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
                    <span>Deposit Requests ({recentDeposits.length})</span>
                  </h4>
                  <span className="text-xs font-bold text-emerald-400">Total: ৳{financialSummary.totalDeposited.toLocaleString()}</span>
                </div>

                <div className="overflow-x-auto max-h-60">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-400 uppercase text-[10px]">
                      <tr>
                        <th className="p-3">Amount</th>
                        <th className="p-3">Gateway</th>
                        <th className="p-3">Sender Phone</th>
                        <th className="p-3">TrxID</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {recentDeposits.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-slate-500">No deposit records.</td>
                        </tr>
                      ) : (
                        recentDeposits.map((d: any, idx: number) => (
                          <tr key={d.id || idx} className="hover:bg-slate-900/60">
                            <td className="p-3 font-bold text-emerald-400">৳{d.amount.toLocaleString()}</td>
                            <td className="p-3 text-white">{d.paymentMethod}</td>
                            <td className="p-3 font-mono text-slate-300">{d.senderNumber}</td>
                            <td className="p-3 font-mono text-cyan-300 font-bold">{d.transactionId}</td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  d.status === 'approved'
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : d.status === 'pending'
                                    ? 'bg-amber-500/20 text-amber-400'
                                    : 'bg-rose-500/20 text-rose-400'
                                }`}
                              >
                                {d.status}
                              </span>
                            </td>
                            <td className="p-3 text-slate-400">{new Date(d.createdAt).toLocaleString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Withdrawals History */}
              <div className="bg-slate-950 rounded-3xl border border-slate-800 overflow-hidden">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <ArrowUpRight className="w-4 h-4 text-rose-400" />
                    <span>Withdrawal Requests ({recentWithdrawals.length})</span>
                  </h4>
                  <span className="text-xs font-bold text-rose-400">Total: ৳{financialSummary.totalWithdrawn.toLocaleString()}</span>
                </div>

                <div className="overflow-x-auto max-h-60">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-400 uppercase text-[10px]">
                      <tr>
                        <th className="p-3">Amount</th>
                        <th className="p-3">Net Payout</th>
                        <th className="p-3">Gateway</th>
                        <th className="p-3">Payout Account</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {recentWithdrawals.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-slate-500">No withdrawal records.</td>
                        </tr>
                      ) : (
                        recentWithdrawals.map((w: any, idx: number) => (
                          <tr key={w.id || idx} className="hover:bg-slate-900/60">
                            <td className="p-3 font-bold text-rose-400">৳{w.amount.toLocaleString()}</td>
                            <td className="p-3 font-bold text-emerald-400">৳{(w.netAmount || w.amount * 0.9).toLocaleString()}</td>
                            <td className="p-3 text-white">{w.paymentMethod}</td>
                            <td className="p-3 font-mono text-slate-300">{w.withdrawNumber}</td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  w.status === 'approved' || w.status === 'paid'
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : w.status === 'pending'
                                    ? 'bg-amber-500/20 text-amber-400'
                                    : 'bg-rose-500/20 text-rose-400'
                                }`}
                              >
                                {w.status}
                              </span>
                            </td>
                            <td className="p-3 text-slate-400">{new Date(w.createdAt).toLocaleString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Transactions Passbook */}
              <div className="bg-slate-950 rounded-3xl border border-slate-800 overflow-hidden">
                <div className="p-4 border-b border-slate-800">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Recent Passbook Ledger (Last 30)</h4>
                </div>
                <div className="overflow-x-auto max-h-60">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-400 uppercase text-[10px]">
                      <tr>
                        <th className="p-3">Type</th>
                        <th className="p-3">Description</th>
                        <th className="p-3">Amount</th>
                        <th className="p-3">Balance After</th>
                        <th className="p-3">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {recentTransactions.map((tx: any, idx: number) => (
                        <tr key={tx.id || idx} className="hover:bg-slate-900/60">
                          <td className="p-3 font-bold uppercase text-[10px] text-amber-400">{tx.type}</td>
                          <td className="p-3 text-slate-300">{tx.description}</td>
                          <td className={`p-3 font-bold font-mono ${tx.amount > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {tx.amount > 0 ? `+৳${tx.amount}` : `-৳${Math.abs(tx.amount)}`}
                          </td>
                          <td className="p-3 font-mono text-white">৳{(tx.balanceAfter || 0).toLocaleString()}</td>
                          <td className="p-3 text-slate-400">{new Date(tx.createdAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ADMIN CONTROLS & ROLE ASSIGNMENT */}
          {activeTab === 'admin_actions' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 1. ROLE ASSIGNMENT MODULE */}
              <div className="p-5 sm:p-6 rounded-3xl bg-slate-950 border border-purple-500/30 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                  <Award className="w-5 h-5 text-purple-400" />
                  <div>
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider">Assign User Role</h4>
                    <p className="text-xs text-slate-400">Promote to Manager, Agent, VIP Partner, or Admin</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-slate-300 uppercase">
                    Select Target Role:
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {presetRoles.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setSelectedRole(r.value)}
                        className={`p-3 rounded-xl text-left text-xs font-bold transition flex items-center justify-between cursor-pointer border ${
                          selectedRole === r.value
                            ? 'bg-purple-600/30 border-purple-500 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${selectedRole === r.value ? 'bg-purple-400' : 'bg-slate-600'}`}></span>
                          {r.label}
                        </span>
                        {user.role === r.value && (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                            Current Role
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Custom Role Input if chosen */}
                  <div className="pt-2">
                    <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                      Or Type Custom Role Name:
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Regional Director, VIP Coordinator..."
                      value={customRole}
                      onChange={(e) => {
                        setCustomRole(e.target.value);
                        if (e.target.value) setSelectedRole('Custom');
                      }}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-semibold focus:border-purple-500 outline-none"
                    />
                  </div>

                  <button
                    onClick={() => handleAssignRole()}
                    disabled={savingRole}
                    className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-purple-900/40 flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{savingRole ? 'Updating Role...' : `Assign Role "${selectedRole === 'Custom' ? customRole : selectedRole}"`}</span>
                  </button>
                </div>
              </div>

              {/* 2. DIRECT BALANCE ADJUSTMENT (ADD / DEDUCT) */}
              <div className="p-5 sm:p-6 rounded-3xl bg-slate-950 border border-amber-500/30 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                  <DollarSign className="w-5 h-5 text-amber-400" />
                  <div>
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider">Direct Wallet Balance Adjustment</h4>
                    <p className="text-xs text-slate-400">Current Balance: <strong className="text-white">৳{(wallet.balance || 0).toLocaleString()} TK</strong></p>
                  </div>
                </div>

                <form onSubmit={handleAdjustBalance} className="space-y-4">
                  <div className="flex gap-2 p-1 bg-slate-900 rounded-2xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => { setBalanceAction('add'); setBalanceReason('Admin Manual Bonus/Credit'); }}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                        balanceAction === 'add'
                          ? 'bg-emerald-500 text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      + Add Credit (জমা)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setBalanceAction('deduct'); setBalanceReason('Admin Manual Deduction'); }}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                        balanceAction === 'deduct'
                          ? 'bg-rose-500 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      - Deduct (কর্তন)
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                      Adjustment Amount (TK)
                    </label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={balanceAmount}
                      onChange={(e) => setBalanceAmount(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-base font-bold font-mono focus:border-amber-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                      Adjustment Reason / Note
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Leadership bonus, Dispute resolution, Recharge credit"
                      value={balanceReason}
                      onChange={(e) => setBalanceReason(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-500 outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={adjustingBalance}
                    className={`w-full py-3 rounded-xl font-bold text-xs shadow-lg transition cursor-pointer flex items-center justify-center gap-2 ${
                      balanceAction === 'add'
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-950'
                        : 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-950'
                    }`}
                  >
                    <Check className="w-4 h-4" />
                    <span>
                      {adjustingBalance
                        ? 'Executing Balance Update...'
                        : `${balanceAction === 'add' ? 'Credit' : 'Deduct'} ৳${balanceAmount.toLocaleString()} TK Now`}
                    </span>
                  </button>
                </form>
              </div>

              {/* 3. PACKAGE OVERRIDE & TIER UPGRADE */}
              <div className="p-5 sm:p-6 rounded-3xl bg-slate-950 border border-slate-800 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                  <Package className="w-5 h-5 text-cyan-400" />
                  <div>
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider">Package Tier Assignment</h4>
                    <p className="text-xs text-slate-400">Current: <strong className="text-white">{user.activePackageName || 'Free Trial'}</strong></p>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-slate-300 uppercase">
                    Select VIP Package Tier:
                  </label>
                  <select
                    value={selectedPackageId}
                    onChange={(e) => setSelectedPackageId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-bold focus:border-cyan-500 outline-none"
                  >
                    <option value="">-- Choose Package --</option>
                    {packages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (৳{p.price.toLocaleString()} TK • {p.videosPerDay} videos/day • ৳{p.dailyIncome}/day)
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={handleAssignPackage}
                    disabled={assigningPackage || !selectedPackageId}
                    className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs transition cursor-pointer"
                  >
                    {assigningPackage ? 'Activating Package...' : 'Activate Package Directly'}
                  </button>
                </div>
              </div>

              {/* 4. SECURITY & PERMISSIONS TOGGLES */}
              <div className="p-5 sm:p-6 rounded-3xl bg-slate-950 border border-slate-800 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                  <Shield className="w-5 h-5 text-rose-400" />
                  <div>
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider">Security & Permissions</h4>
                    <p className="text-xs text-slate-400">Lock, ban, or reset member security credentials</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {/* Toggle Ban */}
                  <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                    <div>
                      <strong className="text-xs text-white block">Account Status</strong>
                      <span className="text-[11px] text-slate-400">{user.isBanned ? 'Banned from login & earning' : 'Active and authorized'}</span>
                    </div>
                    <button
                      onClick={() => handleRunAction('toggle_ban', `User ${user.isBanned ? 'unbanned' : 'banned'} successfully.`)}
                      disabled={processingAction}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                        user.isBanned
                          ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 border border-emerald-500/40'
                          : 'bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white border border-rose-500/40'
                      }`}
                    >
                      {user.isBanned ? 'Unban Account' : 'Ban Account'}
                    </button>
                  </div>

                  {/* Toggle Free User Withdraw */}
                  <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                    <div>
                      <strong className="text-xs text-white block">Free User Withdraw Permission</strong>
                      <span className="text-[11px] text-slate-400">{user.freeWithdrawAllowed ? 'Granted individual withdraw access' : 'Follows default requirement'}</span>
                    </div>
                    <button
                      onClick={() => handleRunAction('toggle_free_withdraw', `Free withdraw permission ${user.freeWithdrawAllowed ? 'revoked' : 'granted'}.`)}
                      disabled={processingAction}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                        user.freeWithdrawAllowed
                          ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500 hover:text-slate-950 border border-amber-500/40'
                          : 'bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500 hover:text-slate-950 border border-cyan-500/40'
                      }`}
                    >
                      {user.freeWithdrawAllowed ? 'Revoke Access' : 'Grant Permission'}
                    </button>
                  </div>

                  {/* Reset Password Form */}
                  <form onSubmit={handleResetPassword} className="pt-2 border-t border-slate-800 space-y-2">
                    <label className="block text-[11px] font-bold text-slate-400 uppercase">
                      Reset Login Password:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        placeholder="New Password (min 6 chars)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:border-rose-500 outline-none"
                      />
                      <button
                        type="submit"
                        disabled={resettingPassword || !newPassword}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold disabled:opacity-50 transition cursor-pointer"
                      >
                        {resettingPassword ? 'Resetting...' : 'Set Password'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500 font-mono">
            EarnNetwork BD CRM Core • User ID: {user.id}
          </span>
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition cursor-pointer"
          >
            Close Dossier
          </button>
        </div>
      </div>
    </div>
  );
}
