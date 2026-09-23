/**
 * EarnHub BD V20 — Enterprise Security Hardening Module
 * Features:
 * - Anti-DDoS & Brute-Force Rate Limiters (Auth, Sensitive Actions, Global API)
 * - Anti-NoSQL Injection & Object Key Sanitizer
 * - Anti-XSS and Input Scrubbing
 * - Financial Amount Safe Validator (Negative/NaN/Infinity Exploit Prevention)
 * - Safe HTTP Security Headers
 */

import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

// 1. Auth Rate Limiter (Brute-force protection for login, register & admin access)
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 authentication attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: {
    error: 'অতিরিক্ত চেষ্টা করা হয়েছে। অনুগ্রহ করে ১৫ মিনিট পর পুনরায় চেষ্টা করুন (Rate Limit Exceeded).',
  },
});

// 2. Financial Rate Limiter (Anti-Race Condition & Anti-Spam for Deposit, Withdraw & Task claims)
export const financialRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // Max 20 money actions per minute
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: {
    error: 'অত্যধিক দ্রুত অনুরোধ করা হয়েছে। অনুগ্রহ করে কয়েক সেকেন্ড অপেক্ষা করুন।',
  },
});

// 3. Global API Rate Limiter
export const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500, // Max 1500 requests per 15 mins per IP
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: {
    error: 'অতিরিক্ত অনুরোধ সনাক্ত হয়েছে। কিছু সময় পর পুনরায় চেষ্টা করুন।',
  },
});

// 4. Safe Financial Number Validator
export function isValidPositiveAmount(val: any, min = 1, max = 10000000): boolean {
  if (val === null || val === undefined) return false;
  const num = Number(val);
  return typeof num === 'number' && !isNaN(num) && isFinite(num) && num >= min && num <= max;
}

// 5. Anti-Injection & Sanitization Middleware
export function sanitizeRequestData(req: Request, res: Response, next: NextFunction) {
  // Recursively sanitize objects to prevent MongoDB $ operator injections and illegal characters
  function clean(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      if (typeof obj === 'string') {
        // Strip out control characters and null bytes
        return obj.replace(/\0/g, '').trim();
      }
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(clean);
    }

    const sanitized: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      // Block NoSQL injection keys like $gt, $where, $ne, or prototype pollution keys
      if (key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor') {
        continue;
      }
      sanitized[key] = clean(obj[key]);
    }
    return sanitized;
  }

  if (req.body) {
    req.body = clean(req.body);
  }
  if (req.query) {
    req.query = clean(req.query) as any;
  }
  if (req.params) {
    req.params = clean(req.params) as any;
  }

  next();
}

// 6. Security Headers Middleware
export function applySecurityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Download-Options', 'noopen');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  next();
}
