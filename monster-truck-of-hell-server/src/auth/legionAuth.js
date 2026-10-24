// Verifies a Boxity (Legion) player token on the server.
// POST {BLOXITY_API_URL}/v1/auth/game-token/verify  -> { valid, user, carriedFrom? }

import { createHash } from 'node:crypto';
import { boxity } from '../boxityEnv.js';

const GAME_SLUG = process.env.GAME_SLUG || 'monster-truck-of-hell';

const cache = new Map(); // token -> { result, at }
const CACHE_MS = 60_000;

export async function verifyLegionToken(token) {
  if (!token || typeof token !== 'string') return null;

  const hit = cache.get(token);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;

  try {
    const res = await fetch(`${boxity.apiUrl}/v1/auth/game-token/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameSlug: GAME_SLUG }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.valid || !data.user?._id) return null;

    const result = {
      userId: `legion_${data.user._id}`,
      username: data.user.username,
      displayName: data.user.displayName || data.user.username,
      carriedFrom: Array.isArray(data.carriedFrom) ? data.carriedFrom : [],
    };
    cache.set(token, { result, at: Date.now() });
    return result;
  } catch (err) {
    console.warn('[auth] token verify failed:', err.message);
    return null;
  }
}

// A signed-out browser sends a secret guestKey it keeps in localStorage; its progress is saved under
// a hash of that key, so the same browser gets it back next time (and the key never leaves the server).
export function guestIdFor(guestKey) {
  const key = typeof guestKey === 'string' ? guestKey : '';
  if (!/^[A-Za-z0-9-]{16,64}$/.test(key)) return null;
  return `guest_${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
}

// Called from Room.onAuth. Guests are allowed (and seen by everyone like any player): with a guestKey
// their progress is kept, without one they get a session-only id.
export async function authenticateClient(client, options = {}) {
  const localGuestId = guestIdFor(options.guestKey);
  const verified = await verifyLegionToken(options.token);
  if (verified) return { ...verified, localGuestId, guest: false };

  const guestName = String(options.guestName || '').trim().slice(0, 20) || `Guest${Math.floor(1000 + Math.random() * 9000)}`;
  return {
    userId: localGuestId || `temp_${client.sessionId}`,
    username: guestName,
    displayName: guestName,
    carriedFrom: [],
    guest: true,
  };
}
