import type { P2PResponse } from '@hive/shared';

export interface ForwardRequest {
  fromAgentId: string;
  toAgentId: string;
  endpoint: string; // target agent's HTTP endpoint
  payload: Record<string, unknown>;
  timeoutMs: number;
}

/**
 * Forward a P2P request to the target agent's endpoint.
 *
 * Convention: POST {agent.endpoint}/p2p with JSON body:
 *   { fromAgentId, payload }
 *
 * The target agent responds with arbitrary JSON which is relayed back.
 * If the target is unreachable or times out, an error P2PResponse is returned.
 */
export async function forwardP2PRequest(req: ForwardRequest): Promise<P2PResponse> {
  const start = Date.now();
  const targetUrl = `${req.endpoint.replace(/\/$/, '')}/p2p`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs);

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromAgentId: req.fromAgentId,
        payload: req.payload,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const latencyMs = Date.now() - start;

    if (!response.ok) {
      return {
        fromAgentId: req.fromAgentId,
        toAgentId: req.toAgentId,
        status: 'error',
        error: `Target agent responded with HTTP ${response.status}`,
        latencyMs,
      };
    }

    const body = await response.json();

    return {
      fromAgentId: req.fromAgentId,
      toAgentId: req.toAgentId,
      status: 'delivered',
      response: body,
      latencyMs,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? `Request to ${req.toAgentId} timed out after ${req.timeoutMs}ms`
          : err.message
        : 'Unknown error';

    return {
      fromAgentId: req.fromAgentId,
      toAgentId: req.toAgentId,
      status: 'error',
      error: message,
      latencyMs,
    };
  }
}
