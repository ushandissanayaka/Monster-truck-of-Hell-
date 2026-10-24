// Reports per-player stats to the Boxity profile ("Only in this game").
// Values always come from server-owned profiles, never from client packets.

import { allProfiles } from './profiles.js';
import { boxity } from '../boxityEnv.js';

const DEFINITIONS = [
  { key: 'wins', label: 'Races Won', type: 'number', sortOrder: 1 },
  { key: 'level', label: 'Level', type: 'number', sortOrder: 2 },
  { key: 'finishes', label: 'Races Finished', type: 'number', sortOrder: 3 },
  { key: 'cash', label: 'Cash Earned', type: 'number', sortOrder: 4 },
  { key: 'trucks', label: 'Trucks', type: 'number', sortOrder: 5 },
];
const LIMIT = 1_000_000_000;

function valuesFor(p) {
  const raw = {
    wins: p.wins,
    level: p.level,
    finishes: p.finishes,
    cash: p.totalCash,
    trucks: p.trucks?.length || 1,
  };
  const values = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= LIMIT) values[k] = Math.floor(v);
  }
  return values;
}

async function flush() {
  const token = process.env.BLOXITY_REPORT_TOKEN;
  const gameId = process.env.BLOXITY_GAME_ID;
  if (!token || !gameId) return;
  const api = boxity.apiUrl;

  const players = allProfiles()
    .filter((p) => String(p.userId).startsWith('legion_'))
    .map((p) => ({ userId: String(p.userId).replace(/#m.*$/, ''), values: valuesFor(p) }))
    .filter((p) => Object.keys(p.values).length > 0);

  for (let i = 0; i < Math.max(players.length, 1); i += 200) {
    try {
      const res = await fetch(`${api}/v1/games/${gameId}/stats`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ definitions: DEFINITIONS, players: players.slice(i, i + 200) }),
        signal: AbortSignal.timeout(8000),
      });
      console.log('[stats]', res.status, await res.text());
    } catch (err) {
      console.warn('[stats] report failed:', err.message);
    }
  }
}

export function installStatReporter() {
  if (!process.env.BLOXITY_REPORT_TOKEN || !process.env.BLOXITY_GAME_ID) return { flush: async () => {} };
  const timer = setInterval(() => flush().catch(() => {}), 60_000);
  timer.unref();
  return { flush: () => flush().catch(() => {}) };
}
