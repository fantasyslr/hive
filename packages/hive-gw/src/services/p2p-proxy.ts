import type { P2PResponse } from '@hive/shared';

export interface ForwardRequest {
  from_agent_id: string;
  to_agent_id: string;
  endpoint: string; // target agent's HTTP endpoint
  payload: Record<string, unknown>;
  timeout_ms: number;
}

/**
 * Forward a P2P request to the target agent's endpoint.
 *
 * Convention: POST {agent.endpoint}/p2p with JSON body:
 *   { from_agent_id, payload }
 *
 * The target agent responds with arbitrary JSON which is relayed back.
 * If the target is unreachable or times out, an error P2PResponse is returned.
 */
export async function forwardP2PRequest(req: ForwardRequest): Promise<P2PResponse> {
  const start = Date.now();
  const targetUrl = `${req.endpoint.replace(/\/$/, '')}/p2p`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeout_ms);

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_agent_id: req.from_agent_id,
        payload: req.payload,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const latency_ms = Date.now() - start;

    if (!response.ok) {
      return {
        from_agent_id: req.from_agent_id,
        to_agent_id: req.to_agent_id,
        status: 'error',
        error: `Target agent responded with HTTP ${response.status}`,
        latency_ms,
      };
    }

    const body = await response.json();

    return {
      from_agent_id: req.from_agent_id,
      to_agent_id: req.to_agent_id,
      status: 'delivered',
      response: body,
      latency_ms,
    };
  } catch (err: unknown) {
    const latency_ms = Date.now() - start;
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? `Request to ${req.to_agent_id} timed out after ${req.timeout_ms}ms`
          : err.message
        : 'Unknown error';

    return {
      from_agent_id: req.from_agent_id,
      to_agent_id: req.to_agent_id,
      status: 'error',
      error: message,
      latency_ms,
    };
  }
}
