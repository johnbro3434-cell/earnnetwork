import React, { useState, useEffect } from 'react';
import { CreditCard, Plus, Check, X, RefreshCw, Layers } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { WithdrawCard } from '../../types';

export function WithdrawCardsTab() {
  const { showToast } = useToast();
  const [cards, setCards] = useState<WithdrawCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const [amount, setAmount] = useState<number>(500);
  const [label, setLabel] = useState('Standard Payout');
  const [badge, setBadge] = useState('HOT');
  const [badgeColor, setBadgeColor] = useState<'emerald' | 'amber' | 'cyan' | 'purple' | 'rose' | 'blue'>('emerald');
  const [isTrialAllowed, setIsTrialAllowed] = useState(false);

  const loadCards = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/api/admin/withdraw-cards');
      setCards(Array.isArray(res) ? res : res.cards || []);
    } catch (e: any) {
      showToast('error', 'Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCards();
  }, []);

  const handleCreateCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || amount <= 0) {
      showToast('error', 'Invalid Amount', 'Amount must be greater than zero.');
      return;
    }

    try {
      await apiRequest('/api/admin/withdraw-cards', {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(amount),
          label,
          badge,
          badgeColor,
          isTrialAllowed,
          enabled: true,
          order: cards.length + 1,
        }),
      });
      showToast('success', 'Card Added', `Withdrawal tier ৳${amount} registered.`);
      setShowAddModal(false);
      loadCards();
    } catch (e: any) {
      showToast('error', 'Failed', e.message);
    }
  };

  const handleToggleCard = async (id: string) => {
    try {
      await apiRequest(`/api/admin/withdraw-cards/${id}/toggle`, { method: 'POST' });
      showToast('success', 'Card Updated', 'Card visibility status changed.');
      loadCards();
    } catch (e: any) {
      showToast('error', 'Error', e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-purple-400" />
            Withdrawal Amount Cards & Payout Tiers
          </h2>
          <p className="text-xs text-slate-400">Control preset cashout denominations available in member wallets</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadCards}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 transition-colors flex items-center gap-1.5 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Cashout Card
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <p className="col-span-full text-center text-xs text-slate-500 py-10">Loading withdrawal denominations...</p>
        ) : cards.length === 0 ? (
          <p className="col-span-full text-center text-xs text-slate-500 py-10">No withdrawal cards defined.</p>
        ) : (
          cards.map(card => (
            <div
              key={card.id}
              className={`p-4 rounded-2xl glass-panel border transition-all flex flex-col justify-between ${
                card.enabled ? 'border-white/10' : 'border-rose-500/20 opacity-60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-white/10 text-white">
                    {card.badge || 'TIER'}
                  </span>
                  <span
                    className={`text-[10px] font-bold ${card.enabled ? 'text-emerald-400' : 'text-rose-400'}`}
                  >
                    {card.enabled ? 'Active' : 'Disabled'}
                  </span>
                </div>

                <div className="my-2">
                  <span className="text-2xl font-black text-white tracking-tight">
                    ৳{card.amount.toLocaleString()}
                  </span>
                  <p className="text-xs text-slate-400 font-medium">{card.label || 'Payout Tier'}</p>
                </div>

                {card.isTrialAllowed && (
                  <span className="inline-block text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Free Trial Permitted
                  </span>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-white/10 flex justify-end">
                <button
                  onClick={() => handleToggleCard(card.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    card.enabled
                      ? 'bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                      : 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                  }`}
                >
                  {card.enabled ? 'Disable Card' : 'Enable Card'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="max-w-md w-full glass-panel rounded-3xl p-6 border border-white/10 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-purple-400" />
              Configure Cashout Denomination
            </h3>

            <form onSubmit={handleCreateCard} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Denomination Amount (BDT)
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(Number(e.target.value))}
                  placeholder="e.g., 500"
                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Tier Label</label>
                <input
                  type="text"
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder="e.g., Standard Withdrawal"
                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Badge Tag</label>
                  <input
                    type="text"
                    value={badge}
                    onChange={e => setBadge(e.target.value)}
                    placeholder="e.g., HOT, POPULAR"
                    className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Badge Color</label>
                  <select
                    value={badgeColor}
                    onChange={e => setBadgeColor(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none"
                  >
                    <option value="emerald">Emerald</option>
                    <option value="amber">Amber</option>
                    <option value="cyan">Cyan</option>
                    <option value="purple">Purple</option>
                    <option value="rose">Rose</option>
                    <option value="blue">Blue</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="trialAllowed"
                  checked={isTrialAllowed}
                  onChange={e => setIsTrialAllowed(e.target.checked)}
                  className="rounded bg-slate-900 border-white/20 text-purple-600 focus:ring-0"
                />
                <label htmlFor="trialAllowed" className="text-xs text-slate-300">
                  Allow for Free Trial Members (e.g. ৳100 card)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs"
                >
                  Create Card
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
