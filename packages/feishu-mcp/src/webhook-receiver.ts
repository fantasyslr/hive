import { createDecipheriv, createHash } from 'node:crypto';
import type { FeishuChangeEvent } from '@hive/shared';

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

interface ChallengeBody {
  challenge: string;
  token: string;
  type: 'url_verification';
}

interface EventBody {
  header: {
    event_id: string;
    event_type: string;
    token: string;
    create_time?: string;
  };
  event: Record<string, unknown>;
}

interface EncryptedBody {
  encrypt: string;
}

export type WebhookParseResult =
  | { type: 'challenge'; challenge: string }
  | { type: 'event'; event: FeishuChangeEvent };

export interface WebhookReceiverConfig {
  verifyToken: string;
  encryptKey?: string;
}

export class FeishuWebhookReceiver {
  private readonly verifyToken: string;
  private readonly encryptKey?: string;

  constructor(config: WebhookReceiverConfig) {
    this.verifyToken = config.verifyToken;
    this.encryptKey = config.encryptKey;
  }

  parseEvent(body: unknown): WebhookParseResult {
    let parsed = body as Record<string, unknown>;

    // Handle encrypted body
    if (this.encryptKey && typeof (parsed as unknown as EncryptedBody).encrypt === 'string') {
      const decrypted = this.decrypt((parsed as unknown as EncryptedBody).encrypt);
      parsed = JSON.parse(decrypted) as Record<string, unknown>;
    }

    // Challenge verification
    if (parsed.type === 'url_verification') {
      const challenge = parsed as unknown as ChallengeBody;
      if (challenge.token !== this.verifyToken) {
        throw new WebhookVerificationError('Invalid verification token in challenge');
      }
      return { type: 'challenge', challenge: challenge.challenge };
    }

    // Event callback
    const eventBody = parsed as unknown as EventBody;
    if (eventBody.header?.event_type) {
      if (eventBody.header.token !== this.verifyToken) {
        throw new WebhookVerificationError('Invalid verification token in event');
      }

      const event: FeishuChangeEvent = {
        event_type: eventBody.header.event_type,
        app_token: eventBody.event.app_token as string | undefined,
        table_id: eventBody.event.table_id as string | undefined,
        document_id: eventBody.event.document_id as string | undefined,
        action: eventBody.event.action as string | undefined,
        operator_id: eventBody.event.operator_id as string | undefined,
        timestamp: eventBody.header.create_time ?? new Date().toISOString(),
      };

      return { type: 'event', event };
    }

    throw new WebhookVerificationError('Unrecognized webhook body format');
  }

  /**
   * Decrypt Feishu encrypted event body using AES-256-CBC.
   * Key derivation: SHA-256 of encryptKey.
   * IV: first 16 bytes of the base64-decoded ciphertext.
   */
  private decrypt(encrypted: string): string {
    const key = createHash('sha256').update(this.encryptKey!).digest();
    const buf = Buffer.from(encrypted, 'base64');
    const iv = buf.subarray(0, 16);
    const ciphertext = buf.subarray(16);
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(ciphertext, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
