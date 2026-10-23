import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import colyseus from 'colyseus';
import wsTransport from '@colyseus/ws-transport';

import { StartingPlaceRoom } from './rooms/StartingPlaceRoom.js';
import { legionWebhookRouter } from './webhooks/legionWebhook.js';
import { initStore, closeStore, refreshTop, topProfiles } from './game/profiles.js';
import { installStatReporter } from './game/statReporter.js';
import { ROOM_NAME } from './shared/gameData.js';

const { Server, matchMaker } = colyseus;
const { WebSocketTransport } = wsTransport;

const PORT = Number(process.env.PORT || 2567);

const app = express();
const origins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors(origins.length ? { origin: origins } : {}));

// Must answer fast: Boxity hosting probes it.
app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/leaderboards', (_req, res) => {
  res.json({ wins: topProfiles('wins'), level: topProfiles('level') });
});

// Public room list for Boxity "Open Rooms" when hosted outside Boxity.
app.get('/rooms', async (_req, res) => {
  const rooms = await matchMaker.query({ name: ROOM_NAME });
  res.json({
    rooms: rooms.map((r) => ({
      id: r.roomId,
      region: process.env.REGION || 'local',
      type: r.private ? 'private' : 'public',
      players: r.clients,
      maxPlayers: r.maxClients,
      locked: r.locked,
    })),
    onlineServers: [],
  });
});

app.use('/webhooks', legionWebhookRouter());

const server = http.createServer(app);
const gameServer = new Server({ transport: new WebSocketTransport({ server }) });
gameServer.define(ROOM_NAME, StartingPlaceRoom);

const stats = installStatReporter();

// the save store (MongoDB on Boxity hosting) must be ready before players join
await initStore();
await refreshTop();
gameServer.listen(PORT).then(() => {
  console.log(`[server] Monster Truck of Hell listening on :${PORT} (room "${ROOM_NAME}")`);
});

async function shutdown() {
  console.log('[server] shutting down');
  await gameServer.gracefullyShutdown(false).catch(() => {}); // players leave -> their saves are written
  await closeStore();
  await stats.flush();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
