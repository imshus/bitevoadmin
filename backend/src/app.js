// The Express app: security headers, CORS for the admin frontend, cookie sessions, and the /api routes.
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { store } from './db/index.js';
import { requireAdmin, clearSessionCookie } from './auth.js';
import { errorHandler, forbidden } from './lib/http.js';
import { router as authRoutes } from './routes/auth.js';
import { products, categories, uploads } from './routes/products.js';
import { router as couponRoutes } from './routes/coupons.js';
import { router as agentRoutes } from './routes/agents.js';
import { router as orderRoutes } from './routes/orders.js';
import { wallets, customers } from './routes/wallets.js';
import { sessions, loginEvents } from './routes/activity.js';
import { analytics, dashboard } from './routes/reports.js';
import { resetDemoData } from './demo/seed.js';
import { router as settingsRoutes } from './settings.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  // Photos are shown by the frontend, which may live on another domain.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.clientOrigins, credentials: true }));
  app.use(cookieParser());
  app.use('/uploads', express.static(config.uploadDir, { maxAge: '30d', immutable: true }));
  app.use('/api', express.json({ limit: '200kb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true, store: store.kind, demoMode: config.demoMode }));
  app.use('/api/auth', authRoutes);

  // Everything below needs a signed-in admin.
  app.use('/api', requireAdmin);
  app.use('/api/products', products);
  app.use('/api/categories', categories);
  app.use('/api/uploads', uploads);
  app.use('/api/coupons', couponRoutes);
  app.use('/api/agents', agentRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/wallets', wallets);
  app.use('/api/customers', customers);
  app.use('/api/sessions', sessions);
  app.use('/api/login-events', loginEvents);
  app.use('/api/analytics', analytics);
  app.use('/api/dashboard', dashboard);
  app.use('/api/settings', settingsRoutes);

  // Demo only: wipe the admin panel's collections and load fresh demo data.
  app.post('/api/demo/reset', async (req, res) => {
    if (!config.demoMode) throw forbidden('Demo data can only be reset in demo mode.');
    await resetDemoData();
    clearSessionCookie(res);
    res.status(204).end();
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use(errorHandler);
  return app;
}
