import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Phone, Lock, Share2, ArrowRight, AlertCircle } from 'lucide-react';

interface RegisterPageProps {
  onNavigate: (view: string) => void;
  onRegisterSuccess: () => void;
}

export function RegisterPage({ onNavigate, onRegisterSuccess }: RegisterPageProps) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [referralCode, setReferralCode] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    return ref ? ref.trim().toUpperCase() : '';
  });
  const [fromUrl] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return Boolean(urlParams.get('ref'));
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanPhone = phone.replace(/[\s-]/g, '');
    if (!cleanPhone) {
      setError('অনুগ্রহ করে আপনার বাংলাদেশি মোবাইল নম্বর লিখুন।');
      return;
    }

    if (!/^(?:\+8801|8801|01)[3-9]\d{8}$/.test(cleanPhone)) {
      setError('সঠিক ১১ ডিজিটের বাংলাদেশি মোবাইল নম্বর প্রদান করুন (যেমন: 017xxxxxxxx)।');
      return;
    }

    if (!password || password.length < 6) {
      setError('পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।');
      return;
    }

    if (password !== confirmPassword) {
      setError('পাসওয়ার্ড দুটি মিলছে না। একই পাসওয়ার্ড দিন।');
      return;
    }

    if (!referralCode || !referralCode.trim()) {
      setError('রেফার কোড আবশ্যক! রেফার কোড ছাড়া অ্যাকাউন্ট তৈরি করা সম্ভব নয়।');
      return;
    }

    setLoading(true);
    try {
      await register(cleanPhone, password, referralCode.trim().toUpperCase());
      onRegisterSuccess();
    } catch (err: any) {
      setError(err.message || 'রেজিস্ট্রেশন সম্পন্ন হতে পারেনি। অনুগ্রহ করে আবার চেষ্টা করুন।');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="register-page-root" className="min-h-[85vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-7 p-7 sm:p-9 glass-panel rounded-3xl relative overflow-hidden">
        {/* Subtle top glow line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent opacity-80" />

        <div className="text-center space-y-2">
          <h2 className="text-2xl font-black tracking-tight text-white">Create Your Account</h2>
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
              Bangladesh Mobile Number
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Phone className="w-4 h-4" />
              </div>
              <input
                id="input-register-phone"
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="017xxxxxxxx"
                className="w-full pl-10 pr-4 py-3 glass-input rounded-xl text-white text-sm placeholder-slate-500 transition"
              />
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">One account per mobile number.</span>
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
                id="input-register-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full pl-10 pr-4 py-3 glass-input rounded-xl text-white text-sm placeholder-slate-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Confirm Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="input-register-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                className="w-full pl-10 pr-4 py-3 glass-input rounded-xl text-white text-sm placeholder-slate-500 transition"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                Referral Code <span className="text-rose-400">* (আবশ্যক / Required)</span>
              </label>
              {fromUrl && referralCode && (
                <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full backdrop-blur-md">
                  Link Applied ✓
                </span>
              )}
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Share2 className="w-4 h-4 text-purple-400" />
              </div>
              <input
                id="input-register-referral-code"
                type="text"
                required
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                placeholder="Enter sponsor referral code (e.g. EHBD1001)"
                className="w-full pl-10 pr-4 py-3 glass-input rounded-xl text-white text-sm uppercase font-mono tracking-wider focus:border-purple-400/80 transition"
              />
            </div>
          </div>

          <button
            id="btn-submit-register"
            type="submit"
            disabled={loading}
            className="w-full glass-btn-primary flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-slate-950 font-bold text-sm transition disabled:opacity-50 cursor-pointer min-h-[46px]"
          >
            {loading ? 'Creating Account...' : 'Create Account'}
            {!loading && <ArrowRight className="w-4 h-4 stroke-[2.5]" />}
          </button>
        </form>

        <div className="text-center text-xs text-slate-300 pt-1">
          Already have an account?{' '}
          <button
            id="link-to-login"
            onClick={() => onNavigate('login')}
            className="text-emerald-400 font-bold hover:text-emerald-300 hover:underline cursor-pointer ml-1"
          >
            Sign In Here
          </button>
        </div>
      </div>
    </div>
  );
}
