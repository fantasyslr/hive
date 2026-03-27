export interface FeishuAuthConfig {
  appId: string;
  appSecret: string;
}

const TOKEN_URL = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal';
const REFRESH_BUFFER_MS = 300_000; // 5 minutes before expiry

export class FeishuAuth {
  private readonly appId: string;
  private readonly appSecret: string;
  private cachedToken: string | null = null;
  private expiresAt = 0;

  constructor(config: FeishuAuthConfig) {
    this.appId = config.appId;
    this.appSecret = config.appSecret;
  }

  async getToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.expiresAt - REFRESH_BUFFER_MS) {
      return this.cachedToken;
    }

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: this.appId, app_secret: this.appSecret }),
    });

    const data = await res.json() as {
      code: number;
      msg: string;
      tenant_access_token: string;
      expire: number;
    };

    if (data.code !== 0) {
      throw new Error(`Feishu auth failed: [${data.code}] ${data.msg}`);
    }

    this.cachedToken = data.tenant_access_token;
    this.expiresAt = Date.now() + data.expire * 1000;
    return this.cachedToken;
  }
}
