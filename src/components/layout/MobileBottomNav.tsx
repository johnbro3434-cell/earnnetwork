import React from 'react';
import { Home, PlaySquare, Wallet, Users, User } from 'lucide-react';

interface MobileBottomNavProps {
  currentView: string;
  setCurrentView: (view: string) => void;
}

export function MobileBottomNav({ currentView, setCurrentView }: MobileBottomNavProps) {
  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'tasks', label: 'Tasks', icon: PlaySquare },
    { id: 'wallet', label: 'Wallet', icon: Wallet },
    { id: 'referral', label: 'Referral', icon: Users },
    { id: 'account', label: 'Account', icon: User },
  ];

  return (
    <nav
      id="mobile-bottom-navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/75 border-t border-white/[0.08] backdrop-blur-2xl pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-8px_32px_rgba(0,0,0,0.5)] touch-manipulation"
    >
      <div className="grid grid-cols-5 h-16 max-w-lg mx-auto px-1.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              id={`mobile-nav-${item.id}`}
              onClick={() => setCurrentView(item.id)}
              className={`flex flex-col items-center justify-center gap-1 transition-all duration-200 active:scale-90 select-none cursor-pointer h-full min-h-[48px] ${
                isActive ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className={`relative p-1 rounded-xl transition-all ${isActive ? 'bg-emerald-500/15 text-emerald-300' : ''}`}>
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-105 stroke-[2.5px]' : 'stroke-2'}`} />
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-emerald-400 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                )}
              </div>
              <span className={`text-[10px] sm:text-xs tracking-tight ${isActive ? 'text-emerald-300 font-bold' : 'text-slate-400'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
