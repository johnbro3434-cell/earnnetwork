import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import routes from './routes';
import { connectMongoDB, isMongoConnected } from './database/mongoose';
import { initMongoSync, flushStoreToMongo, reloadStoreFromMongoIfStale, isStoreHydrated } from './db';
import {
  applySecurityHeaders,
  sanitizeRequestData,
  globalApiLimiter,
} from './security';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

app.set('trust proxy', 1);

// Enable CORS for cross-origin or same-domain requests
app.use(cors({ origin: true, credentials: true }));

// Apply enterprise security headers & anti-injection sanitization
app.use(applySecurityHeaders);
app.use(sanitizeRequestData);

// Initialize MongoDB Atlas connection if available
connectMongoDB()
  .then((connected) => {
    if (connected) initMongoSync().catch(() => {});
  })
  .catch((err) => {
    console.warn('[Database] Optional MongoDB Atlas init deferred:', err?.message);
  });

// Pre-request middleware: ensure connection & latest state across all serverless instances
app.use(async (req, res, next) => {
  try {
    const connected = await connectMongoDB();
    if (connected) {
      if (!isStoreHydrated()) {
        await initMongoSync();
      } else {
        await reloadStoreFromMongoIfStale(req.method !== 'GET');
      }
    }
  } catch (e) {
    // continue with local persistence if DB unavailable
  }
  next();
});

// Response interceptor: guarantees MongoDB commit completes BEFORE Vercel freezes lambda
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  let hasFlushed = false;
  const flushPersistence = async () => {
    if (hasFlushed) return;
    hasFlushed = true;
    try {
      await flushStoreToMongo();
    } catch (e) {
      console.warn('[Database] Flush on response deferred:', e);
    }
  };

  res.json = function (body: any) {
    flushPersistence()
      .catch(() => {})
      .finally(() => {
        originalJson(body);
      });
    return res;
  };

  res.send = function (body: any) {
    flushPersistence()
      .catch(() => {})
      .finally(() => {
        originalSend(body);
      });
    return res;
  };

  next();
});

// Global API Rate Limiter
app.use('/api', globalApiLimiter);

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Health check endpoints
const healthHandler = (req: express.Request, res: express.Response) => {
  res.json({
    status: 'ok',
    database: isMongoConnected() ? 'connected' : 'offline_or_connecting',
    service: 'EarnNetwork BD (earnnetworkbd.com)',
    version: 'v20.0.0-enterprise',
    time: new Date().toISOString(),
  });
};
app.get('/api/health', healthHandler);
app.get('/health', healthHandler);

// Mount routes on both /api and root
app.use('/api', routes);
app.use('/', routes);

// Universal safe error-handling middleware to prevent FUNCTION_INVOCATION_FAILED
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[API Runtime Error]:', err?.message || err);
  if (res.headersSent) {
    return next(err);
  }
  return res.status(err?.status || 500).json({
    error: err?.message || 'একটি সার্ভার ত্রুটি ঘটেছে। অনুগ্রহ করে পুনরায় চেষ্টা করুন।',
  });
});

export default app;
