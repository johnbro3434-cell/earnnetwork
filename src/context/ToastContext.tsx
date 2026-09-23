import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextValue {
  showToast: (typeOrTitle: ToastType | string, titleOrMsg?: string, maybeMsg?: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((arg1: ToastType | string, arg2?: string, arg3?: string) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let type: ToastType = 'info';
    let title = '';
    let message: string | undefined = undefined;

    const validTypes: ToastType[] = ['success', 'error', 'info', 'warning'];
    if (validTypes.includes(arg1 as ToastType)) {
      type = arg1 as ToastType;
      title = arg2 || '';
      message = arg3;
    } else {
      title = arg1;
      message = arg2;
      type = 'info';
    }

    setToasts(prev => [...prev.slice(-4), { id, type, title, message }]);

    setTimeout(() => {
      removeToast(id);
    }, 4500);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      {/* Toast Notification Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-3">
        {toasts.map(toast => {
          const borderClass =
            toast.type === 'success'
              ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-200'
              : toast.type === 'error'
              ? 'border-rose-500/40 bg-rose-950/90 text-rose-200'
              : toast.type === 'warning'
              ? 'border-amber-500/40 bg-amber-950/90 text-amber-200'
              : 'border-blue-500/40 bg-slate-900/90 text-blue-200';

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border backdrop-blur-md shadow-2xl transition-all duration-300 transform translate-y-0 ${borderClass}`}
            >
              <div className="shrink-0 mt-0.5">
                {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400" />}
                {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-400" />}
                {toast.type === 'info' && <Info className="w-5 h-5 text-blue-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold leading-tight">{toast.title}</p>
                {toast.message && (
                  <p className="text-xs opacity-90 mt-1 break-words font-medium">{toast.message}</p>
                )}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="shrink-0 p-1 rounded-lg hover:bg-white/10 opacity-70 hover:opacity-100 transition-opacity"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
