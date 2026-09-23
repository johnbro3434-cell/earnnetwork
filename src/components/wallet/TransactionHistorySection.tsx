import React, { useState, useMemo } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  Search,
  Filter,
  RefreshCw,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  History,
  Smartphone,
  Info,
} from 'lucide-react';
import { DepositRequest, WithdrawRequest } from '../../types';
import { useToast } from '../../context/ToastContext';

export interface UnifiedTransactionItem {
  id: string;
  type: 'deposit' | 'withdrawal';
  method: 'bKash' | 'Nagad';
  amount: number;
  netAmount?: number;
  accountNumber: string;
  assignedNumber?: string;
  transactionId?: string;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectedReason?: string;
  timeline?: { step: string; timestamp: string; note?: string }[];
}

interface TransactionHistorySectionProps {
  deposits: DepositRequest[];
  withdraws: WithdrawRequest[];
  loading?: boolean;
  onRefresh?: () => void;
  onNavigateToDeposit?: () => void;
  onNavigateToWithdraw?: () => void;
  initialLimit?: number;
  showViewAllOption?: boolean;
}

export function TransactionHistorySection({
  deposits,
  withdraws,
  loading = false,
  onRefresh,
  onNavigateToDeposit,
  onNavigateToWithdraw,
  initialLimit = 10,
  showViewAllOption = true,
}: TransactionHistorySectionProps) {
  const { showToast } = useToast();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'deposit' | 'withdrawal'>('all');
  const [filterMethod, setFilterMethod] = useState<'all' | 'bKash' | 'Nagad'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'pending' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  // Combine and sort all transactions
  const combinedList = useMemo<UnifiedTransactionItem[]>(() => {
    const list: UnifiedTransactionItem[] = [];

    deposits.forEach((d) => {
      list.push({
        id: d.id,
        type: 'deposit',
        method: d.paymentMethod,
        amount: d.amount,
        accountNumber: d.senderNumber,
        assignedNumber: d.assignedNumber,
        transactionId: d.transactionId,
        status: d.status,
        createdAt: d.createdAt,
        reviewedAt: d.reviewedAt,
        reviewedBy: d.reviewedBy,
        rejectedReason: d.rejectedReason,
      });
    });

    withdraws.forEach((w) => {
      list.push({
        id: w.id,
        type: 'withdrawal',
        method: w.paymentMethod,
        amount: w.amount,
        netAmount: w.netAmount,
        accountNumber: w.withdrawNumber,
        status: w.status,
        createdAt: w.createdAt,
        rejectedReason: w.rejectedReason,
        timeline: w.timeline,
      });
    });

    // Sort newest first
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [deposits, withdraws]);

  // Filtered transactions
  const filteredList = useMemo(() => {
    return combinedList.filter((item) => {
      // Type filter
      if (filterType !== 'all' && item.type !== filterType) return false;

      // Method filter
      if (filterMethod !== 'all' && item.method !== filterMethod) return false;

      // Status filter
      if (filterStatus !== 'all') {
        if (filterStatus === 'completed' && !(item.status === 'approved' || item.status === 'paid')) {
          return false;
        }
        if (filterStatus === 'pending' && item.status !== 'pending') return false;
        if (filterStatus === 'rejected' && item.status !== 'rejected') return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTrx = item.transactionId?.toLowerCase().includes(q);
        const matchAccount = item.accountNumber?.toLowerCase().includes(q);
        const matchId = item.id?.toLowerCase().includes(q);
        const matchAmount = item.amount.toString().includes(q);
        const matchMethod = item.method.toLowerCase().includes(q);
        if (!matchTrx && !matchAccount && !matchId && !matchAmount && !matchMethod) {
          return false;
        }
      }

      return true;
    });
  }, [combinedList, filterType, filterMethod, filterStatus, searchQuery]);

  // Visible items based on limit
  const visibleItems = showAll ? filteredList : filteredList.slice(0, initialLimit);

  const handleCopyTrx = (trx: string, id: string) => {
    if (!trx) return;
    navigator.clipboard.writeText(trx);
    setCopiedId(id);
    showToast('success', 'TrxID কপি করা হয়েছে', `ট্রানজেকশন আইডি: ${trx}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // Quick summary counts
  const bkashCount = useMemo(() => combinedList.filter((t) => t.method === 'bKash').length, [combinedList]);
  const nagadCount = useMemo(() => combinedList.filter((t) => t.method === 'Nagad').length, [combinedList]);
  const pendingCount = useMemo(() => combinedList.filter((t) => t.status === 'pending').length, [combinedList]);

  return (
    <div id="transaction-history-section" className="p-4 sm:p-7 rounded-2xl sm:rounded-3xl glass-panel border border-white/10 shadow-2xl space-y-5 sm:space-y-6 relative overflow-hidden">
      {/* Soft glass ambient accents */}
      <div className="absolute -top-16 -right-16 w-36 h-36 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-5 relative z-10">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
              <History className="w-5 h-5" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white tracking-tight">
              Transaction History
            </h3>
          </div>
          <p className="text-xs text-slate-300 mt-1">
            Recent bKash and Nagad deposits & withdrawals with live verification status.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              title="Refresh transaction history"
              className="px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 hover:text-white border border-white/[0.1] text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-purple-400' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          )}

          {/* Method Quick Counters */}
          <div className="flex items-center gap-1.5 text-[11px] font-medium">
            <span className="px-2.5 py-1 rounded-lg bg-pink-500/15 border border-pink-500/30 text-pink-300 font-bold backdrop-blur-sm">
              bKash ({bkashCount})
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-orange-500/15 border border-orange-500/30 text-orange-300 font-bold backdrop-blur-sm">
              Nagad ({nagadCount})
            </span>
            {pendingCount > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold animate-pulse backdrop-blur-sm shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                {pendingCount} Pending
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-1 relative z-10">
        {/* Method & Type Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => { setFilterType('all'); setFilterMethod('all'); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              filterType === 'all' && filterMethod === 'all'
                ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-md shadow-purple-500/25'
                : 'bg-white/[0.04] text-slate-300 hover:text-white hover:bg-white/[0.08] border border-white/[0.08]'
            }`}
          >
            All ({combinedList.length})
          </button>

          <button
            onClick={() => { setFilterMethod('bKash'); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              filterMethod === 'bKash'
                ? 'bg-pink-600 text-white shadow-md shadow-pink-600/30'
                : 'bg-white/[0.04] text-slate-300 hover:text-pink-300 hover:bg-white/[0.08] border border-white/[0.08]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-pink-400" />
            bKash
          </button>

          <button
            onClick={() => { setFilterMethod('Nagad'); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              filterMethod === 'Nagad'
                ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30'
                : 'bg-white/[0.04] text-slate-300 hover:text-orange-300 hover:bg-white/[0.08] border border-white/[0.08]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-orange-400" />
            Nagad
          </button>

          <button
            onClick={() => { setFilterType(filterType === 'deposit' ? 'all' : 'deposit'); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              filterType === 'deposit'
                ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'bg-white/[0.04] text-slate-300 hover:text-white hover:bg-white/[0.08] border border-white/[0.08]'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
            Deposits
          </button>

          <button
            onClick={() => { setFilterType(filterType === 'withdrawal' ? 'all' : 'withdrawal'); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              filterType === 'withdrawal'
                ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40 shadow-sm'
                : 'bg-white/[0.04] text-slate-300 hover:text-white hover:bg-white/[0.08] border border-white/[0.08]'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5 text-rose-400" />
            Withdrawals
          </button>
        </div>

        {/* Status Dropdown & Search Input */}
        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-3 py-1.5 bg-[#0e1424] border border-white/10 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-purple-500 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="completed">Approved / Paid</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
          </select>

          <div className="relative flex-1 sm:w-48">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search TrxID, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-[#0e1424] border border-white/10 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>
      </div>

      {/* Transactions List */}
      <div className="space-y-3">
        {visibleItems.length === 0 ? (
          <div className="p-8 sm:p-12 text-center rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/60 border border-slate-700/60 text-slate-400 flex items-center justify-center mx-auto">
              <History className="w-6 h-6 opacity-60" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-200">No transactions match your filter</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {searchQuery || filterType !== 'all' || filterMethod !== 'all' || filterStatus !== 'all'
                  ? 'Try clearing your filters or search terms to see all deposits and cashouts.'
                  : 'You have not made any bKash or Nagad deposits or withdrawal requests yet.'}
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              {(searchQuery || filterType !== 'all' || filterMethod !== 'all' || filterStatus !== 'all') ? (
                <button
                  onClick={() => {
                    setFilterType('all');
                    setFilterMethod('all');
                    setFilterStatus('all');
                    setSearchQuery('');
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition"
                >
                  Clear Filters
                </button>
              ) : (
                <>
                  {onNavigateToDeposit && (
                    <button
                      onClick={onNavigateToDeposit}
                      className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition shadow-md"
                    >
                      Deposit Now
                    </button>
                  )}
                  {onNavigateToWithdraw && (
                    <button
                      onClick={onNavigateToWithdraw}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition border border-slate-700"
                    >
                      Cash Out
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          visibleItems.map((item) => {
            const isDeposit = item.type === 'deposit';
            const isExpanded = expandedId === item.id;
            const isBkash = item.method === 'bKash';

            // Status Badge Formatting
            let statusBadge = {
              label: 'Pending',
              className: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
              icon: Clock,
            };

            if (item.status === 'approved') {
              statusBadge = {
                label: 'Approved',
                className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
                icon: CheckCircle2,
              };
            } else if (item.status === 'paid') {
              statusBadge = {
                label: 'Paid',
                className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
                icon: CheckCircle2,
              };
            } else if (item.status === 'rejected') {
              statusBadge = {
                label: 'Rejected',
                className: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
                icon: AlertCircle,
              };
            }

            const StatusIcon = statusBadge.icon;

            return (
              <div
                key={item.id}
                className={`rounded-2xl sm:rounded-3xl transition-all duration-200 border ${
                  isExpanded
                    ? 'glass-card border-purple-500/40 shadow-xl shadow-purple-950/20'
                    : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.08] hover:border-white/20'
                }`}
              >
                {/* Main Transaction Row */}
                <div
                  onClick={() => toggleExpand(item.id)}
                  className="p-4 sm:p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 cursor-pointer select-none"
                >
                  {/* Left: Direction Icon + Details */}
                  <div className="flex items-start sm:items-center gap-3.5">
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border shadow-inner ${
                        isDeposit
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                          : 'bg-rose-500/15 text-rose-400 border-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.2)]'
                      }`}
                    >
                      {isDeposit ? (
                        <ArrowDownLeft className="w-5 h-5" />
                      ) : (
                        <ArrowUpRight className="w-5 h-5" />
                      )}
                    </div>

                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2">
                        {/* Method Badge: bKash vs Nagad */}
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold border tracking-wide ${
                            isBkash
                              ? 'bg-pink-500/15 text-pink-300 border-pink-500/30'
                              : 'bg-orange-500/15 text-orange-300 border-orange-500/30'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isBkash ? 'bg-pink-400' : 'bg-orange-400'
                            }`}
                          />
                          {item.method}
                        </span>

                        <span className="font-bold text-white text-sm">
                          {isDeposit ? 'Add Money / Deposit' : 'Cashout / Withdrawal'}
                        </span>

                        {/* Status Badge */}
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border ${statusBadge.className}`}
                        >
                          <StatusIcon className="w-3 h-3" />
                          <span>{statusBadge.label}</span>
                        </span>
                      </div>

                      {/* Sub-info: Account & TrxID */}
                      <div className="flex items-center flex-wrap gap-2 text-xs text-slate-400">
                        <span>
                          {isDeposit ? 'From Sender:' : 'To Account:'}{' '}
                          <span className="font-mono text-slate-300">{item.accountNumber}</span>
                        </span>

                        {item.transactionId && (
                          <>
                            <span className="text-slate-600">•</span>
                            <span className="flex items-center gap-1 font-mono text-slate-300">
                              TrxID: {item.transactionId}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyTrx(item.transactionId!, item.id);
                                }}
                                title="Copy TrxID"
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
                              >
                                {copiedId === item.id ? (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Amount & Timestamp */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 border-slate-800/60 pt-2 sm:pt-0 shrink-0">
                    <div className="text-right">
                      <span
                        className={`text-base sm:text-lg font-black tracking-tight ${
                          isDeposit ? 'text-emerald-400' : 'text-white'
                        }`}
                      >
                        {isDeposit ? `+৳ ${item.amount.toLocaleString()}` : `-৳ ${item.amount.toLocaleString()}`}
                      </span>
                      {item.netAmount && (
                        <span className="block text-[10px] text-slate-400">
                          Net Payout: ৳{item.netAmount.toLocaleString()}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-slate-500">
                        {new Date(item.createdAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <button
                        type="button"
                        className="text-slate-500 hover:text-slate-300 p-0.5"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Details Drawer */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-slate-800/80 bg-slate-900/40 text-xs space-y-3 rounded-b-2xl">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block">
                          Reference ID
                        </span>
                        <span className="font-mono text-slate-200 block mt-0.5">{item.id}</span>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block">
                          Payment Gateway
                        </span>
                        <span className="font-bold text-white block mt-0.5">
                          {item.method} Bangladesh (Mobile Financial Service)
                        </span>
                      </div>

                      {item.assignedNumber && (
                        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block">
                            Platform Agent / Wallet
                          </span>
                          <span className="font-mono text-slate-200 block mt-0.5">{item.assignedNumber}</span>
                        </div>
                      )}

                      {item.reviewedAt && (
                        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block">
                            Reviewed At
                          </span>
                          <span className="text-slate-200 block mt-0.5">
                            {new Date(item.reviewedAt).toLocaleString()}
                          </span>
                        </div>
                      )}

                      {item.reviewedBy && (
                        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block">
                            Reviewed By
                          </span>
                          <span className="text-slate-200 block mt-0.5">{item.reviewedBy}</span>
                        </div>
                      )}

                      {item.rejectedReason && (
                        <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/30 col-span-full">
                          <span className="text-[10px] uppercase tracking-wider text-rose-400 font-semibold block">
                            Rejection Reason
                          </span>
                          <span className="text-rose-200 font-medium block mt-0.5">{item.rejectedReason}</span>
                        </div>
                      )}
                    </div>

                    {/* Timeline if withdrawal */}
                    {item.timeline && item.timeline.length > 0 && (
                      <div className="pt-2">
                        <span className="text-[11px] font-bold text-slate-400 block mb-2">Audit Timeline:</span>
                        <div className="space-y-1.5 pl-2 border-l-2 border-slate-800">
                          {item.timeline.map((step, sIdx) => (
                            <div key={sIdx} className="text-slate-400 text-[11px]">
                              <span className="font-semibold uppercase text-slate-300">{step.step}:</span>{' '}
                              <span>{step.note || 'Processed'}</span>{' '}
                              <span className="text-slate-600">({new Date(step.timestamp).toLocaleTimeString()})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Show More / Show Less Button */}
      {showViewAllOption && filteredList.length > initialLimit && (
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="px-5 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-850 text-slate-300 hover:text-white border border-slate-800 text-xs font-bold transition cursor-pointer inline-flex items-center gap-2"
          >
            <span>{showAll ? 'Show Fewer Transactions' : `View All ${filteredList.length} Transactions`}</span>
            {showAll ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
