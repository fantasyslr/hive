import { Router } from 'express';
import type { EventBus } from '../services/event-bus.js';
import { logger } from '../config.js';

interface ChallengeBody {
  type: 'url_verification';
  token: string;
  challenge: string;
}

interface EventCallbackBody {
  header: {
    event_id: string;
    event_type: string;
    token: string;
    create_time?: string;
  };
  event: Record<string, unknown>;
}

/**
 * Create a Feishu webhook router.
 * Returns null if FEISHU_WEBHOOK_VERIFY_TOKEN is not set.
 */
export function createFeishuWebhookRouter(eventBus: EventBus): Router | null {
  const verifyToken = process.env.FEISHU_WEBHOOK_VERIFY_TOKEN;

  if (!verifyToken) {
    logger.warn('FEISHU_WEBHOOK_VERIFY_TOKEN not set — Feishu webhook route disabled');
    return null;
  }

  const router = Router();

  router.post('/', (req, res) => {
    const body = req.body as Record<string, unknown>;

    // Challenge verification (Feishu URL verification handshake)
    if (body.type === 'url_verification') {
      const challenge = body as unknown as ChallengeBody;
      if (challenge.token !== verifyToken) {
        logger.warn('Feishu webhook challenge: invalid token');
        res.status(403).json({ error: 'Invalid verification token' });
        return;
      }
      logger.info('Feishu webhook challenge verified');
      res.json({ challenge: challenge.challenge });
      return;
    }

    // Event callback
    const eventBody = body as unknown as EventCallbackBody;
    if (eventBody.header?.event_type) {
      if (eventBody.header.token !== verifyToken) {
        logger.warn('Feishu webhook event: invalid token');
        res.status(403).json({ error: 'Invalid verification token' });
        return;
      }

      // Respond immediately (Feishu requires < 3s)
      res.json({ ok: true });

      // Emit to EventBus asynchronously
      eventBus.emit({
        type: 'feishu.changed',
        data: {
          event_type: eventBody.header.event_type,
          event_id: eventBody.header.event_id,
          app_token: eventBody.event.app_token,
          table_id: eventBody.event.table_id,
          document_id: eventBody.event.document_id,
          action: eventBody.event.action,
          operator_id: eventBody.event.operator_id,
        },
      });

      logger.info({ event_type: eventBody.header.event_type }, 'Feishu webhook event forwarded');
      return;
    }

    // Unrecognized body
    logger.warn({ body }, 'Feishu webhook: unrecognized body format');
    res.status(400).json({ error: 'Unrecognized webhook body' });
  });

  logger.info('Feishu webhook route enabled');
  return router;
}
