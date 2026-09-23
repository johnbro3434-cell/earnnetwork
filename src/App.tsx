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

function parseRoute(pathname: string): { view: string; isAdmin: boolean } {
  const clean = pathname.replace(/\/+$/, '').toLowerCase() || '/';
  if (clean === '/admin' || clean === '/admin-secret') return { view: 'admin', isAdmin: true };
  if (clean === '/login') return { view: 'login', isAdmin: false };
  if (clean === '/register') return { view: 'register', isAdmin: false };
  if (clean === '/tasks') return { view: 'tasks', isAdmin: false };
  if (clean === '/wallet') return { view: 'wallet', isAdmin: false };
  if (clean === '/withdraw') return { view: 'withdraw', isAdmin: false };
  if (clean === '/packages') return { view: 'packages', isAdmin: false };
  if (clean === '/referral') return { view: 'referral', isAdmin: false };
  if (clean === '/salary') return { view: 'salary', isAdmin: false };
  if (clean === '/promotion') return { view: 'promotion', isAdmin: false };
  if (clean === '/account') return { view: 'account', isAdmin: false };
  if (clean === '/notifications') return { view: 'notifications', isAdmin: false };
  if (clean === '/dashboard') return { view: 'dashboard', isAdmin: false };
  return { view: 'home', isAdmin: false };
}

function getPathForView(view: string, isAdmMode: boolean, isLoggedIn: boolean): string {
  if (isAdmMode) return '/admin';
  if (!isLoggedIn) {
    if (view === 'login') return '/login';
    if (view === 'register') return '/register';
    return '/';
  }
  if (view === 'home' || view === 'dashboard') return '/dashboard';
  return `/${view}`;
}

function AppContent() {
  const { user, admin, isAdmin, isLoading } = useAuth();
  const initialRoute = parseRoute(window.location.pathname);
  const [currentView, setCurrentView] = useState<string>(initialRoute.view);
  const [isAdminMode, setIsAdminMode] = useState<boolean>(initialRoute.isAdmin);

  // Sync state and browser URL address bar seamlessly
  const navigateTo = (targetView: string, explicitAdminMode?: boolean) => {
    let nextView = targetView;
    let nextAdminMode = explicitAdminMode !== undefined ? explicitAdminMode : isAdminMode;

    if (targetView === 'admin') {
      nextAdminMode = true;
      nextView = 'dashboard';
    } else if (explicitAdminMode === false || targetView === 'dashboard' || targetView === 'home') {
      if (explicitAdminMode === undefined && !isAdmin) {
        nextAdminMode = false;
      }
    }

    setIsAdminMode(nextAdminMode);
    setCurrentView(nextView);

    const isLoggedIn = Boolean(user || admin);
    const targetPath = getPathForView(nextView, nextAdminMode, isLoggedIn);

    if (window.location.pathname !== targetPath) {
      window.history.pushState({ view: nextView, isAdminMode: nextAdminMode }, '', targetPath);
    }
  };

  // Sync with browser Back and Forward button navigation (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const parsed = parseRoute(window.location.pathname);
      setIsAdminMode(parsed.isAdmin && Boolean(admin || isAdmin));
      setCurrentView(parsed.view);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [admin, isAdmin]);

  // Handle secret admin hash or route
  useEffect(() => {
    if (window.location.hash === '#admin-secret' || window.location.pathname === '/admin-secret') {
      navigateTo('login');
      if (window.location.hash) {
        window.location.hash = '';
      }
    }
  }, []);

  // Check URL params for referral code or initial view
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref && !user && !admin) {
      navigateTo('register');
    }
  }, [user, admin]);

  // When auth state settles, ensure URL matches login state
  useEffect(() => {
    if (isLoading) return;

    const isLoggedIn = Boolean(user || admin);
    const parsed = parseRoute(window.location.pathname);

    if (isLoggedIn) {
      if (isAdmin && admin) {
        if (parsed.view === 'home' || parsed.view === 'login' || parsed.view === 'register') {
          navigateTo('dashboard', true);
        } else {
          setIsAdminMode(parsed.isAdmin);
        }
      } else {
        setIsAdminMode(false);
        if (parsed.view === 'home' || parsed.view === 'login' || parsed.view === 'register') {
          navigateTo('dashboard', false);
        } else {
          setCurrentView(parsed.view);
          const expectedPath = getPathForView(parsed.view, false, true);
          if (window.location.pathname !== expectedPath) {
            window.history.replaceState(null, '', expectedPath);
          }
        }
      }
    } else {
      setIsAdminMode(false);
      const protectedViews = ['dashboard', 'tasks', 'wallet', 'withdraw', 'packages', 'referral', 'salary', 'promotion', 'account', 'notifications', 'admin'];
      if (protectedViews.includes(parsed.view)) {
        navigateTo('login');
      }
    }
  }, [isLoading, user, admin, isAdmin]);

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
            setCurrentView={navigateTo}
            isAdminMode={false}
            setIsAdminMode={(adm) => navigateTo('dashboard', adm)}
          />

          <main className="flex-1 pb-16 md:pb-8">
            {currentView === 'login' ? (
              <LoginPage
                onNavigate={navigateTo}
                onLoginSuccess={(isAdm) => {
                  if (isAdm) {
                    navigateTo('dashboard', true);
                  } else {
                    navigateTo('dashboard', false);
                  }
                }}
              />
            ) : currentView === 'register' ? (
              <RegisterPage
                onNavigate={navigateTo}
                onRegisterSuccess={() => {
                  navigateTo('dashboard', false);
                }}
              />
            ) : (
              <LandingPage onNavigate={navigateTo} />
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
          setCurrentView={navigateTo}
          isAdminMode={isAdminMode}
          setIsAdminMode={(adm) => navigateTo('dashboard', adm)}
        />

        <main className={`flex-1 ${!isAdminMode ? 'pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-8' : 'pb-8'}`}>
          {isAdminMode ? (
            <AdminPanel />
          ) : (
            <>
              {currentView === 'tasks' && <VideoTasksView />}
              {currentView === 'wallet' && <WalletView initialTab="overview" onNavigate={navigateTo} />}
              {currentView === 'withdraw' && <WalletView initialTab="withdraw" onNavigate={navigateTo} />}
              {currentView === 'packages' && <PackagesView onNavigate={navigateTo} />}
              {currentView === 'referral' && <ReferralView />}
              {currentView === 'salary' && <SalaryView />}
              {currentView === 'promotion' && <PromotionView />}
              {currentView === 'account' && <MyAccountView />}
              {currentView === 'notifications' && <MyAccountView />}
              {['home', 'dashboard'].includes(currentView) && <UserDashboard onNavigate={navigateTo} />}
            </>
          )}
        </main>

        {/* Floating WhatsApp Support Button */}
        <WhatsAppButton />

        {/* Mobile Bottom Navigation (Only for regular member view) */}
        {!isAdminMode && (
          <MobileBottomNav currentView={currentView} setCurrentView={navigateTo} />
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
