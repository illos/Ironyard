import { Hono } from 'hono';

// Phase 0 scaffold. Real routes land in items 4 (intent envelopes), 5 (D1/Drizzle),
// 6 (magic-link auth), 7 (SessionDO + WebSocket), 8 (session snapshot for lobby).

const app = new Hono();

app.get('/api/health', (c) => c.json({ ok: true, service: 'ironyard-api', version: '0.0.0' }));

export default app;
