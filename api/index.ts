import express from 'express';
import cookieParser from 'cookie-parser';
import routes from '../server/routes';
import { connectMongoDB } from '../server/database/mongoose';
import {
  applySecurityHeaders,
  sanitizeRequestData,
  globalApiLimiter,
} from '../server/security';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

app.set('trust proxy', 1);

// Apply enterprise security headers & anti-injection sanitization
app.use(applySecurityHeaders);
app.use(sanitizeRequestData);

// Initialize MongoDB Atlas connection if available
connectMongoDB().catch(err => {
  console.warn('[Database] Optional MongoDB Atlas init deferred:', err.message);
});

// Middleware to ensure DB connection on serverless cold starts
app.use(async (req, res, next) => {
  try {
    await connectMongoDB();
  } catch (e) {
    // continue with local persistence if DB unavailable
  }
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
    service: 'EarnHub BD V20 Enterprise (Vercel Serverless)',
    version: 'v20.0.0-enterprise',
  });
});

// Mount routes
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

export default app;
