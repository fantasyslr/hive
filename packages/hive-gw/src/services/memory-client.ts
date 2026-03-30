import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { logger } from '../config.js';

export interface ToolInfo {
  name: string;
  description: string;
  inputSchema: object;
}

export class MemoryClient {
  private client: Client;
  private transport: StreamableHTTPClientTransport | null = null;
  private connected = false;
  private url: string;
  private toolSchemas: Map<string, ToolInfo> = new Map();

  constructor(url = 'http://localhost:14242/mcp') {
    this.url = url;
    this.client = new Client({ name: 'hive-gw', version: '0.2.0' });
  }

  get isConnected(): boolean {
    return this.connected;
  }

  async ensureConnected(): Promise<void> {
    if (this.connected) return;
    try {
      this.transport = new StreamableHTTPClientTransport(new URL(this.url));
      await this.client.connect(this.transport);
      this.connected = true;
      logger.info({ url: this.url }, 'MemoryClient connected');
    } catch (err) {
      logger.error({ err, url: this.url }, 'MemoryClient connection failed');
      this.connected = false;
      throw err;
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.ensureConnected();
    try {
      const result = await this.client.callTool({ name, arguments: args });
      return result.content;
    } catch (err) {
      logger.error({ err, tool: name }, 'MemoryClient callTool failed');
      throw err;
    }
  }

  async listTools(): Promise<ToolInfo[]> {
    await this.ensureConnected();
    try {
      const { tools } = await this.client.listTools();
      const infos: ToolInfo[] = tools.map((t) => ({
        name: t.name,
        description: t.description ?? '',
        inputSchema: t.inputSchema,
      }));
      this.toolSchemas.clear();
      for (const info of infos) {
        this.toolSchemas.set(info.name, info);
      }
      logger.info({ count: infos.length }, 'MemoryClient tools discovered');
      return infos;
    } catch (err) {
      logger.error({ err }, 'MemoryClient listTools failed');
      throw err;
    }
  }

  getToolSchema(name: string): ToolInfo | undefined {
    return this.toolSchemas.get(name);
  }

  async close(): Promise<void> {
    if (!this.connected) return;
    try {
      await this.client.close();
      logger.info('MemoryClient disconnected');
    } catch (err) {
      logger.error({ err }, 'MemoryClient close failed');
    } finally {
      this.connected = false;
      this.transport = null;
    }
  }

  async reconnect(): Promise<void> {
    await this.close();
    // Create fresh client instance — old one cannot be reused after close
    this.client = new Client({ name: 'hive-gw', version: '0.2.0' });
    await this.ensureConnected();
    logger.info('MemoryClient reconnected');
  }
}

export const memoryClient = new MemoryClient(
  process.env.HIVE_MEMORY_URL || process.env.NOWLEDGE_MEM_URL || 'http://localhost:14242/mcp',
);
