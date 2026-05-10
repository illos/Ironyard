import { Hono } from 'hono';
import { authRoutes } from './auth/routes';
import type { AppEnv } from './types';

const app = new Hono<AppEnv>();

app.get('/api/health', (c) => c.json({ ok: true, service: 'ironyard-api', version: '0.0.0' }));

app.route('/api/auth', authRoutes);

export default app;
