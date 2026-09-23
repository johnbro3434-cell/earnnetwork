import React, { useState, useEffect } from 'react';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/layout/Navbar';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import { WhatsAppButton } from './components/common/WhatsAppButton';
import { LandingPage } from './components/public/LandingPage';
import { LoginPage } from './components/public/LoginPage';
import { RegisterPage } from './components/public/RegisterPage';
import { UserDashboard } from './components/dashboard/UserDashboard';
import { VideoTasksView } from './components/tasks/VideoTasksView';
import { WalletView } from './components/wallet/WalletView';
import { PackagesView } from './components/packages/PackagesView';
import { ReferralView } from './components/referral/ReferralView';
import { SalaryView } from './components/salary/SalaryView';
import { PromotionView } from './components/promotion/PromotionView';
import { MyAccountView } from './components/account/MyAccountView';
import { AdminPanel } from './components/admin/AdminPanel';

function AppContent() {
  const { user, admin, isAdmin, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState<string>('home');
  const [isAdminMode, setIsAdminMode] = useState<boolean>(false);

  // If visiting secret hash/route redirect directly to main login page
  useEffect(() => {
    const checkRoute = () => {
      if (window.location.hash === '#admin-secret' || window.location.pathname === '/admin-secret') {
        setCurrentView('login');
        if (window.location.hash) {
          window.location.hash = '';
        }
      }
    };
    checkRoute();
    window.addEventListener('hashchange', checkRoute);
    window.addEventListener('popstate', checkRoute);
    return () => {
      window.removeEventListener('hashchange', checkRoute);
      window.removeEventListener('popstate', checkRoute);
    };
  }, []);

  // Check URL params for referral code or initial view
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref && !user && !admin) {
      setCurrentView('register');
    }
  }, [user, admin]);

  // If user is admin and logs in, set admin mode default
  useEffect(() => {
    if (isAdmin && admin) {
      setIsAdminMode(true);
    } else {
      setIsAdminMode(false);
    }
  }, [isAdmin, admin]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300">
        <div className="w-12 h-12 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold tracking-wide">Connecting to EarnNetwork BD...</p>
      </div>
    );
  }

  // Handle public user (not logged in)
  if (!user && !admin) {
    return (
      <div className="relative min-h-screen bg-[#080B14] text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-slate-950 overflow-x-hidden">
        {/* Soft Blue + Purple + Pink Ambient Glow Background */}
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
          {/* Base gradient layer */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0B0F1D]/80 via-[#080B14] to-[#05070E]" />
          {/* Soft Blue Glow Orb */}
          <div className="absolute -top-[12%] -left-[10%] w-[55vw] h-[55vw] max-w-[650px] max-h-[650px] rounded-full bg-gradient-to-br from-blue-600/18 via-indigo-600/12 to-transparent blur-[120px] pointer-events-none" />
          {/* Soft Purple Glow Orb */}
          <div className="absolute top-[28%] -right-[8%] w-[50vw] h-[50vw] max-w-[620px] max-h-[620px] rounded-full bg-gradient-to-bl from-purple-600/18 via-fuchsia-600/10 to-transparent blur-[130px] pointer-events-none" />
          {/* Soft Pink Glow Orb */}
          <div className="absolute bottom-[10%] left-[15%] w-[50vw] h-[50vw] max-w-[580px] max-h-[580px] rounded-full bg-gradient-to-tr from-pink-600/14 via-rose-600/8 to-transparent blur-[140px] pointer-events-none" />
          {/* Subtle Grid Accent */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-60" />
        </div>

        <div className="relative z-10 flex flex-col min-h-screen">
          <Navbar
            currentView={currentView}
            setCurrentView={setCurrentView}
            isAdminMode={false}
            setIsAdminMode={() => {}}
          />

          <main className="flex-1 pb-16 md:pb-8">
            {currentView === 'login' ? (
              <LoginPage
                onNavigate={setCurrentView}
                onLoginSuccess={(isAdm) => {
                  if (isAdm) {
                    setIsAdminMode(true);
                    setCurrentView('home');
                  } else {
                    setIsAdminMode(false);
                    setCurrentView('home');
                  }
                }}
              />
            ) : currentView === 'register' ? (
              <RegisterPage
                onNavigate={setCurrentView}
                onRegisterSuccess={() => {
                  setCurrentView('home');
                }}
              />
            ) : (
              <LandingPage onNavigate={setCurrentView} />
            )}
          </main>

          <WhatsAppButton />
        </div>
      </div>
    );
  }

  // Authenticated user (Member or Admin)
  return (
    <div className="relative min-h-screen bg-[#080B14] text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-slate-950 overflow-x-hidden">
      {/* Soft Blue + Purple + Pink Ambient Glow Background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        {/* Base gradient layer */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B0F1D]/80 via-[#080B14] to-[#05070E]" />
        {/* Soft Blue Glow Orb */}
        <div className="absolute -top-[10%] -left-[8%] w-[55vw] h-[55vw] max-w-[650px] max-h-[650px] rounded-full bg-gradient-to-br from-blue-600/18 via-indigo-600/12 to-transparent blur-[120px] pointer-events-none" />
        {/* Soft Purple Glow Orb */}
        <div className="absolute top-[25%] -right-[8%] w-[50vw] h-[50vw] max-w-[620px] max-h-[620px] rounded-full bg-gradient-to-bl from-purple-600/18 via-fuchsia-600/10 to-transparent blur-[130px] pointer-events-none" />
        {/* Soft Pink Glow Orb */}
        <div className="absolute bottom-[8%] left-[20%] w-[50vw] h-[50vw] max-w-[580px] max-h-[580px] rounded-full bg-gradient-to-tr from-pink-600/14 via-rose-600/8 to-transparent blur-[140px] pointer-events-none" />
        {/* Subtle Grid Accent */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-60" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        <Navbar
          currentView={currentView}
          setCurrentView={setCurrentView}
          isAdminMode={isAdminMode}
          setIsAdminMode={setIsAdminMode}
        />

        <main className={`flex-1 ${!isAdminMode ? 'pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-8' : 'pb-8'}`}>
          {isAdminMode ? (
            <AdminPanel />
          ) : (
            <>
              {currentView === 'tasks' && <VideoTasksView />}
              {currentView === 'wallet' && <WalletView initialTab="overview" onNavigate={setCurrentView} />}
              {currentView === 'withdraw' && <WalletView initialTab="withdraw" onNavigate={setCurrentView} />}
              {currentView === 'packages' && <PackagesView onNavigate={setCurrentView} />}
              {currentView === 'referral' && <ReferralView />}
              {currentView === 'salary' && <SalaryView />}
              {currentView === 'promotion' && <PromotionView />}
              {currentView === 'account' && <MyAccountView />}
              {currentView === 'notifications' && <MyAccountView />}
              {['home', 'dashboard'].includes(currentView) && <UserDashboard onNavigate={setCurrentView} />}
            </>
          )}
        </main>

        {/* Floating WhatsApp Support Button */}
        <WhatsAppButton />

        {/* Mobile Bottom Navigation (Only for regular member view) */}
        {!isAdminMode && (
          <MobileBottomNav currentView={currentView} setCurrentView={setCurrentView} />
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ToastProvider>
  );
}
