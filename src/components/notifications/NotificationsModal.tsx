import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, X, CheckCheck, Clock } from 'lucide-react';
import { AppNotification } from '../../types';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export function NotificationsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const { decrementUnread } = useAuth();

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      apiRequest('/api/notifications')
        .then((res) => {
          setNotifications(res.notifications || []);
          return apiRequest('/api/notifications/mark-read', { method: 'POST' });
        })
        .then(() => {
          decrementUnread();
        })
        .catch((e) => console.warn('Notification fetch error:', e))
        .finally(() => setLoading(false));
    }
  }, [isOpen, decrementUnread]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div id="modal-notifications-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <motion.div
          id="modal-notifications-card"
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="glass-panel border border-white/15 rounded-3xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl overflow-hidden relative"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.03]">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 shadow-sm">
                <Bell className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-white text-base">Notifications</h3>
            </div>
            <button
              id="btn-close-notifications"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {loading ? (
              <div className="text-center py-10 text-slate-400 text-sm">Loading alerts...</div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm space-y-2">
                <CheckCheck className="w-10 h-10 mx-auto text-emerald-400/80 mb-2" />
                <p className="font-semibold text-white">You are all caught up!</p>
                <p className="text-xs text-slate-400">No recent notifications.</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className="p-4 rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] hover:border-white/20 transition-all flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">{notif.title}</span>
                    <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3 text-purple-300" />
                      {new Date(notif.createdAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{notif.message}</p>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
