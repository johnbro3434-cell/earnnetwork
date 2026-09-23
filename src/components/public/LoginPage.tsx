import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Phone, Lock, ArrowRight, AlertCircle } from 'lucide-react';

interface LoginPageProps {
  onNavigate: (view: string) => void;
  onLoginSuccess: (isAdmin: boolean) => void;
}

export function LoginPage({ onNavigate, onLoginSuccess }: LoginPageProps) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!phone.trim()) {
      setError('অনুগ্রহ করে আপনার মোবাইল নম্বর লিখুন।');
      return;
    }

    if (!password) {
      setError('অনুগ্রহ করে আপনার পাসওয়ার্ড লিখুন।');
      return;
    }

    setLoading(true);
    try {
      const res = await login(phone.trim(), password);
      onLoginSuccess(res.isAdmin);
    } catch (err: any) {
      setError(err.message || 'লগইন ব্যর্থ হয়েছে। মোবাইল নম্বর ও পাসওয়ার্ড সঠিক কিনা পরীক্ষা করুন।');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="login-page-root" className="min-h-[85vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-7 p-7 sm:p-9 glass-panel rounded-3xl relative overflow-hidden">
        {/* Subtle top glow line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent opacity-80" />

        <div className="text-center space-y-2">
          <img
            src="/logo.svg"
            alt="EarnNetwork BD"
            className="w-13 h-13 rounded-2xl mx-auto object-contain border border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.35)]"
          />
          <h2 className="text-2xl font-black tracking-tight text-white">Sign In to EarnNetwork BD</h2>
          <p className="text-xs text-slate-300 font-normal">
            Secure login for users and system administrators.
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2.5 backdrop-blur-md">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Phone Number
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Phone className="w-4 h-4" />
              </div>
              <input
                id="input-login-phone"
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01xxxxxxxxx"
                className="w-full pl-10 pr-4 py-3 glass-input rounded-xl text-white text-sm placeholder-slate-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="input-login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-3 glass-input rounded-xl text-white text-sm placeholder-slate-500 transition"
              />
            </div>
          </div>

          <button
            id="btn-submit-login"
            type="submit"
            disabled={loading}
            className="w-full glass-btn-primary flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-slate-950 font-bold text-sm transition disabled:opacity-50 cursor-pointer min-h-[46px]"
          >
            {loading ? 'Authenticating...' : 'Sign In Securely'}
            {!loading && <ArrowRight className="w-4 h-4 stroke-[2.5]" />}
          </button>
        </form>

        <div className="text-center text-xs text-slate-300 pt-1">
          Don't have an account?{' '}
          <button
            id="link-to-register"
            onClick={() => onNavigate('register')}
            className="text-emerald-400 font-bold hover:text-emerald-300 hover:underline cursor-pointer ml-1"
          >
            Create an Account
          </button>
        </div>
      </div>
    </div>
  );
}
