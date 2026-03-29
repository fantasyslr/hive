import { Router } from 'express';
import type { EventBus } from '../services/event-bus.js';
import { FeishuWebhookReceiver, WebhookVerificationError } from '@hive/feishu-mcp/webhook-receiver';
import { logger } from '../config.js';

/**
 * Create a Feishu webhook router using FeishuWebhookReceiver for unified
 * token verification and AES-256-CBC encrypted event decryption.
 * Returns null if FEISHU_WEBHOOK_VERIFY_TOKEN is not set.
 */
export function createFeishuWebhookRouter(eventBus: EventBus): Router | null {
  const verifyToken = process.env.FEISHU_WEBHOOK_VERIFY_TOKEN;

  if (!verifyToken) {
    logger.warn('FEISHU_WEBHOOK_VERIFY_TOKEN not set — Feishu webhook route disabled');
    return null;
  }

  const receiver = new FeishuWebhookReceiver({
    verifyToken,
    encryptKey: process.env.FEISHU_ENCRYPT_KEY,
  });

  const router = Router();

  router.post('/', (req, res) => {
    try {
      const result = receiver.parseEvent(req.body);

      if (result.type === 'challenge') {
        logger.info('Feishu webhook challenge verified');
        res.json({ challenge: result.challenge });
        return;
      }

      // Respond immediately (Feishu requires < 3s)
      res.json({ ok: true });

      // Emit to EventBus asynchronously
      eventBus.emit({
        type: 'feishu.changed',
        data: { ...result.event },
      });

      logger.info({ event_type: result.event.event_type }, 'Feishu webhook event forwarded');
    } catch (err) {
      if (err instanceof WebhookVerificationError) {
        logger.warn({ err: err.message }, 'Feishu webhook verification failed');
        res.status(403).json({ error: err.message });
        return;
      }
      logger.error({ err }, 'Feishu webhook processing error');
      res.status(400).json({ error: 'Invalid webhook body' });
    }
  });

  logger.info('Feishu webhook route enabled');
  return router;
}
