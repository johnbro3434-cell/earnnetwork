import express from 'express';
import http from 'http';
import path from 'path';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import routes from './server/routes';
import { initSocketIO } from './server/socket';
import { connectMongoDB, isMongoConnected, startMongoHeartbeat } from './server/database/mongoose';
import { initMongoSync, reloadStoreFromMongoIfStale, flushStoreToMongo, isStoreHydrated } from './server/db';
import {
  applySecurityHeaders,
  sanitizeRequestData,
  globalApiLimiter,
} from './server/security';
import dotenv from 'dotenv';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;
  const httpServer = http.createServer(app);

  // Trust reverse proxies (Cloud Run, Vercel, Nginx)
  app.set('trust proxy', 1);

  // Apply enterprise security headers & anti-injection sanitization
  app.use(applySecurityHeaders);
  app.use(sanitizeRequestData);

  // Initialize Socket.IO on the same HTTP server
  initSocketIO(httpServer);

  // Start background MongoDB ping heartbeat to prevent idle disconnects
  startMongoHeartbeat();

  // Initialize MongoDB Atlas connection (falls back to local store if MONGODB_URI not provided)
  connectMongoDB()
    .then((connected) => {
      if (connected) initMongoSync().catch(() => {});
    })
    .catch(err => {
      console.warn('[Database] Optional MongoDB Atlas init deferred:', err.message);
    });

  // Pre-request middleware: ensure connection & latest state across all instances
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
      // continue with persistence fallback
    }
    next();
  });

  // Response interceptor: guarantees state flush before responding
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

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      database: isMongoConnected() ? 'connected' : 'offline_or_connecting',
      service: 'EarnNetwork BD (earnnetworkbd.com)',
      version: 'v20.0.0-enterprise',
      realtime: 'Socket.IO enabled',
    });
  });

  // APK download routes
  app.get(['/downloads/EarnHubVerify.apk', '/api/downloads/EarnHubVerify.apk'], (req, res) => {
    const apkPath = path.join(process.cwd(), 'public', 'downloads', 'EarnHubVerify.apk');
    res.download(apkPath, 'EarnHubVerify.apk');
  });

  // Mount API routes
  app.use('/api', routes);
  app.use('/', routes);

  // Database offline error fallback
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err && (err.name === 'MongooseError' || err.name === 'MongoNetworkError' || (err.message && err.message.includes('buffering timed out')))) {
      console.warn('[AI Studio] Database offline — returning mock empty response');
      if (req.method === 'GET') {
        return res.json(req.path.endsWith('s') || req.path.endsWith('s/') ? [] : {});
      }
      return res.status(503).json({ error: 'Service temporarily unavailable (database offline)' });
    }
    next(err);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`EarnHub BD V20 Enterprise running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
