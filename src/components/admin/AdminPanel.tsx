import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import {
  LayoutDashboard,
  Users,
  Film,
  DollarSign,
  Package as PackageIcon,
  Sliders,
  Bell,
  Settings,
  ShieldAlert,
  CheckCircle,
  XCircle,
  Clock,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  Power,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  Menu,
  Gift,
  Megaphone,
  Calendar,
  Award,
  Download,
  Eye,
  Copy,
  Lock,
  Unlock,
  Smartphone,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  AlertTriangle,
  Cloud,
  Check,
  Upload,
  MessageSquare,
  Activity,
  Cpu,
  CreditCard,
  Phone,
} from 'lucide-react';
import { apiRequest, removeToken } from '../../lib/api';
import { getSocket, joinAdminRoom } from '../../lib/socket';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { User, DepositRequest, WithdrawRequest, VideoTask, PaymentNumber, WebsiteSettings, CloudinarySettings } from '../../types';
import { ImageUploadInput } from '../common/ImageUploadInput';
import { SupportCRMTab } from './SupportCRMTab';
import { AdminUsersTab } from './AdminUsersTab';
import { SlidersTab } from './SlidersTab';
import { PackagesTab } from './PackagesTab';
import { WithdrawCardsTab } from './WithdrawCardsTab';
import { TasksTab } from './TasksTab';
import { SystemHealthTab } from './SystemHealthTab';
import { GlobalAdminSearchModal } from './GlobalAdminSearchModal';
import { MfsAutomationTab } from './MfsAutomationTab';
import { FraudDashboardTab } from './FraudDashboardTab';
import { UserDossierModal } from './UserDossierModal';
import { SalaryManagerTab } from './SalaryManagerTab';
import {
  exportUsersToCSV,
  exportDepositsToCSV,
  exportWithdrawalsToCSV,
  exportWalletLedgerToCSV,
  exportAuditLogsToCSV,
} from '../../lib/exportUtils';

export function AdminPanel() {
  const { admin } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<
    | 'analytics'
    | 'users'
    | 'finance'
    | 'withdraw_cards'
    | 'mfs_automation'
    | 'tasks'
    | 'packages'
    | 'referrals'
    | 'gifts'
    | 'campaigns'
    | 'holidays'
    | 'security'
    | 'sliders'
    | 'support'
    | 'admin_users'
    | 'broadcast'
    | 'roles'
    | 'logs'
    | 'system_health'
    | 'settings'
    | 'cloudinary'
  >('analytics');
  const [securitySubTab, setSecuritySubTab] = useState<'mfs_fraud' | 'devices'>('mfs_fraud');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  // Cloudinary Storage State
  const [cloudinarySettings, setCloudinarySettings] = useState<{
    cloudName: string;
    apiKey: string;
    apiSecret: string;
    uploadPreset?: string;
    isConfigured: boolean;
  }>({
    cloudName: '',
    apiKey: '',
    apiSecret: '',
    uploadPreset: '',
    isConfigured: false,
  });
  const [savingCloudinary, setSavingCloudinary] = useState(false);
  const [testingCloudinary, setTestingCloudinary] = useState(false);
  const [cloudinaryStatusMsg, setCloudinaryStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testUploadUrl, setTestUploadUrl] = useState<string>('');

  // Analytics State
  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Users State
  const [userList, setUserList] = useState<User[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [balanceModalUser, setBalanceModalUser] = useState<User | null>(null);
  const [balanceAmount, setBalanceAmount] = useState<number>(100);
  const [balanceActionType, setBalanceActionType] = useState<'add' | 'subtract'>('add');
  const [balanceReason, setBalanceReason] = useState('Admin Manual Adjustment');
  const [selectedUserProfileUser, setSelectedUserProfileUser] = useState<User | null>(null);
  const [selectedDossierUserId, setSelectedDossierUserId] = useState<string | null>(null);

  // Video Tasks State
  const [tasksList, setTasksList] = useState<VideoTask[]>([]);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskUrl, setNewTaskUrl] = useState('');
  const [newTaskThumb, setNewTaskThumb] = useState('');
  const [newTaskReward, setNewTaskReward] = useState(25);
  const [newTaskCategory, setNewTaskCategory] = useState('Sponsor Ads');

  // Finance State
  const [pendingDeposits, setPendingDeposits] = useState<DepositRequest[]>([]);
  const [pendingWithdraws, setPendingWithdraws] = useState<WithdrawRequest[]>([]);
  const [paymentNumbers, setPaymentNumbers] = useState<PaymentNumber[]>([]);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectType, setRejectType] = useState<'deposit' | 'withdraw'>('deposit');
  const [newPayMethod, setNewPayMethod] = useState<'bKash' | 'Nagad'>('bKash');
  const [newPayNumber, setNewPayNumber] = useState('');
  const [previewScreenshotUrl, setPreviewScreenshotUrl] = useState<string | null>(null);

  // Broadcast State
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastTarget, setBroadcastTarget] = useState('all');

  // Website Settings State
  const [siteSettings, setSiteSettings] = useState<WebsiteSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // Packages State
  const [packagesList, setPackagesList] = useState<any[]>([]);

  // Logs State
  const [logsList, setLogsList] = useState<any[]>([]);

  // Gifts & Promos State
  const [giftPhone, setGiftPhone] = useState('');
  const [giftAmount, setGiftAmount] = useState(500);
  const [giftReason, setGiftReason] = useState('');
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoReward, setPromoReward] = useState(100);
  const [promoList, setPromoList] = useState<any[]>([]);

  // Campaigns State
  const [campaignTitle, setCampaignTitle] = useState('');
  const [campaignImg, setCampaignImg] = useState('');
  const [campaignDesc, setCampaignDesc] = useState('');
  const [campaignList, setCampaignList] = useState<any[]>([]);

  // Holidays State
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayName, setHolidayName] = useState('');
  const [holidayReason, setHolidayReason] = useState('');
  const [holidayList, setHolidayList] = useState<any[]>([]);

  // Security & Fraud State
  const [deviceRecords, setDeviceRecords] = useState<any[]>([]);
  const [distributingSalary, setDistributingSalary] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchModalOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    loadAllAdminData();
    const socket = getSocket();
    if (socket) {
      joinAdminRoom(admin?.role || 'Main Admin');
      const handleUpdate = () => loadAllAdminData();
      socket.on('admin.dashboard.updated', handleUpdate);
      socket.on('deposit.status.changed', handleUpdate);
      socket.on('deposit.new', () => {
        showToast('info', 'New Deposit Request', 'A new deposit has been submitted.');
        loadAllAdminData();
      });
      socket.on('withdraw.status.changed', handleUpdate);
      socket.on('withdraw.new', () => {
        showToast('info', 'New Withdrawal Request', 'A new withdrawal has been submitted.');
        loadAllAdminData();
      });
      socket.on('user.registered', () => {
        showToast('info', 'New Registration', 'A new member has registered.');
        loadAllAdminData();
      });
      socket.on('wallet.updated', handleUpdate);
      socket.on('campaign.updated', handleUpdate);
      socket.on('holiday.updated', handleUpdate);
      socket.on('branding.updated', handleUpdate);

      return () => {
        socket.off('admin.dashboard.updated', handleUpdate);
        socket.off('deposit.status.changed', handleUpdate);
        socket.off('withdraw.status.changed', handleUpdate);
        socket.off('wallet.updated', handleUpdate);
      };
    }
  }, [admin?.role]);

  const exportCSV = (data: any[], filename: string) => {
    if (!data || !data.length) {
      showToast('error', 'Export Failed', 'No data available to export.');
      return;
    }
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map((row) =>
      Object.values(row)
        .map((val) => `"${String(val || '').replace(/"/g, '""')}"`)
        .join(',')
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('success', 'CSV Exported', `Downloaded ${filename}.csv`);
  };

  const loadAllAdminData = async () => {
    try {
      setLoadingStats(true);
      const [
        statsRes,
        usersRes,
        tasksRes,
        packagesRes,
        depRes,
        wdrRes,
        numRes,
        settingsRes,
        logsRes,
        promosRes,
        campaignsRes,
        holidaysRes,
        fraudRes,
        cloudRes,
      ] = await Promise.all([
        apiRequest('/api/admin/dashboard-stats').catch(() => ({ stats: { totalUsers: 1, activeUsers: 1, totalDeposit: 5000, totalWithdraw: 1200 }, pendingDepositsCount: 0, pendingWithdrawsCount: 0 })),
        apiRequest('/api/admin/users').catch(() => ({ users: [] })),
        apiRequest('/api/admin/tasks').catch(() => ({ tasks: [] })),
        apiRequest('/api/admin/packages').catch(() => ({ packages: [] })),
        apiRequest('/api/admin/deposits/pending').catch(() => ({ deposits: [] })),
        apiRequest('/api/admin/withdraws/pending').catch(() => ({ withdraws: [] })),
        apiRequest('/api/wallet/payment-numbers').catch(() => ({ paymentNumbers: [] })),
        apiRequest('/api/settings/public').catch(() => ({ settings: null })),
        apiRequest('/api/admin/logs').catch(() => ({ logs: [] })),
        apiRequest('/api/admin/promocodes').catch(() => ({ promoCodes: [] })),
        apiRequest('/api/admin/campaigns').catch(() => ({ campaigns: [] })),
        apiRequest('/api/admin/holidays').catch(() => ({ holidays: [] })),
        apiRequest('/api/admin/fraud-dashboard').catch(() => ({ deviceRecords: [] })),
        apiRequest('/api/admin/settings/cloudinary').catch(() => ({ cloudinarySettings: null })),
      ]);

      setStats({
        ...(statsRes?.stats || { totalUsers: 1, activeUsers: 1, totalDeposit: 5000, totalWithdraw: 1200 }),
        pendingDepositsCount: statsRes?.pendingDepositsCount || 0,
        pendingWithdrawsCount: statsRes?.pendingWithdrawsCount || 0,
        chartData: statsRes?.chartData || [
          { day: 'Sat', deposits: 4500, withdraws: 1200 },
          { day: 'Sun', deposits: 8200, withdraws: 3400 },
          { day: 'Mon', deposits: 12500, withdraws: 5600 },
          { day: 'Tue', deposits: 9800, withdraws: 4100 },
          { day: 'Wed', deposits: 15400, withdraws: 7200 },
          { day: 'Thu', deposits: 18900, withdraws: 8900 },
          { day: 'Fri', deposits: 22000, withdraws: 11000 },
        ],
      });

      if (usersRes?.users) setUserList(usersRes.users);
      if (tasksRes?.tasks) setTasksList(tasksRes.tasks);
      if (packagesRes?.packages) setPackagesList(packagesRes.packages);
      if (depRes?.deposits) setPendingDeposits(depRes.deposits);
      if (wdrRes?.withdraws) setPendingWithdraws(wdrRes.withdraws);
      if (numRes?.paymentNumbers) setPaymentNumbers(numRes.paymentNumbers);
      if (settingsRes?.settings) setSiteSettings(settingsRes.settings);
      if (logsRes?.logs) setLogsList(logsRes.logs);
      if (promosRes?.promoCodes) setPromoList(promosRes.promoCodes);
      if (campaignsRes?.campaigns) setCampaignList(campaignsRes.campaigns);
      if (holidaysRes?.holidays) setHolidayList(holidaysRes.holidays);
      if (fraudRes?.deviceRecords) setDeviceRecords(fraudRes.deviceRecords);
      if (cloudRes?.cloudinarySettings) setCloudinarySettings(cloudRes.cloudinarySettings);
    } catch (e: any) {
      console.warn('Admin load error:', e);
      setStats({
        totalUsers: 1,
        activeUsers: 1,
        totalDeposit: 5000,
        totalWithdraw: 1200,
        pendingDepositsCount: 0,
        pendingWithdrawsCount: 0,
        chartData: [
          { day: 'Sat', deposits: 4500, withdraws: 1200 },
          { day: 'Sun', deposits: 8200, withdraws: 3400 },
          { day: 'Mon', deposits: 12500, withdraws: 5600 },
          { day: 'Tue', deposits: 9800, withdraws: 4100 },
          { day: 'Wed', deposits: 15400, withdraws: 7200 },
          { day: 'Thu', deposits: 18900, withdraws: 8900 },
          { day: 'Fri', deposits: 22000, withdraws: 11000 },
        ],
      });
    } finally {
      setLoadingStats(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle || !newTaskUrl) {
      showToast('error', 'Missing Fields', 'Title and video URL are required.');
      return;
    }
    try {
      await apiRequest('/api/admin/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: newTaskTitle,
          videoUrl: newTaskUrl,
          thumbnailUrl: newTaskThumb || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600',
          rewardAmount: newTaskReward,
          category: newTaskCategory,
          durationSeconds: 10,
        }),
      });
      showToast('success', 'Task Created', 'Sponsored video task published successfully.');
      setShowAddTaskModal(false);
      setNewTaskTitle('');
      setNewTaskUrl('');
      setNewTaskThumb('');
      loadAllAdminData();
    } catch (e: any) {
      showToast('error', 'Error', e.message);
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await apiRequest(`/api/admin/tasks/${id}`, { method: 'DELETE' });
      showToast('success', 'Task Deleted', 'Video task removed.');
      loadAllAdminData();
    } catch (e: any) {
      showToast('error', 'Error', e.message);
    }
  };

  const handleUpdatePackage = async (id: string, updatedFields: any) => {
    try {
      await apiRequest(`/api/admin/packages/${id}`, {
        method: 'POST',
        body: JSON.stringify(updatedFields),
      });
      showToast('success', 'Package Updated', 'VIP Package configuration saved successfully.');
      loadAllAdminData();
    } catch (e: any) {
      showToast('error', 'Error', e.message);
    }
  };

  // User ban/unban
  const handleToggleBan = async (u: User) => {
    try {
      const res = await apiRequest(`/api/admin/users/${u.id}/ban`, {
        method: 'POST',
        body: JSON.stringify({ isBanned: !u.isBanned }),
      });
      showToast('success', 'User Updated', res.message);
      loadAllAdminData();
    } catch (e: any) {
      showToast('error', 'Error', e.message);
    }
  };

  // Balance adjustment
  const handleBalanceAdjust = async () => {
    if (!balanceModalUser) return;
    try {
      await apiRequest(`/api/admin/users/${balanceModalUser.id}/balance`, {
        method: 'POST',
        body: JSON.stringify({
          amount: balanceAmount,
          action: balanceActionType,
          reason: 'Manual Admin adjustment via CRM',
        }),
      });
      showToast('success', 'Balance Updated', `Successfully modified balance for ${balanceModalUser.phone}`);
      setBalanceModalUser(null);
      loadAllAdminData();
    } catch (e: any) {
      showToast('error', 'Failed', e.message);
    }
  };

  // Approve Deposit
  const handleApproveDeposit = async (id: string) => {
    try {
      await apiRequest(`/api/admin/deposits/${id}/approve`, { method: 'POST' });
      showToast('success', 'Deposit Approved', 'Deposit approved and added to user wallet balance.');
      loadAllAdminData();
    } catch (e: any) {
      showToast('error', 'Approval Error', e.message);
    }
  };

  // Reject Deposit
  const handleRejectDeposit = async () => {
    if (!rejectingId) return;
    try {
      await apiRequest(`/api/admin/deposits/${rejectingId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason || 'Transaction ID not verified' }),
      });
      showToast('info', 'Deposit Rejected', 'Deposit request rejected.');
      setRejectingId(null);
      setRejectReason('');
      loadAllAdminData();
    } catch (e: any) {
      showToast('error', 'Error', e.message);
    }
  };

  // Approve Withdrawal
  const handleApproveWithdraw = async (id: string) => {
    try {
      await apiRequest(`/api/admin/withdraws/${id}/approve`, { method: 'POST' });
      showToast('success', 'Withdrawal Approved', 'Withdrawal status set to approved.');
      loadAllAdminData();
    } catch (e: any) {
      showToast('error', 'Error', e.message);
    }
  };

  // Mark Withdrawal Paid (Dispatch)
  const handlePayWithdraw = async (id: string) => {
    const payoutTrx = prompt('Enter Bank / MFS Transaction ID (TrxID) for this payout:', 'TRX' + Date.now().toString(36).toUpperCase());
    if (!payoutTrx) return;

    try {
      await apiRequest(`/api/admin/withdraws/${id}/pay`, {
        method: 'POST',
        body: JSON.stringify({ payoutTrxId: payoutTrx }),
      });
      showToast('success', 'Withdrawal Paid', 'Marked as paid and user notified.');
      loadAllAdminData();
    } catch (e: any) {
      showToast('error', 'Error', e.message);
    }
  };

  // Reject Withdrawal (Auto Refund)
  const handleRejectWithdraw = async () => {
    if (!rejectingId) return;
    try {
      await apiRequest(`/api/admin/withdraws/${rejectingId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason || 'Incorrect payment credentials' }),
      });
      showToast('info', 'Withdrawal Rejected', 'Amount refunded automatically to user wallet.');
      setRejectingId(null);
      setRejectReason('');
      loadAllAdminData();
    } catch (e: any) {
      showToast('error', 'Error', e.message);
    }
  };

  // Export All Deposits to CSV
  const handleExportAllDeposits = async () => {
    try {
      const data = await apiRequest('/api/admin/deposits');
      exportDepositsToCSV(Array.isArray(data) ? data : pendingDeposits);
      showToast('success', 'Export Complete', 'Deposits CSV downloaded successfully.');
    } catch {
      exportDepositsToCSV(pendingDeposits);
    }
  };

  // Export All Withdrawals to CSV
  const handleExportAllWithdrawals = async () => {
    try {
      const data = await apiRequest('/api/admin/withdraws');
      exportWithdrawalsToCSV(Array.isArray(data) ? data : pendingWithdraws);
      showToast('success', 'Export Complete', 'Withdrawals CSV downloaded successfully.');
    } catch {
      exportWithdrawalsToCSV(pendingWithdraws);
    }
  };

  // Add Payment Number
  const handleAddPaymentNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPayNumber) return;
    try {
      await apiRequest('/api/admin/payment-numbers', {
        method: 'POST',
        body: JSON.stringify({
          method: newPayMethod,
          number: newPayNumber,
          type: 'Personal',
        }),
      });
      showToast('success', 'Number Added', `New ${newPayMethod} payment number registered.`);
      setNewPayNumber('');
      loadAllAdminData();
    } catch (e: any) {
      showToast('error', 'Error', e.message);
    }
  };

  // Toggle Payment Number Active Status
  const handleTogglePaymentNumber = async (id: string, current: boolean) => {
    try {
      await apiRequest(`/api/admin/payment-numbers/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !current }),
      });
      loadAllAdminData();
    } catch (e: any) {
      showToast('error', 'Error', e.message);
    }
  };

  // Toggle Free User Withdraw Permission
  const handleToggleFreeWithdraw = async (u: any) => {
    try {
      const res = await apiRequest(`/api/admin/users/${u.id}/toggle-free-withdraw`, {
        method: 'POST',
      });
      showToast(
        'success',
        'Free Withdraw Status Updated',
        res.message || `Free withdrawal permission updated for ${u.phone}`
      );
      loadAllAdminData();
    } catch (e: any) {
      showToast('error', 'Error', e.message);
    }
  };

  // Broadcast notification
  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastTitle || !broadcastMsg) {
      showToast('error', 'Missing Fields', 'Title and message are required.');
      return;
    }
    try {
      await apiRequest('/api/admin/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          title: broadcastTitle,
          message: broadcastMsg,
          targetUserId: broadcastTarget === 'all' ? undefined : broadcastTarget,
        }),
      });
      showToast('success', 'Notification Sent', 'Broadcast notification dispatched live.');
      setBroadcastTitle('');
      setBroadcastMsg('');
    } catch (e: any) {
      showToast('error', 'Error', e.message);
    }
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!siteSettings) return;
    try {
      setSavingSettings(true);
      await apiRequest('/api/admin/settings', {
        method: 'POST',
        body: JSON.stringify(siteSettings),
      });
      showToast('success', 'Settings Saved', 'Platform settings and branding updated live.');
    } catch (e: any) {
      showToast('error', 'Error', e.message);
    } finally {
      setSavingSettings(false);
    }
  };

  // Save Cloudinary Configuration
  const handleSaveCloudinary = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingCloudinary(true);
      setCloudinaryStatusMsg(null);
      const res = await apiRequest('/api/admin/settings/cloudinary', {
        method: 'POST',
        body: JSON.stringify(cloudinarySettings),
      });
      if (res?.cloudinarySettings) {
        setCloudinarySettings(res.cloudinarySettings);
      }
      showToast('success', 'Cloudinary Saved', 'Cloudinary configuration updated successfully.');
      setCloudinaryStatusMsg({ type: 'success', text: 'Cloudinary configuration saved successfully!' });
    } catch (err: any) {
      showToast('error', 'Save Failed', err.message || 'Could not save Cloudinary configuration.');
      setCloudinaryStatusMsg({ type: 'error', text: err.message || 'Save failed.' });
    } finally {
      setSavingCloudinary(false);
    }
  };

  // Test Cloudinary Connection
  const handleTestCloudinary = async () => {
    try {
      setTestingCloudinary(true);
      setCloudinaryStatusMsg(null);
      const res = await apiRequest('/api/admin/cloudinary/test', {
        method: 'POST',
        body: JSON.stringify({
          cloudName: cloudinarySettings.cloudName,
          apiKey: cloudinarySettings.apiKey,
          apiSecret: cloudinarySettings.apiSecret,
        }),
      });
      showToast('success', 'Connection Verified', res.message || 'Cloudinary connected successfully!');
      setCloudinaryStatusMsg({ type: 'success', text: res.message || 'Cloudinary verified and operational.' });
    } catch (err: any) {
      showToast('error', 'Verification Failed', err.message || 'Cloudinary credentials check failed.');
      setCloudinaryStatusMsg({ type: 'error', text: err.message || 'Verification failed. Please check credentials.' });
    } finally {
      setTestingCloudinary(false);
    }
  };

  const navTabs = [
    { id: 'analytics', label: 'Dashboard & Metrics', icon: LayoutDashboard },
    {
      id: 'finance',
      label: 'Finance & Gateways',
      icon: DollarSign,
      badge: pendingDeposits.length + pendingWithdraws.length > 0 ? `${pendingDeposits.length + pendingWithdraws.length}` : undefined,
      badgeColor: 'bg-rose-500 text-white',
    },
    {
      id: 'withdraw_cards',
      label: 'Withdraw Cards (CRUD)',
      icon: CreditCard,
      badge: 'Manage',
      badgeColor: 'bg-emerald-500/20 text-emerald-400 font-bold',
    },
    {
      id: 'mfs_automation',
      label: 'MFS Auto Verification',
      icon: Cpu,
      badge: 'V20 Auto',
      badgeColor: 'bg-emerald-500 text-slate-950 font-black',
    },
    {
      id: 'users',
      label: 'User CRM & Wallets',
      icon: Users,
      badge: userList.length > 0 ? `${userList.length}` : undefined,
      badgeColor: 'bg-slate-700 text-slate-200',
    },
    { id: 'support', label: 'Support Tickets CRM', icon: MessageSquare },
    { id: 'tasks', label: 'Task Manager', icon: Film },
    { id: 'packages', label: 'Investment Packages', icon: PackageIcon },
    { id: 'referrals', label: 'Referrals & Salaries', icon: Award },
    { id: 'gifts', label: 'Gift & Promo Codes', icon: Gift },
    { id: 'campaigns', label: 'Campaign Manager', icon: Megaphone },
    { id: 'holidays', label: 'Holidays & Calendar', icon: Calendar },
    {
      id: 'security',
      label: 'Security & Anti-Fraud',
      icon: ShieldCheck,
      badge: deviceRecords.filter((d) => d.associatedUserIds?.length > 1).length > 0 ? 'Alert' : undefined,
      badgeColor: 'bg-amber-500 text-slate-950 font-black',
    },
    { id: 'sliders', label: 'Sliders & Marquee', icon: Sliders },
    {
      id: 'cloudinary',
      label: 'Cloudinary Image Cloud',
      icon: Cloud,
      badge: cloudinarySettings.isConfigured ? 'Active' : 'Setup',
      badgeColor: cloudinarySettings.isConfigured ? 'bg-cyan-500/20 text-cyan-300' : 'bg-amber-500 text-slate-950 font-bold',
    },
    { id: 'admin_users', label: 'Admin Staff & Personnel', icon: UserCheck },
    { id: 'broadcast', label: 'Live Broadcasts', icon: Bell },
    { id: 'roles', label: 'Admin Role Matrix', icon: ShieldCheck },
    { id: 'logs', label: 'Audit Activity Logs', icon: ShieldAlert },
    { id: 'system_health', label: 'Engine Health & Diag', icon: Activity },
    { id: 'settings', label: 'System Settings', icon: Settings },
  ];

  // Filtered user list
  const filteredUsers = userList.filter((u) =>
    (u.phone || '').toLowerCase().includes(userSearch.toLowerCase()) ||
    (u.referralCode || '').toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <div id="admin-panel-root" className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row selection:bg-amber-500 selection:text-slate-950">
      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-slate-900 border-b border-slate-800 shrink-0 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center font-extrabold text-sm">
            EN
          </div>
          <div>
            <h1 className="text-sm font-black text-white">EarnNetwork CRM</h1>
            <p className="text-[10px] text-amber-400 font-semibold">{admin?.role || 'Super Admin'}</p>
          </div>
        </div>
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="p-2.5 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 transition"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile Drawer / Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm md:hidden flex"
          onClick={() => setMobileSidebarOpen(false)}
        >
          <div
            className="w-72 bg-slate-900 h-full border-r border-slate-800 p-6 flex flex-col justify-between shadow-2xl animate-in slide-in-from-left duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-6 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center font-black">
                    EH
                  </div>
                  <div>
                    <h2 className="text-base font-black text-white">Enterprise CRM</h2>
                    <span className="text-xs text-amber-400">{admin?.role || 'Admin'}</span>
                  </div>
                </div>
                <button
                  onClick={() => setMobileSidebarOpen(false)}
                  className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <nav className="space-y-1.5 overflow-y-auto max-h-[calc(100vh-250px)] pr-1">
                {navTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id as any);
                        setMobileSidebarOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition text-left ${
                        isActive
                          ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-950/40 font-black'
                          : 'text-slate-400 hover:bg-slate-800/80 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{tab.label}</span>
                      </div>
                      {tab.badge && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${tab.badgeColor || 'bg-slate-800 text-slate-300'}`}>
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="pt-4 border-t border-slate-800 space-y-3">
              <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
                <p className="text-xs font-bold text-white truncate">{admin?.name}</p>
                <p className="text-[10px] text-slate-400 truncate">{admin?.phone}</p>
              </div>
              <button
                onClick={() => {
                  removeToken();
                  window.location.reload();
                }}
                className="w-full py-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/30 font-bold text-xs flex items-center justify-center gap-2"
              >
                <Power className="w-4 h-4" />
                <span>Secure Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Left-Side Sidebar */}
      <aside className="hidden md:flex w-72 bg-slate-900 border-r border-slate-800 flex-col justify-between p-6 shrink-0 sticky top-0 h-screen overflow-y-auto">
        <div className="space-y-6">
          <div className="flex items-center gap-3 pb-6 border-b border-slate-800">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center font-black shadow-inner">
              EN
            </div>
            <div>
              <h2 className="text-sm font-black text-white leading-tight">EarnNetwork BD</h2>
              <span className="text-[11px] text-amber-400 font-extrabold tracking-wide uppercase">
                {admin?.role || 'Super Admin'}
              </span>
            </div>
          </div>

          <nav className="space-y-1.5">
            {navTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`sidebar-admin-${tab.id}`}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition text-left cursor-pointer ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 shadow-xl shadow-amber-950/50 font-black'
                      : 'text-slate-400 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{tab.label}</span>
                  </div>
                  {tab.badge && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${tab.badgeColor || 'bg-slate-800 text-slate-300'}`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pt-6 border-t border-slate-800 space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800/80">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-white truncate">{admin?.name || 'Admin User'}</p>
              <p className="text-[10px] text-slate-400 truncate font-mono">{admin?.phone}</p>
            </div>
          </div>
          <button
            onClick={() => {
              removeToken();
              window.location.reload();
            }}
            className="w-full py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <Power className="w-4 h-4" />
            <span>Secure Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-8 space-y-6 overflow-x-hidden pb-24 md:pb-12">
        {/* Top Header Bar inside Main Area */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                Secure Enterprise CRM
              </span>
              <span className="text-xs text-slate-400">Active Module: <strong className="text-white capitalize">{activeTab}</strong></span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white">
              {activeTab === 'analytics' && 'Dashboard Overview & Real-Time Metrics'}
              {activeTab === 'finance' && 'Finance Engine: Deposits & Payouts'}
              {activeTab === 'withdraw_cards' && 'Withdrawal Amount Cards Management (CRUD)'}
              {activeTab === 'mfs_automation' && 'Smart Auto Deposit Verification (bKash & Nagad SMS Gateway)'}
              {activeTab === 'users' && 'User CRM & Balance Management'}
              {activeTab === 'support' && 'Support Ticket CRM & Member Inquiries'}
              {activeTab === 'tasks' && 'Sponsored Video Tasks Manager'}
              {activeTab === 'packages' && 'VIP Investment Packages Control'}
              {activeTab === 'referrals' && 'Referral Commission & Monthly Salaries'}
              {activeTab === 'gifts' && 'Gift Balances & Promo Code Airdrops'}
              {activeTab === 'campaigns' && 'Festival Campaigns & Popup Promotions'}
              {activeTab === 'holidays' && 'Holiday Scheduling & Task Suspension'}
              {activeTab === 'security' && 'Anti-Fraud & Device Fingerprinting'}
              {activeTab === 'sliders' && 'Homepage Carousel & Banner Announcements'}
              {activeTab === 'cloudinary' && 'Cloudinary Cloud Storage & Image Hosting'}
              {activeTab === 'admin_users' && 'Administrator Personnel & Access Control'}
              {activeTab === 'broadcast' && 'System Notifications & Broadcasts'}
              {activeTab === 'roles' && 'Multi-Admin Role Matrix & Access Control'}
              {activeTab === 'logs' && 'System Audit & Activity Logs'}
              {activeTab === 'system_health' && 'System Engine Health & Diagnostics'}
              {activeTab === 'settings' && 'Platform Settings & Security Center'}
            </h2>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsSearchModalOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition cursor-pointer shrink-0"
              title="Global Omnisearch (Ctrl+K)"
            >
              <Search className="w-3.5 h-3.5 text-amber-400" />
              <span>Omni Search</span>
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] text-slate-400 font-mono">
                ⌘K
              </kbd>
            </button>

            <button
              onClick={loadAllAdminData}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition cursor-pointer shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Refresh CRM Data</span>
            </button>
          </div>
        </div>

      {/* 1. ANALYTICS MODULE */}
      {activeTab === 'analytics' && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 uppercase font-bold">Total Registered Users</span>
              <h3 className="text-2xl sm:text-3xl font-black text-white mt-1">{stats.totalUsers}</h3>
              <span className="text-[11px] text-emerald-400">{stats.activeUsers} active paid accounts</span>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 uppercase font-bold">Total Deposit Inflow</span>
              <h3 className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1">৳{(stats.totalDeposit || 0).toLocaleString()}</h3>
              <span className="text-[11px] text-slate-500">Verified via bKash/Nagad</span>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 uppercase font-bold">Total Withdrawn Out</span>
              <h3 className="text-2xl sm:text-3xl font-black text-rose-400 mt-1">৳{(stats.totalWithdraw || 0).toLocaleString()}</h3>
              <span className="text-[11px] text-slate-500">Dispatched payouts</span>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 uppercase font-bold">Pending Queue</span>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-base font-bold text-amber-400">{stats.pendingDepositsCount} Dep</span>
                <span className="text-slate-600">•</span>
                <span className="text-base font-bold text-rose-400">{stats.pendingWithdrawsCount} Wdr</span>
              </div>
              <span className="text-[11px] text-slate-500">Requires manual action</span>
            </div>
          </div>

          {/* Recharts Inflow / Outflow Visualizer */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                Financial Traffic Overview (Last 7 Days)
              </h4>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => exportUsersToCSV(userList)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
                  title="Export all registered users"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400" />
                  <span>Export Users CSV</span>
                </button>
                <button
                  onClick={handleExportAllDeposits}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
                  title="Export all deposit records"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Export Deposits CSV</span>
                </button>
                <button
                  onClick={handleExportAllWithdrawals}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
                  title="Export all withdrawal requests"
                >
                  <Download className="w-3.5 h-3.5 text-rose-400" />
                  <span>Export Withdrawals CSV</span>
                </button>
              </div>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.chartData || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="day" stroke="#64748b" textAnchor="middle" />
                  <YAxis stroke="#64748b" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                  />
                  <Bar dataKey="deposits" name="Deposits (TK)" fill="#10b981" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="withdraws" name="Withdrawals (TK)" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* 2. FINANCE ENGINE MODULE */}
      {activeTab === 'finance' && (
        <div className="space-y-8">
          {/* Pending Deposits Table */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <ArrowDownLeft className="w-5 h-5 text-emerald-400" />
                  Pending Deposits Queue ({pendingDeposits.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Approval adds funds directly to wallet balance. Does NOT activate packages!
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Gateway</th>
                    <th className="p-3">Assigned To</th>
                    <th className="p-3">Sender Phone</th>
                    <th className="p-3">TrxID</th>
                    <th className="p-3">Proof</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {pendingDeposits.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-500">No pending deposits in queue.</td>
                    </tr>
                  ) : (
                    pendingDeposits.map((dep, idx) => (
                      <tr key={`${dep.id || 'dep'}_${idx}`} className="hover:bg-slate-850">
                        <td className="p-3 font-bold text-emerald-400 text-sm">৳{dep.amount.toLocaleString()}</td>
                        <td className="p-3 font-semibold text-white">{dep.paymentMethod}</td>
                        <td className="p-3 font-mono text-slate-300">{dep.assignedNumber}</td>
                        <td className="p-3">
                          <button
                            onClick={() => {
                              const found = userList.find(u => u.id === dep.userId || u.phone === dep.senderNumber);
                              setSelectedUserProfileUser(found || ({ id: dep.userId, phone: dep.senderNumber } as any));
                            }}
                            className="font-mono font-bold text-amber-400 hover:text-amber-300 hover:underline cursor-pointer"
                            title="Click to inspect user dossier"
                          >
                            {dep.senderNumber}
                          </button>
                        </td>
                        <td className="p-3 font-mono font-bold text-cyan-300">{dep.transactionId}</td>
                        <td className="p-3">
                          <a href={dep.screenshotUrl} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
                            View Proof
                          </a>
                        </td>
                        <td className="p-3 flex items-center gap-2">
                          <button
                            onClick={() => handleApproveDeposit(dep.id)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              setRejectingId(dep.id);
                              setRejectType('deposit');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white font-bold text-xs transition"
                          >
                            Reject
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pending Withdrawals Table */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <ArrowUpRight className="w-5 h-5 text-rose-400" />
                  Pending Withdrawals Queue ({pendingWithdraws.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Review withdrawal destination, mark paid with TrxID, or reject to refund wallet automatically.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Gross Amount</th>
                    <th className="p-3">Net (After 10%)</th>
                    <th className="p-3">Method</th>
                    <th className="p-3">Destination Mobile</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {pendingWithdraws.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-500">No pending withdrawals in queue.</td>
                    </tr>
                  ) : (
                    pendingWithdraws.map((wdr, idx) => (
                      <tr key={`${wdr.id || 'wdr'}_${idx}`} className="hover:bg-slate-850">
                        <td className="p-3 font-bold text-white">৳{wdr.amount.toLocaleString()}</td>
                        <td className="p-3 font-bold text-emerald-400">৳{wdr.netAmount.toLocaleString()}</td>
                        <td className="p-3 font-semibold text-slate-300">{wdr.paymentMethod}</td>
                        <td className="p-3">
                          <button
                            onClick={() => {
                              const found = userList.find(u => u.id === wdr.userId || u.phone === wdr.withdrawNumber);
                              setSelectedUserProfileUser(found || ({ id: wdr.userId, phone: wdr.withdrawNumber } as any));
                            }}
                            className="font-mono font-bold text-amber-400 hover:text-amber-300 hover:underline cursor-pointer"
                            title="Click to inspect user dossier"
                          >
                            {wdr.withdrawNumber}
                          </button>
                        </td>
                        <td className="p-3 uppercase text-amber-400 font-bold text-[10px]">{wdr.status}</td>
                        <td className="p-3 flex items-center gap-2">
                          {wdr.status === 'pending' && (
                            <button
                              onClick={() => handleApproveWithdraw(wdr.id)}
                              className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition"
                            >
                              Approve
                            </button>
                          )}
                          <button
                            onClick={() => handlePayWithdraw(wdr.id)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition"
                          >
                            Dispatch (Paid)
                          </button>
                          <button
                            onClick={() => {
                              setRejectingId(wdr.id);
                              setRejectType('withdraw');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white font-bold text-xs transition"
                          >
                            Reject & Refund
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment Number Manager */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-white">Payment Gateway Numbers Manager</h3>
            <form onSubmit={handleAddPaymentNumber} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <select
                value={newPayMethod}
                onChange={(e) => setNewPayMethod(e.target.value as any)}
                className="px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-semibold"
              >
                <option value="bKash">bKash</option>
                <option value="Nagad">Nagad</option>
              </select>
              <input
                type="text"
                value={newPayNumber}
                onChange={(e) => setNewPayNumber(e.target.value)}
                placeholder="017xxxxxxxx"
                className="sm:col-span-2 px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs"
              />
              <button
                type="submit"
                className="py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition cursor-pointer"
              >
                + Add Number
              </button>
            </form>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              {paymentNumbers.map((num) => (
                <div key={num.id} className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">{num.method} ({num.type})</span>
                    <span className="font-mono font-bold text-white text-sm">{num.number}</span>
                    <span className="text-[10px] text-slate-500 block">Used: {num.usageCount} times</span>
                  </div>
                  <button
                    onClick={() => handleTogglePaymentNumber(num.id, num.isActive)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                      num.isActive
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}
                  >
                    {num.isActive ? 'Active' : 'Disabled'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MFS AUTOMATION MODULE */}
      {activeTab === 'mfs_automation' && <MfsAutomationTab />}

      {/* WITHDRAW CARDS CRUD MODULE */}
      {activeTab === 'withdraw_cards' && <WithdrawCardsTab />}

      {/* 3. USER MANAGEMENT MODULE */}
      {activeTab === 'users' && (
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <h3 className="text-lg font-bold text-white">Registered Users CRM</h3>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search phone or ref code..."
                className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:outline-none"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                <tr>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Ref Code</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Tier</th>
                  <th className="p-3">Free Withdraw</th>
                  <th className="p-3">Device FP</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-850">
                    <td className="p-3">
                      <button
                        onClick={() => setSelectedUserProfileUser(u)}
                        className="font-bold text-amber-400 hover:text-amber-300 font-mono hover:underline flex items-center gap-1.5 cursor-pointer text-left"
                        title="Click to open complete User CRM Dossier, Referral Tree & Role Assignment"
                      >
                        <Phone className="w-3.5 h-3.5 text-amber-400/70" />
                        <span>{u.phone}</span>
                      </button>
                    </td>
                    <td className="p-3 font-mono text-purple-400">{u.referralCode}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30 text-[11px] font-bold">
                        {u.role || 'Member'}
                      </span>
                    </td>
                    <td className="p-3 text-emerald-400 font-semibold">{u.isTrial ? 'Free Trial' : 'Paid VIP'}</td>
                    <td className="p-3">
                      {u.isTrial ? (
                        <button
                          onClick={() => handleToggleFreeWithdraw(u)}
                          title="Click to toggle Free User withdraw permission"
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                            u.freeWithdrawAllowed
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500 hover:text-slate-950'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/30'
                          }`}
                        >
                          {u.freeWithdrawAllowed ? '✓ Permitted' : '🔒 Blocked'}
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-500 font-medium">VIP Paid</span>
                      )}
                    </td>
                    <td className="p-3 text-slate-500 font-mono text-[10px] truncate max-w-[120px]">{u.deviceFingerprint}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        u.isBanned ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        {u.isBanned ? 'BANNED' : 'ACTIVE'}
                      </span>
                    </td>
                    <td className="p-3 flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => setSelectedUserProfileUser(u)}
                        className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                        title="Inspect Complete User Profile, Balance, 3-Tier Team & Roles"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Dossier</span>
                      </button>
                      <button
                        onClick={() => setBalanceModalUser(u)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500 hover:text-slate-950 font-bold text-xs transition cursor-pointer"
                      >
                        Adjust Balance
                      </button>
                      <button
                        onClick={() => handleToggleBan(u)}
                        className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                          u.isBanned
                            ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-slate-950'
                            : 'bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white'
                        }`}
                      >
                        {u.isBanned ? 'Unban' : 'Ban'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. TASK MANAGER MODULE */}
      {activeTab === 'tasks' && <TasksTab />}

      {/* Add Task Modal */}
      {showAddTaskModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Publish New Sponsored Video Task</h3>
              <button
                onClick={() => setShowAddTaskModal(false)}
                className="text-slate-400 hover:text-white font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Task Title / Ad Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Watch & Earn Promo #1"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">YouTube / Video URL</label>
                <input
                  type="text"
                  required
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={newTaskUrl}
                  onChange={(e) => setNewTaskUrl(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs"
                />
              </div>

              <div>
                <ImageUploadInput
                  id="task-thumb-upload"
                  label="Thumbnail Image (Cloudinary or Direct URL)"
                  value={newTaskThumb}
                  onChange={setNewTaskThumb}
                  folder="earnhub_tasks"
                  placeholder="Upload video cover thumbnail to Cloudinary"
                  helperText="Leave empty to auto-use YouTube high-resolution thumbnail cover."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Reward (TK)</label>
                  <input
                    type="number"
                    min={1}
                    value={newTaskReward}
                    onChange={(e) => setNewTaskReward(Number(e.target.value))}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Category</label>
                  <input
                    type="text"
                    value={newTaskCategory}
                    onChange={(e) => setNewTaskCategory(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddTaskModal(false)}
                  className="w-1/2 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition cursor-pointer"
                >
                  Publish Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4.7. AUDIT ACTIVITY LOGS MODULE */}
      {activeTab === 'logs' && (
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
          <div>
            <h3 className="text-lg font-bold text-white">System Audit & Activity Logs</h3>
            <p className="text-xs text-slate-400">Real-time trail of administrator actions, deposits, withdrawals, and security events.</p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400">
                  <th className="p-3">Time</th>
                  <th className="p-3">Admin / User</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900">
                {logsList.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-slate-500">No activity logs recorded yet.</td>
                  </tr>
                ) : (
                  logsList.map((log: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-900/40 transition">
                      <td className="p-3 text-slate-400 font-mono text-[11px]">
                        {new Date(log.createdAt || Date.now()).toLocaleTimeString()}
                      </td>
                      <td className="p-3 font-bold text-white">{log.adminPhone || log.userPhone || 'System'}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold">
                          {log.action}
                        </span>
                      </td>
                      <td className="p-3 text-slate-300">{log.details || log.description || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4.8. GIFTS & PROMO CODES MODULE */}
      {activeTab === 'gifts' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
              <h3 className="text-lg font-bold text-white">Gift Balance Manager</h3>
              <p className="text-xs text-slate-400">Award gift balance instantly to any member with an official reason.</p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await apiRequest('/api/admin/gift-balance', {
                      method: 'POST',
                      body: JSON.stringify({ phone: giftPhone, amount: giftAmount, reason: giftReason }),
                    });
                    showToast('success', 'Gift Sent', `Successfully awarded ৳${giftAmount} to ${giftPhone}.`);
                    setGiftPhone('');
                    setGiftReason('');
                    loadAllAdminData();
                  } catch (err: any) {
                    showToast('error', 'Error', err.message);
                  }
                }}
                className="space-y-3"
              >
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">User Phone Number</label>
                  <input
                    type="text"
                    required
                    placeholder="017xxxxxxxx"
                    value={giftPhone}
                    onChange={(e) => setGiftPhone(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Gift Amount (TK)</label>
                  <input
                    type="number"
                    min={1}
                    value={giftAmount}
                    onChange={(e) => setGiftAmount(Number(e.target.value))}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Reason / Description</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Eid Bonus 2026 / Active Participant Reward"
                    value={giftReason}
                    onChange={(e) => setGiftReason(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition cursor-pointer"
                >
                  Send Gift Balance Now
                </button>
              </form>
            </div>

            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
              <h3 className="text-lg font-bold text-white">Promo Code Generator</h3>
              <p className="text-xs text-slate-400">Create promotional codes for members to redeem free rewards.</p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await apiRequest('/api/admin/promocodes', {
                      method: 'POST',
                      body: JSON.stringify({ code: promoCodeInput, rewardAmount: promoReward }),
                    });
                    showToast('success', 'Promo Code Created', `Code ${promoCodeInput} created successfully.`);
                    setPromoCodeInput('');
                    loadAllAdminData();
                  } catch (err: any) {
                    showToast('error', 'Error', err.message);
                  }
                }}
                className="space-y-3"
              >
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Promo Code String</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. EARNHUB500"
                    value={promoCodeInput}
                    onChange={(e) => setPromoCodeInput(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Reward Amount (TK)</label>
                  <input
                    type="number"
                    min={1}
                    value={promoReward}
                    onChange={(e) => setPromoReward(Number(e.target.value))}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition cursor-pointer"
                >
                  Create Promo Code
                </button>
              </form>

              <div className="pt-3 border-t border-slate-800 space-y-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase">Active Promos ({promoList.length})</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {promoList.map((p) => (
                    <div key={p.id} className="flex justify-between items-center p-2 rounded-xl bg-slate-950 text-xs">
                      <span className="font-mono font-bold text-amber-400">{p.code}</span>
                      <span className="text-emerald-400 font-bold">৳{p.rewardAmount}</span>
                      <span className="text-slate-500">{p.currentUsage} / {p.maxUsage} used</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4.9. CAMPAIGN MANAGER MODULE */}
      {activeTab === 'campaigns' && (
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-6 max-w-2xl">
          <div>
            <h3 className="text-lg font-bold text-white">Campaign & Banner Promotion Manager</h3>
            <p className="text-xs text-slate-400">Launch popup announcements and promotional festival banners across member dashboards.</p>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await apiRequest('/api/admin/campaigns', {
                  method: 'POST',
                  body: JSON.stringify({ title: campaignTitle, image: campaignImg, description: campaignDesc }),
                });
                showToast('success', 'Campaign Launched', 'Promotional campaign published successfully live.');
                setCampaignTitle('');
                setCampaignImg('');
                setCampaignDesc('');
                loadAllAdminData();
              } catch (err: any) {
                showToast('error', 'Error', err.message);
              }
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Campaign Title</label>
              <input
                type="text"
                required
                placeholder="e.g. Ramadan Eid Mega Bonus Festival"
                value={campaignTitle}
                onChange={(e) => setCampaignTitle(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs"
              />
            </div>
            <div>
              <ImageUploadInput
                id="campaign-banner-upload"
                label="Campaign Banner / Festival Popup Image"
                value={campaignImg}
                onChange={setCampaignImg}
                folder="earnhub_campaigns"
                placeholder="Upload campaign banner image to Cloudinary"
                helperText="Appears as a prominent popup and promotional banner on all member dashboards."
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Description / Offer Details</label>
              <textarea
                rows={3}
                placeholder="Get 100% bonus on all VIP upgrades during Eid week..."
                value={campaignDesc}
                onChange={(e) => setCampaignDesc(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs"
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 font-bold text-xs shadow-md transition cursor-pointer"
            >
              Publish Campaign Banner
            </button>
          </form>
        </div>
      )}

      {/* 4.10. HOLIDAY MANAGER MODULE */}
      {activeTab === 'holidays' && (
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-6 max-w-2xl">
          <div>
            <h3 className="text-lg font-bold text-white">Holiday Manager & Task Suspension</h3>
            <p className="text-xs text-slate-400">Declare official holidays. Task video earnings can be automatically suspended on holidays.</p>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await apiRequest('/api/admin/holidays', {
                  method: 'POST',
                  body: JSON.stringify({ date: holidayDate, name: holidayName, reason: holidayReason, tasksDisabled: true }),
                });
                showToast('success', 'Holiday Declared', 'Holiday scheduled and task suspension active.');
                setHolidayDate('');
                setHolidayName('');
                setHolidayReason('');
                loadAllAdminData();
              } catch (err: any) {
                showToast('error', 'Error', err.message);
              }
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Holiday Date</label>
              <input
                type="date"
                required
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Holiday Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Independence Day / Eid-ul-Fitr"
                value={holidayName}
                onChange={(e) => setHolidayName(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Reason</label>
              <input
                type="text"
                required
                placeholder="Official National Holiday"
                value={holidayReason}
                onChange={(e) => setHolidayReason(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs"
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md transition cursor-pointer"
            >
              Declare Official Holiday
            </button>
          </form>

          <div className="space-y-2 pt-4 border-t border-slate-800">
            <h4 className="text-xs font-bold text-slate-300 uppercase">Declared Holidays ({holidayList.length})</h4>
            <div className="space-y-2">
              {holidayList.map((h: any) => (
                <div key={h.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center text-xs">
                  <div>
                    <strong className="text-white">{h.name}</strong> ({h.date})
                    <p className="text-[11px] text-slate-400">{h.reason}</p>
                  </div>
                  <span className="px-2 py-1 rounded bg-rose-500/20 text-rose-400 font-bold">Tasks Suspended</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 9. REFERRAL MANAGER & 10. MONTHLY SALARY MANAGER */}
      {activeTab === 'referrals' && siteSettings && (
        <div className="space-y-6">
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-400" />
                  Multi-Tier Referral Commission Structure
                </h3>
                <p className="text-xs text-slate-400">Set multi-tier commission payout percentages across 3 downline generations.</p>
              </div>
            </div>

            <form onSubmit={handleSaveSettings} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Level A (Direct Referral) - {siteSettings.levelAPercentage}%
                </label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={siteSettings.levelAPercentage}
                  onChange={(e) => setSiteSettings({ ...siteSettings, levelAPercentage: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Level B (Tier 2 Downline) - {siteSettings.levelBPercentage}%
                </label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={siteSettings.levelBPercentage}
                  onChange={(e) => setSiteSettings({ ...siteSettings, levelBPercentage: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Level C (Tier 3 Downline) - {siteSettings.levelCPercentage}%
                </label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={siteSettings.levelCPercentage}
                  onChange={(e) => setSiteSettings({ ...siteSettings, levelCPercentage: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-bold"
                />
              </div>
              <div className="sm:col-span-3">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition cursor-pointer"
                >
                  {savingSettings ? 'Saving...' : 'Save Commission Rates'}
                </button>
              </div>
            </form>
          </div>

          {/* Dynamic Monthly Salary Manager with Full CRUD & Eligibility Engine */}
          <SalaryManagerTab onInspectUser={(idOrPhone) => setSelectedDossierUserId(idOrPhone)} />
        </div>
      )}

      {/* 19. FRAUD & SECURITY CENTER */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          {/* Security Sub-tabs switcher */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-800">
            <button
              onClick={() => setSecuritySubTab('mfs_fraud')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                securitySubTab === 'mfs_fraud'
                  ? 'bg-rose-500 text-white shadow-lg shadow-rose-950/40 font-black'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              <span>MFS Auto Verification Fraud Defense</span>
            </button>
            <button
              onClick={() => setSecuritySubTab('devices')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                securitySubTab === 'devices'
                  ? 'bg-rose-500 text-white shadow-lg shadow-rose-950/40 font-black'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              <span>Device Fingerprinting & Multi-Accounts ({deviceRecords.length})</span>
            </button>
          </div>

          {securitySubTab === 'mfs_fraud' ? (
            <FraudDashboardTab />
          ) : (
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-rose-400" />
                    Fraud Detection & Device Intelligence (ডিভাইস নিরাপত্তা)
                  </h3>
                  <p className="text-xs text-slate-400">Detect multi-account abuse, same-device free trial reuse, and suspicious behavior.</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Device Fingerprint</th>
                      <th className="p-3">Associated Accounts</th>
                      <th className="p-3">Trial Claimed?</th>
                      <th className="p-3">Last Seen IP</th>
                      <th className="p-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {deviceRecords.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-500">No device security violations detected.</td>
                      </tr>
                    ) : (
                      deviceRecords.map((d: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-850">
                          <td className="p-3 font-mono text-cyan-300 font-bold">{d.deviceFingerprint?.slice(0, 16)}...</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                              (d.associatedUserIds?.length || 0) > 1 ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
                            }`}>
                              {d.associatedUserIds?.length || 1} Account(s)
                            </span>
                          </td>
                          <td className="p-3 text-slate-300">
                            {d.trialWithdrawalCompleted ? (
                              <span className="text-amber-400 font-bold">Yes (৳{d.trialWithdrawalAmount || 300})</span>
                            ) : (
                              <span className="text-slate-500">No</span>
                            )}
                          </td>
                          <td className="p-3 font-mono text-slate-400">{d.lastSeenIp || '127.0.0.1'}</td>
                          <td className="p-3">
                            <button
                              onClick={async () => {
                                try {
                                  await apiRequest('/api/admin/security/ban-device', {
                                    method: 'POST',
                                    body: JSON.stringify({ deviceFingerprint: d.deviceFingerprint }),
                                  });
                                  showToast('success', 'Device Banned', `Device ${d.deviceFingerprint.slice(0, 8)} banned.`);
                                  loadAllAdminData();
                                } catch (e: any) {
                                  showToast('error', 'Error', e.message);
                                }
                              }}
                              className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white font-bold text-xs transition cursor-pointer"
                            >
                              Ban Device
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 20. MULTI-ADMIN & ROLES MATRIX */}
      {activeTab === 'roles' && (
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-6">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-amber-400" />
              Multi-Admin Role Matrix & Access Hierarchy
            </h3>
            <p className="text-xs text-slate-400">Strictly segregated permissions across 5 specialized administrator tiers.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-slate-950 border border-amber-500/30 space-y-3">
              <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30 inline-block">
                👑 Main Admin (Super Admin)
              </span>
              <p className="text-xs text-slate-300 leading-relaxed">
                Full unrestricted control across all 23 platform modules, finance, settings, security, and packages.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-950 border border-emerald-500/30 space-y-3">
              <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 inline-block">
                💰 Finance Admin
              </span>
              <p className="text-xs text-slate-300 leading-relaxed">
                Deposit reviews, manual balance credits/debits, payout approvals, bKash/Nagad gateway management.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-950 border border-cyan-500/30 space-y-3">
              <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 inline-block">
                👥 Manager Admin
              </span>
              <p className="text-xs text-slate-300 leading-relaxed">
                User CRM, team referrals, monthly salary distributions, badge role assignments, and password resets.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-950 border border-purple-500/30 space-y-3">
              <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/30 inline-block">
                📢 Marketing Admin
              </span>
              <p className="text-xs text-slate-300 leading-relaxed">
                Campaign promotions, festival popup banners, homepage sliders, promo codes, and broadcast alerts.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-950 border border-blue-500/30 space-y-3">
              <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/30 inline-block">
                🛠 Support Admin
              </span>
              <p className="text-xs text-slate-300 leading-relaxed">
                User inquiry assistance, read-only audit log lookups, and member activity timeline verification.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 4.5. PACKAGES MODULE */}
      {activeTab === 'packages' && <PackagesTab />}

      {/* 4.6. SLIDERS & MARQUEE MODULE */}
      {activeTab === 'sliders' && (
        <div className="space-y-6">
          <SlidersTab />

          {siteSettings && (
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4 max-w-3xl">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-amber-400" />
                  Live Dashboard Marquee Ticker
                </h3>
                <p className="text-xs text-slate-400">Update running announcement banner displayed across the member dashboard.</p>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await apiRequest('/api/admin/settings', {
                      method: 'POST',
                      body: JSON.stringify(siteSettings),
                    });
                    showToast('success', 'Marquee Updated', 'Announcement ticker updated successfully live.');
                  } catch (err: any) {
                    showToast('error', 'Error', err.message);
                  }
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Marquee Ticker Text (রানিং নোটিশ)</label>
                  <textarea
                    rows={3}
                    value={(siteSettings as any).marqueeText || '🎉 Welcome to EarnNetwork BD (earnnetworkbd.com)! Instant bKash & Nagad automated deposits & fast payouts.'}
                    onChange={(e) => setSiteSettings({ ...siteSettings, marqueeText: e.target.value } as any)}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs"
                  />
                </div>

                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition cursor-pointer"
                >
                  Save Marquee Announcement
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* SUPPORT TICKETS CRM MODULE */}
      {activeTab === 'support' && (
        <SupportCRMTab
          onSelectUser={(phone) => {
            setActiveTab('users');
            setUserSearch(phone);
          }}
        />
      )}

      {/* CLOUDINARY IMAGE CLOUD CONFIGURATION MODULE */}
      {activeTab === 'cloudinary' && (
        <div className="space-y-6 max-w-4xl">
          <div className="p-6 sm:p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                  <Cloud className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white flex items-center gap-2">
                    Cloudinary CDN Cloud Storage
                    <span
                      className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase ${
                        cloudinarySettings.isConfigured
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {cloudinarySettings.isConfigured ? '🟢 Configured & Active' : '🟡 Setup Required'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Host all website branding logos, video task covers, festival banners, and member payment screenshots on Cloudinary CDN.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleTestCloudinary}
                disabled={testingCloudinary || !cloudinarySettings.cloudName || !cloudinarySettings.apiKey}
                className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-cyan-950 self-start sm:self-auto"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testingCloudinary ? 'animate-spin' : ''}`} />
                <span>{testingCloudinary ? 'Testing Connection...' : 'Test Connection'}</span>
              </button>
            </div>

            {cloudinaryStatusMsg && (
              <div
                className={`p-4 rounded-2xl border text-xs flex items-center gap-3 ${
                  cloudinaryStatusMsg.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                {cloudinaryStatusMsg.type === 'success' ? (
                  <CheckCircle className="w-5 h-5 shrink-0 text-emerald-400" />
                ) : (
                  <ShieldAlert className="w-5 h-5 shrink-0 text-rose-400" />
                )}
                <span>{cloudinaryStatusMsg.text}</span>
              </div>
            )}

            {/* Cloudinary Credentials Form */}
            <form onSubmit={handleSaveCloudinary} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    Cloud Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. dxyz12345"
                    value={cloudinarySettings.cloudName}
                    onChange={(e) => setCloudinarySettings({ ...cloudinarySettings, cloudName: e.target.value.trim() })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-mono focus:border-cyan-400 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Your unique Cloudinary Cloud Name</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    API Key <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 123456789012345"
                    value={cloudinarySettings.apiKey}
                    onChange={(e) => setCloudinarySettings({ ...cloudinarySettings, apiKey: e.target.value.trim() })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-mono focus:border-cyan-400 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Cloudinary Dashboard API Key</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    API Secret <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••••••••••••••••••••"
                    value={cloudinarySettings.apiSecret}
                    onChange={(e) => setCloudinarySettings({ ...cloudinarySettings, apiSecret: e.target.value.trim() })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-mono focus:border-cyan-400 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Private API Secret (Stored securely server-side)</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    Upload Preset (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. earnhub_preset"
                    value={cloudinarySettings.uploadPreset || ''}
                    onChange={(e) => setCloudinarySettings({ ...cloudinarySettings, uploadPreset: e.target.value.trim() })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-mono focus:border-cyan-400 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Unsigned upload preset name (optional)</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="submit"
                  disabled={savingCloudinary}
                  className="flex-1 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-950 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>{savingCloudinary ? 'Saving Configuration...' : 'Save Cloudinary Credentials'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Cloudinary Live Image Upload Sandbox */}
          <div className="p-6 sm:p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
            <div>
              <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Upload className="w-4 h-4 text-cyan-400" />
                Live Cloudinary CDN Image Test Uploader
              </h4>
              <p className="text-xs text-slate-400">
                Test uploading an image to verify your Cloudinary storage pipeline. You can also copy the uploaded CDN URL for any promotional use.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <ImageUploadInput
                id="cloudinary-sandbox-uploader"
                label="Select or Drag Image to Upload"
                value={testUploadUrl}
                onChange={setTestUploadUrl}
                folder="earnhub_test"
                placeholder="Upload any JPG, PNG, WebP image to test Cloudinary"
                helperText="Images are automatically resized, optimized and served globally via Cloudinary CDN."
              />
            </div>
          </div>

          {/* Integration Information Card */}
          <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 text-xs space-y-3">
            <h4 className="font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Where is Cloudinary Used in EarnNetwork BD?
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-300">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1">
                <strong className="text-white block font-bold">1. Task Video Thumbnails</strong>
                <p className="text-[11px] text-slate-400">Sponsored YouTube and Facebook video tasks use high-res cover photos stored in Cloudinary.</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1">
                <strong className="text-white block font-bold">2. Festival & Campaign Banners</strong>
                <p className="text-[11px] text-slate-400">Popup alerts and promotional slider graphics are hosted on CDN for fast mobile rendering.</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1">
                <strong className="text-white block font-bold">3. Brand Web & Mobile Logos</strong>
                <p className="text-[11px] text-slate-400">Custom header logos and PWA mobile icons are dynamically served from Cloudinary.</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1">
                <strong className="text-white block font-bold">4. Deposit Payment Screenshots</strong>
                <p className="text-[11px] text-slate-400">Members uploading bKash/Nagad payment proof SMS/receipts are saved to Cloudinary folder.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. BROADCAST MODULE */}
      {activeTab === 'broadcast' && (
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4 max-w-2xl">
          <h3 className="text-lg font-bold text-white">Real-Time Notification Broadcast</h3>
          <p className="text-xs text-slate-400">
            Dispatches live Socket.IO push alerts and adds records to member notification center.
          </p>

          <form onSubmit={handleSendBroadcast} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Target Audience</label>
              <select
                value={broadcastTarget}
                onChange={(e) => setBroadcastTarget(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs"
              >
                <option value="all">Broadcast to All Users</option>
                {userList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.phone} ({u.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Alert Title</label>
              <input
                type="text"
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                placeholder="e.g. Scheduled System Upgrade"
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Alert Message</label>
              <textarea
                rows={3}
                value={broadcastMsg}
                onChange={(e) => setBroadcastMsg(e.target.value)}
                placeholder="Write message content here..."
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition cursor-pointer"
            >
              Dispatch Broadcast Alert Now
            </button>
          </form>
        </div>
      )}

      {/* 6. SYSTEM SETTINGS MODULE */}
      {activeTab === 'settings' && siteSettings && (
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-6 max-w-4xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div>
              <h3 className="text-xl font-black text-white flex items-center gap-2">
                <Settings className="w-6 h-6 text-amber-400" />
                Platform Settings & Security Center
              </h3>
              <p className="text-xs text-slate-400">
                Configure platform branding, social gateways, transaction limits, operation hours, and core engine killswitches.
              </p>
            </div>
            <button
              onClick={loadAllAdminData}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition self-start"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>

          {/* Cloudinary Integration Callout Banner */}
          <div className="p-4 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                <Cloud className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white flex items-center gap-2">
                  Cloudinary Global Image Cloud Storage
                  <span className={`text-[10px] px-2 py-0.2 rounded-full font-bold uppercase ${
                    cloudinarySettings.isConfigured ? 'bg-cyan-500/20 text-cyan-300' : 'bg-amber-500/20 text-amber-300'
                  }`}>
                    {cloudinarySettings.isConfigured ? 'Connected' : 'Setup Required'}
                  </span>
                </h4>
                <p className="text-[11px] text-slate-400">
                  {cloudinarySettings.isConfigured
                    ? `Active Cloud: ${cloudinarySettings.cloudName}. All images upload automatically to Cloudinary CDN.`
                    : 'Configure your Cloud Name & API credentials to host all images directly on Cloudinary.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('cloudinary')}
              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition cursor-pointer self-start sm:self-auto shrink-0 shadow-md shadow-cyan-950"
            >
              Configure Cloudinary →
            </button>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-6">
            {/* Card 1: Platform Branding & Visual Identity */}
            <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80">
                <Sliders className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">1. Platform Identity & Branding</h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Platform Brand Name</label>
                  <input
                    type="text"
                    value={siteSettings.websiteName || ''}
                    onChange={(e) => setSiteSettings({ ...siteSettings, websiteName: e.target.value })}
                    placeholder="EarnNetwork BD"
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Platform Tagline / Slogan</label>
                  <input
                    type="text"
                    value={siteSettings.tagline || ''}
                    onChange={(e) => setSiteSettings({ ...siteSettings, tagline: e.target.value })}
                    placeholder="Leading Digital Micro-Task Earning Ecosystem in BD"
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Primary Theme Color (HEX)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={siteSettings.themePrimaryColor || '#059669'}
                      onChange={(e) => setSiteSettings({ ...siteSettings, themePrimaryColor: e.target.value })}
                      className="w-10 h-9 p-1 rounded-xl bg-slate-900 border border-slate-700 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={siteSettings.themePrimaryColor || '#059669'}
                      onChange={(e) => setSiteSettings({ ...siteSettings, themePrimaryColor: e.target.value })}
                      className="flex-1 px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-mono focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Footer Copyright Text</label>
                  <input
                    type="text"
                    value={siteSettings.footerText || ''}
                    onChange={(e) => setSiteSettings({ ...siteSettings, footerText: e.target.value })}
                    placeholder="© 2026 EarnNetwork BD. All Rights Reserved."
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <ImageUploadInput
                    id="setting-web-logo-upload"
                    label="Platform Web Logo (Desktop/Navbar)"
                    value={siteSettings.logoUrl || ''}
                    onChange={(url) => setSiteSettings({ ...siteSettings, logoUrl: url })}
                    folder="earnhub_branding"
                    placeholder="Upload brand header logo to Cloudinary"
                    helperText="Recommended PNG/SVG with transparent background (height 40px)."
                  />
                </div>

                <div>
                  <ImageUploadInput
                    id="setting-mobile-logo-upload"
                    label="Mobile App Logo (Mobile App/PWA)"
                    value={siteSettings.mobileLogoUrl || ''}
                    onChange={(url) => setSiteSettings({ ...siteSettings, mobileLogoUrl: url })}
                    folder="earnhub_branding"
                    placeholder="Upload mobile icon logo to Cloudinary"
                    helperText="Square 512x512 app icon used for PWA splash and mobile screens."
                  />
                </div>
              </div>
            </div>

            {/* Card 2: Official Support & Social Media Channels */}
            <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80">
                <Bell className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">2. Official Support & Community Channels</h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">WhatsApp Official Support</label>
                  <input
                    type="text"
                    value={siteSettings.whatsappNumber || ''}
                    onChange={(e) => setSiteSettings({ ...siteSettings, whatsappNumber: e.target.value })}
                    placeholder="+8801700112233"
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-mono focus:border-emerald-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Telegram Official Channel</label>
                  <input
                    type="text"
                    value={siteSettings.telegramChannelUrl || ''}
                    onChange={(e) => setSiteSettings({ ...siteSettings, telegramChannelUrl: e.target.value })}
                    placeholder="https://t.me/earnhub_bd_official"
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-mono focus:border-emerald-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Telegram Support Group</label>
                  <input
                    type="text"
                    value={siteSettings.telegramGroupUrl || ''}
                    onChange={(e) => setSiteSettings({ ...siteSettings, telegramGroupUrl: e.target.value })}
                    placeholder="https://t.me/earnhub_bd_group"
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-mono focus:border-emerald-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Facebook Community Group</label>
                  <input
                    type="text"
                    value={siteSettings.facebookGroupUrl || ''}
                    onChange={(e) => setSiteSettings({ ...siteSettings, facebookGroupUrl: e.target.value })}
                    placeholder="https://facebook.com/groups/earnhubbd"
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-mono focus:border-emerald-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">YouTube Tutorial Guide Link</label>
                  <input
                    type="text"
                    value={siteSettings.youtubeTutorialUrl || ''}
                    onChange={(e) => setSiteSettings({ ...siteSettings, youtubeTutorialUrl: e.target.value })}
                    placeholder="https://youtube.com/watch?v=..."
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-mono focus:border-emerald-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Android APK Download URL</label>
                  <input
                    type="text"
                    value={siteSettings.appDownloadUrl || ''}
                    onChange={(e) => setSiteSettings({ ...siteSettings, appDownloadUrl: e.target.value })}
                    placeholder="https://earnhub-bd.com/download/app.apk"
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-mono focus:border-emerald-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Card 3: Financial Rules & Limits */}
            <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80">
                <DollarSign className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">3. Financial Policy & Transaction Limits</h4>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Min Deposit (৳)</label>
                  <input
                    type="number"
                    value={siteSettings.minDepositAmount ?? 500}
                    onChange={(e) => setSiteSettings({ ...siteSettings, minDepositAmount: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-bold focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Max Deposit (৳)</label>
                  <input
                    type="number"
                    value={siteSettings.maxDepositAmount ?? 100000}
                    onChange={(e) => setSiteSettings({ ...siteSettings, maxDepositAmount: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-bold focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Min Withdraw (৳)</label>
                  <input
                    type="number"
                    value={siteSettings.minWithdrawAmount ?? 300}
                    onChange={(e) => setSiteSettings({ ...siteSettings, minWithdrawAmount: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-bold focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Max Withdraw (৳)</label>
                  <input
                    type="number"
                    value={siteSettings.maxWithdrawAmount ?? 50000}
                    onChange={(e) => setSiteSettings({ ...siteSettings, maxWithdrawAmount: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-bold focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Withdraw Fee (%)</label>
                  <input
                    type="number"
                    value={siteSettings.withdrawFeePercentage ?? 10}
                    onChange={(e) => setSiteSettings({ ...siteSettings, withdrawFeePercentage: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-bold focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Signup Bonus (৳)</label>
                  <input
                    type="number"
                    value={siteSettings.signupBonusAmount ?? 50}
                    onChange={(e) => setSiteSettings({ ...siteSettings, signupBonusAmount: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-bold focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Card 4: Operating Hours & Reset Schedule */}
            <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80">
                <Clock className="w-4 h-4 text-purple-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">4. Operating Timings & Task Windows</h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Withdraw Start Hour (24h)</label>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={siteSettings.withdrawStartHour ?? siteSettings.withdrawOpeningHour ?? 8}
                    onChange={(e) => setSiteSettings({ ...siteSettings, withdrawStartHour: Number(e.target.value), withdrawOpeningHour: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-mono focus:border-purple-400 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">e.g. 8 for 8:00 AM</span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Withdraw End Hour (24h)</label>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={siteSettings.withdrawEndHour ?? siteSettings.withdrawClosingHour ?? 23}
                    onChange={(e) => setSiteSettings({ ...siteSettings, withdrawEndHour: Number(e.target.value), withdrawClosingHour: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-mono focus:border-purple-400 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">e.g. 23 for 11:00 PM</span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Daily Task Reset Hour (24h)</label>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={siteSettings.dailyTaskResetHour ?? 0}
                    onChange={(e) => setSiteSettings({ ...siteSettings, dailyTaskResetHour: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-mono focus:border-purple-400 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">0 = 12:00 AM Midnight</span>
                </div>
              </div>
            </div>

            {/* Card 5: Core Security & Permission Controls */}
            <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80">
                <ShieldCheck className="w-4 h-4 text-rose-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">5. Core Engine Killswitches & Permissions</h4>
              </div>

              {/* Global Withdrawal Emergency Toggle */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-white text-xs block">Global Withdrawal Engine</span>
                  <span className="text-[11px] text-slate-400">Emergency killswitch to lock payouts across the entire platform</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSiteSettings({ ...siteSettings, isWithdrawDisabled: !siteSettings.isWithdrawDisabled })}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    siteSettings.isWithdrawDisabled
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20'
                  }`}
                >
                  {siteSettings.isWithdrawDisabled ? '🔒 DISABLED (LOCKED)' : '✅ ACTIVE (OPEN)'}
                </button>
              </div>

              {/* Free User Withdrawal Permission Setting */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-xs block">Free User Withdrawal Permission (ফ্রি ইউজার উইথড্র অনুমতি)</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                      siteSettings.allowFreeUserWithdrawal
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}>
                      {siteSettings.allowFreeUserWithdrawal ? 'Permission Enabled' : 'Restricted (Default)'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed max-w-xl">
                    সক্রিয় (Enabled) করলে সকল ফ্রি ইউজার স্বাভাবিকভাবে টাকা উইথড্র করতে পারবে। বন্ধ (Restricted) থাকলে ফ্রি ইউজারদের উইথড্র আটকে থাকবে এবং তাদের সাপোর্ট অথবা রেফারেল মেম্বারের সাথে যোগাযোগ করার নোটিশ দেখানো হবে।
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSiteSettings({ ...siteSettings, allowFreeUserWithdrawal: !siteSettings.allowFreeUserWithdrawal })}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    siteSettings.allowFreeUserWithdrawal
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20'
                      : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  {siteSettings.allowFreeUserWithdrawal ? '✅ ENABLED (অনুমোদিত)' : '🔒 RESTRICTED (বন্ধ)'}
                </button>
              </div>

              {/* Sunday Off Day Toggle */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-white text-xs block">Sunday Weekly Off Day (রবিবার সাপ্তাহিক ছুটি)</span>
                  <span className="text-[11px] text-slate-400">Lock video task execution automatically on Sundays for weekly system maintenance</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSiteSettings({ ...siteSettings, sundayIsOffDay: !siteSettings.sundayIsOffDay })}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    siteSettings.sundayIsOffDay
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  {siteSettings.sundayIsOffDay ? '🏖️ SUNDAY REST ACTIVE' : 'WORKING DAY'}
                </button>
              </div>

              {/* Maintenance Mode Toggle */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-white text-xs block">System Maintenance Mode (রক্ষণাবেক্ষণ মোড)</span>
                  <span className="text-[11px] text-slate-400">Display maintenance notice on the client app during emergency server updates</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSiteSettings({ ...siteSettings, maintenanceMode: !siteSettings.maintenanceMode })}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    siteSettings.maintenanceMode
                      ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-md shadow-rose-500/20'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  }`}
                >
                  {siteSettings.maintenanceMode ? '🚨 UNDER MAINTENANCE' : 'LIVE ONLINE'}
                </button>
              </div>

              {/* Hybrid Deposit Verification Mode */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-white text-xs block">Hybrid Automatic Deposit Check (অটো ভেরিফিকেশন)</span>
                  <span className="text-[11px] text-slate-400">Smart TrxID regex validator (Default: Manual review by admin)</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSiteSettings({ ...siteSettings, hybridDepositVerificationEnabled: !siteSettings.hybridDepositVerificationEnabled })}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    siteSettings.hybridDepositVerificationEnabled
                      ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md shadow-cyan-500/20'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  {siteSettings.hybridDepositVerificationEnabled ? 'HYBRID ACTIVE' : 'MANUAL REVIEW (DEFAULT)'}
                </button>
              </div>
            </div>

            {/* Card 6: Live Marquee Notice */}
            <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80">
                <Megaphone className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">6. Live Home Marquee Announcement</h4>
              </div>
              <textarea
                rows={2}
                value={siteSettings.marqueeNotice || ''}
                onChange={(e) => setSiteSettings({ ...siteSettings, marqueeNotice: e.target.value })}
                placeholder="🔥 EarnNetwork BD (earnnetworkbd.com) - প্রতিদিন ১০ সেকেন্ড ভিডিও দেখে ইনকাম করুন! নতুন মেম্বারদের জন্য ফ্রি ট্রায়াল চালু রয়েছে।"
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-400 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={savingSettings}
              className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/20 transition cursor-pointer flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-5 h-5" />
              <span>{savingSettings ? 'Saving Settings...' : 'Save & Propagate Platform Settings'}</span>
            </button>
          </form>
        </div>
      )}

      {/* ADMIN STAFF & SUB-ADMINS MODULE */}
      {activeTab === 'admin_users' && <AdminUsersTab />}

      {/* SYSTEM ENGINE HEALTH & DIAGNOSTICS MODULE */}
      {activeTab === 'system_health' && <SystemHealthTab />}

      {/* Reject Modal */}
      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4">
            <h4 className="font-bold text-white text-base">
              Reject {rejectType === 'deposit' ? 'Deposit' : 'Withdrawal'}
            </h4>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Reason for Rejection</label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain why this request is rejected..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setRejectingId(null)}
                className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={rejectType === 'deposit' ? handleRejectDeposit : handleRejectWithdraw}
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Balance Adjust Modal */}
      {balanceModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4">
            <h4 className="font-bold text-white text-base">Adjust User Balance</h4>
            <p className="text-xs text-slate-400">User: {balanceModalUser.phone}</p>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBalanceActionType('add')}
                className={`py-2 rounded-xl text-xs font-bold ${
                  balanceActionType === 'add'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                + Credit Balance
              </button>
              <button
                type="button"
                onClick={() => setBalanceActionType('subtract')}
                className={`py-2 rounded-xl text-xs font-bold ${
                  balanceActionType === 'subtract'
                    ? 'bg-rose-500 text-white'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                - Debit Balance
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Amount (TK)</label>
              <input
                type="number"
                value={balanceAmount}
                onChange={(e) => setBalanceAmount(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm font-bold"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setBalanceModalUser(null)}
                className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleBalanceAdjust}
                className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold"
              >
                Apply Change
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Screenshot Lightbox Modal */}
      {previewScreenshotUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-white text-base">Deposit Proof Screenshot</h4>
              <button
                onClick={() => setPreviewScreenshotUrl(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center">
              <img
                src={previewScreenshotUrl}
                alt="Deposit Proof"
                className="max-h-[60vh] object-contain w-full"
              />
            </div>
            <div className="flex justify-end gap-2">
              <a
                href={previewScreenshotUrl}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition"
              >
                Open Full Size
              </a>
              <button
                onClick={() => setPreviewScreenshotUrl(null)}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comprehensive User 360 CRM Dossier Modal */}
      {(selectedUserProfileUser || selectedDossierUserId) && (
        <UserDossierModal
          userIdOrPhone={selectedUserProfileUser?.id || selectedDossierUserId || ''}
          onClose={() => {
            setSelectedUserProfileUser(null);
            setSelectedDossierUserId(null);
          }}
          onUserUpdated={loadAllAdminData}
        />
      )}
      </main>

      {/* Global Omnisearch Dialog */}
      <GlobalAdminSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onNavigateTab={(tabId: string, param?: string) => {
          setActiveTab(tabId as any);
          if (param) {
            setUserSearch(param);
          }
          setIsSearchModalOpen(false);
        }}
      />
    </div>
  );
}
