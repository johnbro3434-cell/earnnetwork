import React from 'react';
import { motion } from 'motion/react';
import { MessageCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export function WhatsAppButton() {
  const { settings } = useAuth();
  const rawNumber = settings?.whatsappNumber || '+8801700112233';
  const cleanNumber = rawNumber.replace(/[^0-9]/g, '');

  const handleClick = () => {
    window.open(`https://wa.me/${cleanNumber}?text=Hello%20EarnNetwork%20BD%20Support,%20I%20need%20assistance.`, '_blank');
  };

  return (
    <motion.button
      id="btn-whatsapp-floating"
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
      animate={{
        boxShadow: [
          '0 0 0 0 rgba(37, 211, 102, 0.5)',
          '0 0 0 14px rgba(37, 211, 102, 0)',
        ],
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
      }}
      onClick={handleClick}
      className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-8 right-4 sm:right-6 z-40 flex items-center gap-2.5 bg-gradient-to-tr from-[#1ebd59] via-[#25D366] to-[#40e37e] text-slate-950 p-3 sm:px-4 sm:py-3 rounded-full font-bold shadow-[0_8px_32px_rgba(37,211,102,0.4),inset_0_1px_0_rgba(255,255,255,0.45)] border border-white/30 transition-all cursor-pointer active:scale-95 touch-manipulation hover:shadow-[0_12px_40px_rgba(37,211,102,0.55)]"
      title="Chat with WhatsApp Support 24/7"
    >
      <MessageCircle className="w-5 h-5 sm:w-6 sm:h-6 fill-slate-950 shrink-0" />
      <span className="hidden sm:inline text-xs sm:text-sm font-extrabold tracking-tight">WhatsApp Support</span>
    </motion.button>
  );
}
