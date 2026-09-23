import React, { useState, useEffect } from 'react';
import { MessageSquare, CheckCircle, Clock, AlertCircle, Send, User, Search, RefreshCw } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { SupportTicket } from '../../types';

interface SupportCRMTabProps {
  onSelectUser: (phone: string) => void;
}

export function SupportCRMTab({ onSelectUser }: SupportCRMTabProps) {
  const { showToast } = useToast();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyText, setReplyText] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [search, setSearch] = useState('');

  const loadTickets = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/api/admin/support/tickets');
      const list = Array.isArray(res) ? res : res.tickets || [];
      setTickets(list);
      if (selectedTicket) {
        const updated = list.find((t: SupportTicket) => t.id === selectedTicket.id);
        if (updated) setSelectedTicket(updated);
      }
    } catch (e: any) {
      showToast('error', 'Failed to load tickets', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const handleSendReply = async () => {
    if (!selectedTicket || !replyText.trim()) return;
    try {
      await apiRequest(`/api/admin/support/tickets/${selectedTicket.id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ message: replyText.trim() }),
      });
      showToast('success', 'Reply Sent', 'Your response has been added.');
      setReplyText('');
      loadTickets();
    } catch (e: any) {
      showToast('error', 'Failed to send reply', e.message);
    }
  };

  const handleStatusChange = async (ticketId: string, status: string) => {
    try {
      await apiRequest(`/api/admin/support/tickets/${ticketId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      showToast('success', 'Status Updated', `Ticket marked as ${status}`);
      loadTickets();
    } catch (e: any) {
      showToast('error', 'Failed to update status', e.message);
    }
  };

  const filteredTickets = tickets.filter(t => {
    const matchesStatus = filterStatus === 'all' || t.status === filterStatus;
    const matchesSearch =
      t.userPhone?.includes(search) ||
      t.subject?.toLowerCase().includes(search.toLowerCase()) ||
      t.id?.includes(search);
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-400" />
            Support CRM & Member Helpdesk
          </h2>
          <p className="text-xs text-slate-400">Resolve inquiries and live chat tickets</p>
        </div>

        <button
          onClick={loadTickets}
          className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 transition-colors flex items-center gap-1.5 text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ticket List */}
        <div className="lg:col-span-1 glass-panel rounded-2xl p-4 space-y-4">
          <div className="space-y-2">
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search ticket or phone..."
                className="w-full pl-9 pr-3 py-2 bg-slate-900/80 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>

            <div className="flex gap-1 overflow-x-auto pb-1">
              {['all', 'open', 'in_progress', 'resolved'].map(status => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    filterStatus === status
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {status.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {loading ? (
              <p className="text-xs text-slate-400 text-center py-6">Loading tickets...</p>
            ) : filteredTickets.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No support tickets found.</p>
            ) : (
              filteredTickets.map(ticket => (
                <div
                  key={ticket.id}
                  onClick={() => setSelectedTicket(ticket)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedTicket?.id === ticket.id
                      ? 'bg-emerald-950/40 border-emerald-500/40'
                      : 'bg-slate-900/50 border-white/5 hover:border-white/15'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-bold text-white truncate">{ticket.subject}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                        ticket.status === 'resolved'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : ticket.status === 'open'
                          ? 'bg-rose-500/10 text-rose-400'
                          : 'bg-amber-500/10 text-amber-400'
                      }`}
                    >
                      {ticket.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{ticket.userPhone}</span>
                    <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Conversation View */}
        <div className="lg:col-span-2 glass-panel rounded-2xl p-5 flex flex-col min-h-[450px]">
          {selectedTicket ? (
            <>
              <div className="pb-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-white">{selectedTicket.subject}</h3>
                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                    <span>Category: {selectedTicket.category || 'General'}</span>
                    <span>•</span>
                    <button
                      onClick={() => onSelectUser(selectedTicket.userPhone)}
                      className="text-emerald-400 hover:underline inline-flex items-center gap-1"
                    >
                      <User className="w-3 h-3" />
                      {selectedTicket.userPhone}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={selectedTicket.status}
                    onChange={e => handleStatusChange(selectedTicket.id, e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-900 border border-white/15 rounded-xl text-xs text-white focus:outline-none"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>

              {/* Messages list */}
              <div className="flex-1 overflow-y-auto py-4 space-y-3 max-h-[350px]">
                {(selectedTicket.messages || []).map((msg: any, idx: number) => {
                  const isAdmin = msg.sender === 'admin' || msg.sender === 'support';
                  return (
                    <div
                      key={idx}
                      className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl p-3 text-xs ${
                          isAdmin
                            ? 'bg-emerald-600 text-white rounded-tr-none'
                            : 'bg-slate-800 text-slate-200 rounded-tl-none'
                        }`}
                      >
                        <p className="font-medium">{msg.text || msg.message}</p>
                        <span className="block text-[10px] opacity-70 mt-1">
                          {msg.time || new Date(msg.createdAt || Date.now()).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reply Input */}
              <div className="pt-3 border-t border-white/10 flex gap-2">
                <input
                  type="text"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendReply()}
                  placeholder="Type an official admin response..."
                  className="flex-1 px-4 py-2.5 bg-slate-900/80 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={handleSendReply}
                  className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  Reply
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
              <MessageSquare className="w-10 h-10 mb-2 opacity-40" />
              <p className="text-xs">Select a support ticket from the list to view dialogue</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
