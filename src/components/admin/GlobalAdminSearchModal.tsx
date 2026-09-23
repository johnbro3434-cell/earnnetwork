import React, { useState, useEffect, useRef } from 'react';
import { Search, X, User, ArrowDownRight, ArrowUpRight, MessageSquare, Loader2 } from 'lucide-react';
import { apiRequest } from '../../lib/api';

interface GlobalAdminSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tabId: string, param?: string) => void;
}

export function GlobalAdminSearchModal({
  isOpen,
  onClose,
  onNavigateTab,
}: GlobalAdminSearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{
    users?: any[];
    deposits?: any[];
    withdraws?: any[];
    transactions?: any[];
    tickets?: any[];
  }>({});
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults({});
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults({});
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiRequest(`/api/admin/global-search?q=${encodeURIComponent(query.trim())}`);
        setResults(res);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  if (!isOpen) return null;

  const hasResults =
    (results.users && results.users.length > 0) ||
    (results.deposits && results.deposits.length > 0) ||
    (results.withdraws && results.withdraws.length > 0) ||
    (results.tickets && results.tickets.length > 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center p-4 pt-16 sm:pt-24">
      <div className="max-w-2xl w-full glass-panel rounded-3xl border border-white/15 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Search Header */}
        <div className="p-4 border-b border-white/10 flex items-center gap-3">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search phone number, TrxID, user ID, or referral code..."
            className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          {loading && <Loader2 className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />}
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!query.trim() ? (
            <p className="text-center text-xs text-slate-500 py-10">
              Type at least 2 characters to search across members, deposits, withdrawals and tickets.
            </p>
          ) : !hasResults && !loading ? (
            <p className="text-center text-xs text-slate-500 py-10">
              No matching records found for "{query}".
            </p>
          ) : (
            <>
              {/* Users */}
              {results.users && results.users.length > 0 && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                    Members ({results.users.length})
                  </span>
                  <div className="space-y-1.5">
                    {results.users.map(u => (
                      <div
                        key={u.id}
                        onClick={() => onNavigateTab('users', u.phone)}
                        className="p-2.5 rounded-xl bg-slate-900/60 hover:bg-emerald-950/40 border border-white/5 hover:border-emerald-500/30 cursor-pointer flex items-center justify-between text-xs transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="font-semibold text-white">{u.phone}</span>
                          <span className="text-[10px] text-slate-400">Ref: {u.referralCode}</span>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-slate-300">
                          {u.role}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Deposits */}
              {results.deposits && results.deposits.length > 0 && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                    Deposits ({results.deposits.length})
                  </span>
                  <div className="space-y-1.5">
                    {results.deposits.map(d => (
                      <div
                        key={d.id}
                        onClick={() => onNavigateTab('finance')}
                        className="p-2.5 rounded-xl bg-slate-900/60 hover:bg-slate-800 border border-white/5 cursor-pointer flex items-center justify-between text-xs transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <ArrowDownRight className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="font-semibold text-white">৳{d.amount}</span>
                          <span className="text-slate-400 text-[11px]">TrxID: {d.transactionId}</span>
                        </div>
                        <span className="text-[10px] text-slate-400">{d.userPhone}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Withdrawals */}
              {results.withdraws && results.withdraws.length > 0 && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                    Withdrawals ({results.withdraws.length})
                  </span>
                  <div className="space-y-1.5">
                    {results.withdraws.map(w => (
                      <div
                        key={w.id}
                        onClick={() => onNavigateTab('finance')}
                        className="p-2.5 rounded-xl bg-slate-900/60 hover:bg-slate-800 border border-white/5 cursor-pointer flex items-center justify-between text-xs transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <ArrowUpRight className="w-3.5 h-3.5 text-rose-400" />
                          <span className="font-semibold text-white">৳{w.amount}</span>
                          <span className="text-slate-400 text-[11px]">{w.withdrawNumber}</span>
                        </div>
                        <span className="text-[10px] text-slate-400">{w.userPhone}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tickets */}
              {results.tickets && results.tickets.length > 0 && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                    Support Tickets ({results.tickets.length})
                  </span>
                  <div className="space-y-1.5">
                    {results.tickets.map(t => (
                      <div
                        key={t.id}
                        onClick={() => onNavigateTab('support')}
                        className="p-2.5 rounded-xl bg-slate-900/60 hover:bg-slate-800 border border-white/5 cursor-pointer flex items-center justify-between text-xs transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                          <span className="font-semibold text-white">{t.subject}</span>
                        </div>
                        <span className="text-[10px] text-slate-400">{t.userPhone}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
