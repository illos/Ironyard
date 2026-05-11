import { Hono } from 'hono';
import { authRoutes } from './auth/routes';
import { campaignRoutes } from './campaigns/routes';
import { characterRoutes } from './characters/routes';
import type { AppEnv } from './types';

const app = new Hono<AppEnv>();

app.get('/api/health', (c) => c.json({ ok: true, service: 'ironyard-api', version: '0.0.0' }));

app.route('/api/auth', authRoutes);
app.route('/api/campaigns', campaignRoutes);
app.route('/api/characters', characterRoutes);

export default app;

// LobbyDO is bound by wrangler.toml. Phase 1 will add other DOs (analytics,
// rate-limiter) if we need them.
export { LobbyDO } from './lobby-do';
