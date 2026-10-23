// Boxity Gems purchase webhook.
// Boxity POSTs { transactionId, userId, username, gameSlug, sku, productName, productPrice, metadata, timestamp }
// and refunds automatically unless we answer 2xx. The grant is stored by transactionId
// (idempotent) in the shared store and applied by whichever room / pod holds the buyer.

import express from 'express';
import { recordGrant } from '../game/profiles.js';

const listeners = new Set();
export function onGrantRecorded(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function legionWebhookRouter() {
  const router = express.Router();

  router.post('/legion', express.json({ limit: '32kb' }), async (req, res) => {
    const secret = process.env.LEGION_WEBHOOK_SECRET;
    if (secret && req.get('x-legion-webhook-secret') !== secret) {
      return res.status(401).json({ ok: false, error: 'bad_secret' });
    }

    const tx = req.body || {};
    if (!tx.transactionId || !tx.userId || !tx.sku) {
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    }

    const userId = String(tx.userId).startsWith('legion_') ? String(tx.userId) : `legion_${tx.userId}`;
    let fresh;
    try {
      fresh = await recordGrant({
        transactionId: String(tx.transactionId),
        userId,
        sku: String(tx.sku),
        productName: tx.productName,
        productPrice: tx.productPrice,
        metadata: tx.metadata ?? null,
        timestamp: tx.timestamp ?? Date.now(),
      });
    } catch (err) {
      // not stored: answer 5xx so Boxity retries instead of the player losing the purchase
      console.error('[webhook] could not store grant:', err.message);
      return res.status(503).json({ ok: false, error: 'store_unavailable' });
    }
    if (fresh) for (const fn of listeners) fn(userId);

    res.json({ ok: true, duplicate: !fresh });
  });

  return router;
}
