import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Shield,
  Zap,
  Users,
  Award,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  HelpCircle,
  PhoneCall,
  Mail,
  MapPin,
  Sparkles,
  ArrowRight,
  PlayCircle,
  Clock,
} from 'lucide-react';

interface LandingPageProps {
  onNavigate: (view: string) => void;
}

const heroSlides = [
  {
    id: 1,
    badge: 'Enterprise Platform BD V20',
    title: 'Bangladesh #1 Digital Micro-Task Earning Network',
    subtitle: 'Earn reliable daily income through verified 10-second sponsor video tasks. Instant wallet updates and automated payouts via bKash & Nagad.',
    ctaText: 'Start Free 4-Day Trial',
    ctaAction: 'register',
    bgImage: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=1200&auto=format&fit=crop&q=75',
  },
  {
    id: 2,
    badge: 'Zero Risk Trial Guarantee',
    title: 'Start Free — 100 TK Free Trial Allowance',
    subtitle: 'New members receive a 4-day trial earning 25 TK daily. One device can withdraw trial earnings once in a lifetime with zero initial deposit.',
    ctaText: 'Claim Your Free Trial',
    ctaAction: 'register',
    bgImage: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=1200&auto=format&fit=crop&q=75',
  },
  {
    id: 3,
    badge: 'Tiered Upline Revenue',
    title: 'Build Your 3-Tier Enterprise Team Network',
    subtitle: 'Earn ongoing video commissions and direct referral bonuses across Level A (10%), Level B (5%), and Level C (2%) with monthly manager salaries.',
    ctaText: 'Explore Affiliate Program',
    ctaAction: 'register',
    bgImage: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1200&auto=format&fit=crop&q=75',
  },
];

const faqs = [
  {
    q: 'How does EarnNetwork BD work?',
    a: 'Registered members watch verified 10-second sponsor video tasks daily. Each video requires a live countdown, after which rewards are instantly credited to your real-time wallet balance.',
  },
  {
    q: 'Is there a free trial for new members?',
    a: 'Yes! Every new account gets an automatic 4-Day Free Trial earning 25 TK daily (Total 100 TK). Free trial earnings can be withdrawn once per device without upfront deposit.',
  },
  {
    q: 'What are the withdrawal payment methods and fees?',
    a: 'Withdrawals are processed directly to personal or agent accounts on bKash and Nagad. All withdrawals carry a transparent 10% platform processing fee and daily limit rules.',
  },
  {
    q: 'Why does my device have a single free trial withdrawal?',
    a: 'To maintain platform fairness and protect against multi-account fraud, our Device Fingerprint Engine restricts free trial withdrawals to once per unique device lifetime.',
  },
  {
    q: 'What are the daily withdrawal hours?',
    a: 'Our finance administration processes payouts daily between 8:00 AM and 11:00 PM BST. Withdrawal requests outside operating hours are securely queued for morning dispatch.',
  },
];

export function LandingPage({ onNavigate }: LandingPageProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  // Touch swipe support for mobile
  const touchStartX = React.useRef<number | null>(null);
  const touchStartY = React.useRef<number | null>(null);
  const touchEndX = React.useRef<number | null>(null);
  const touchEndY = React.useRef<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const nextSlide = () => setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
  const prevSlide = () => setCurrentSlide((prev) => (prev - 1 + heroSlides.length) % heroSlides.length);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
    touchStartY.current = e.targetTouches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
    touchEndY.current = e.targetTouches[0].clientY;
  };

  const handleTouchEnd = () => {
    if (
      touchStartX.current === null ||
      touchEndX.current === null ||
      touchStartY.current === null ||
      touchEndY.current === null
    ) {
      return;
    }
    const distanceX = touchStartX.current - touchEndX.current;
    const distanceY = touchStartY.current - touchEndY.current;

    // Only swipe if predominantly horizontal gesture
    if (Math.abs(distanceX) > Math.abs(distanceY) && Math.abs(distanceX) > 50) {
      if (distanceX > 0) {
        nextSlide();
      } else {
        prevSlide();
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
    touchEndX.current = null;
    touchEndY.current = null;
  };

  return (
    <div id="landing-page-root" className="min-h-screen text-slate-100 flex flex-col w-full">
      {/* 1. HERO SLIDER */}
      <section
        id="section-hero-slider"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: 'pan-y' }}
        className="relative min-h-[500px] sm:min-h-[560px] md:h-[620px] overflow-hidden border-b border-white/[0.08] flex items-center"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide}
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7 }}
            className="absolute inset-0"
          >
            {/* Background Image with Dark Gradient Overlay */}
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${heroSlides[currentSlide].bgImage})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#080B14] via-[#080B14]/90 to-[#080B14]/75" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#080B14] via-transparent to-transparent" />

            {/* Slide Content */}
            <div className="relative max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center py-10 pb-24 sm:py-0">
              <div className="max-w-2xl space-y-4 sm:space-y-5">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-xs font-bold uppercase tracking-wider backdrop-blur-md shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                  <Sparkles className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                  <span>{heroSlides[currentSlide].badge}</span>
                </div>
                <h1 className="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight drop-shadow-sm">
                  {heroSlides[currentSlide].title}
                </h1>
                <p className="text-sm sm:text-base md:text-lg text-slate-300 leading-relaxed font-normal">
                  {heroSlides[currentSlide].subtitle}
                </p>
                <div className="pt-2 flex flex-col xs:flex-row items-stretch xs:items-center gap-3">
                  <button
                    id="btn-hero-cta"
                    onClick={() => onNavigate(heroSlides[currentSlide].ctaAction)}
                    className="glass-btn-primary flex items-center justify-center gap-2 text-slate-950 px-6 sm:px-7 py-3.5 rounded-xl font-bold shadow-xl shadow-emerald-950/60 cursor-pointer min-h-[48px] touch-manipulation"
                  >
                    <span>{heroSlides[currentSlide].ctaText}</span>
                    <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                  </button>
                  <button
                    id="btn-hero-login"
                    onClick={() => onNavigate('login')}
                    className="glass-btn-secondary flex items-center justify-center gap-2 text-white px-5 sm:px-6 py-3.5 rounded-xl font-semibold cursor-pointer min-h-[48px] touch-manipulation"
                  >
                    <span>Member Sign In</span>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Slider Controls */}
        <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6 z-20 flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={prevSlide}
            aria-label="Previous slide"
            className="p-2 sm:p-2.5 rounded-full bg-slate-900/60 border border-white/10 text-white hover:bg-white/10 active:scale-90 transition touch-manipulation cursor-pointer backdrop-blur-md"
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <div className="flex gap-1.5 px-1 sm:px-2">
            {heroSlides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentSlide(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  currentSlide === i ? 'w-5 sm:w-6 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'w-2 bg-white/20 hover:bg-white/40'
                }`}
              />
            ))}
          </div>
          <button
            onClick={nextSlide}
            aria-label="Next slide"
            className="p-2 sm:p-2.5 rounded-full bg-slate-900/60 border border-white/10 text-white hover:bg-white/10 active:scale-90 transition touch-manipulation cursor-pointer backdrop-blur-md"
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </section>

      {/* 2. ABOUT COMPANY */}
      <section id="section-about-company" className="py-16 sm:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-5">
            <span className="text-xs font-bold text-emerald-400 tracking-wider uppercase bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
              About EarnNetwork BD
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
              Pioneering Trusted Micro-Task Digitization Across Bangladesh
            </h2>
            <p className="text-slate-300 leading-relaxed text-sm sm:text-base">
              EarnNetwork BD Enterprise bridges global digital advertisers with hardworking individuals and students across Bangladesh. By delivering high-attention 10-second interactive sponsor videos, brands achieve verifiable brand exposure while users generate dependable supplementary income.
            </p>
            <div className="grid grid-cols-2 gap-4 pt-4">
              <div className="p-5 rounded-2xl glass-card glass-card-hover">
                <span className="block text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
                  100,000+
                </span>
                <span className="text-xs sm:text-sm text-slate-300 font-medium">Registered Active Earners</span>
              </div>
              <div className="p-5 rounded-2xl glass-card glass-card-hover">
                <span className="block text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-300 to-cyan-400">
                  ৳ 85M+
                </span>
                <span className="text-xs sm:text-sm text-slate-300 font-medium">Paid Out via bKash/Nagad</span>
              </div>
            </div>
          </div>
          <div className="relative">
            <div className="aspect-video rounded-2xl overflow-hidden border border-white/10 shadow-2xl relative group">
              <img
                src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=900&auto=format&fit=crop&q=80"
                alt="EarnNetwork BD Team"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />
            </div>
            <div className="absolute -bottom-5 -left-4 sm:-left-6 glass-panel border border-emerald-500/30 p-4 rounded-2xl shadow-2xl hidden sm:flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                <Shield className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-extrabold text-white">Govt. Trade Licensed</p>
                <p className="text-xs text-slate-300 font-medium">Dhaka Commerce Reg #BD-2024-V20</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. CORE FEATURES */}
      <section id="section-features" className="py-16 sm:py-24 border-y border-white/[0.08] relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto space-y-3 mb-12">
            <span className="text-xs font-bold text-emerald-400 tracking-wider uppercase bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
              Built for Performance
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">Why Bangladesh Chooses EarnNetwork BD</h2>
            <p className="text-slate-400 text-sm sm:text-base">
              Enterprise engineering guarantees that every task, click, and transaction is transparent and reliable.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 sm:p-7 rounded-2xl glass-card glass-card-hover group">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-5 group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                <Clock className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">10-Second Video Tasks</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Streamlined video tasks require only 10 seconds of active viewing with live countdown timer verification. Immediate wallet credit upon completion.
              </p>
            </div>

            <div className="p-6 sm:p-7 rounded-2xl glass-card glass-card-hover group">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-5 group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Instant bKash & Nagad Integration</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Seamless local banking integration. Deposit from 100 TK and withdraw directly to your personal mobile wallet during active payout hours.
              </p>
            </div>

            <div className="p-6 sm:p-7 rounded-2xl glass-card glass-card-hover group">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500/20 to-rose-500/10 border border-pink-500/30 flex items-center justify-center text-pink-400 mb-5 group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(236,72,153,0.2)]">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">3-Tier Referral Ecosystem</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Earn residual commissions on Level A, Level B, and Level C team members. Gain eligibility for automated monthly manager salaries.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. FAQ */}
      <section id="section-faq" className="py-16 sm:py-24 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-3 mb-12">
          <span className="text-xs font-bold text-emerald-400 tracking-wider uppercase bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
            Have Questions?
          </span>
          <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">Frequently Asked Questions</h2>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => {
            const isOpen = openFaqIndex === index;
            return (
              <div
                key={index}
                className="rounded-2xl glass-card overflow-hidden transition-all duration-200"
              >
                <button
                  onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                  className="w-full text-left p-5 flex items-center justify-between font-bold text-white hover:text-emerald-300 transition cursor-pointer"
                >
                  <span className="text-sm sm:text-base pr-4">{faq.q}</span>
                  <HelpCircle className={`w-5 h-5 shrink-0 transition-transform duration-200 ${isOpen ? 'text-emerald-400 rotate-180' : 'text-slate-400'}`} />
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-sm text-slate-300 leading-relaxed border-t border-white/[0.08] pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. CONTACT */}
      <section id="section-contact" className="py-16 border-t border-white/[0.08]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center md:text-left">
            <div className="p-6 rounded-2xl glass-card flex flex-col items-center md:items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <MapPin className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-white text-base">Headquarters</h4>
              <p className="text-sm text-slate-300 leading-relaxed">Level 8, City Center, Motijheel Commercial Area, Dhaka 1000, Bangladesh</p>
            </div>

            <div className="p-6 rounded-2xl glass-card flex flex-col items-center md:items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <PhoneCall className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-white text-base">Direct Line</h4>
              <p className="text-sm text-slate-300 leading-relaxed">+880 1700-112233 (Daily 9 AM - 11 PM)</p>
            </div>

            <div className="p-6 rounded-2xl glass-card flex flex-col items-center md:items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Mail className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-white text-base">Support Desk</h4>
              <p className="text-sm text-slate-300 leading-relaxed">support@earnnetworkbd.com</p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. FOOTER */}
      <footer id="app-public-footer" className="mt-auto py-8 border-t border-white/[0.08] text-slate-400 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 EarnNetwork BD Ltd. All Rights Reserved.</p>
          <div className="flex items-center gap-5">
            <span className="hover:text-slate-200 transition cursor-pointer">Privacy Policy</span>
            <span className="hover:text-slate-200 transition cursor-pointer">Terms of Service</span>
            <span className="hover:text-slate-200 transition cursor-pointer">AML & Fraud Guidelines</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
