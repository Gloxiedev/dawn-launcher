import { createHash, randomUUID } from 'node:crypto';
import type { DeviceCodeStart, LauncherAccount } from '@/types/launcher';
import { JsonDatabase } from './JsonDatabase';

interface MicrosoftDeviceResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message: string;
}

interface MicrosoftTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

interface PendingMicrosoftAuth {
  clientId: string;
  deviceCode: string;
  expiresAt: number;
  interval: number;
}

export class AccountService {
  private pendingMicrosoftAuth?: PendingMicrosoftAuth;

  constructor(private readonly database: JsonDatabase) {}

  async list(): Promise<LauncherAccount[]> {
    return (await this.database.read()).accounts;
  }

  async addOffline(username: string): Promise<LauncherAccount> {
    const cleanName = username.trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(cleanName)) {
      throw new Error('Offline usernames must be 3-16 characters and use letters, numbers, or underscores.');
    }

    const account: LauncherAccount = {
      id: randomUUID(),
      kind: 'offline',
      username: cleanName,
      uuid: this.offlineUuid(cleanName),
      selected: true
    };

    await this.database.mutate((draft) => {
      draft.accounts = draft.accounts.map((item) => ({ ...item, selected: false }));
      draft.accounts.push(account);
    });

    return account;
  }

  async remove(id: string): Promise<void> {
    await this.database.mutate((draft) => {
      draft.accounts = draft.accounts.filter((account) => account.id !== id);
      if (!draft.accounts.some((account) => account.selected) && draft.accounts[0]) {
        draft.accounts[0].selected = true;
      }
    });
  }

  async select(id: string): Promise<LauncherAccount[]> {
    return this.database.mutate((draft) => {
      draft.accounts = draft.accounts.map((account) => ({ ...account, selected: account.id === id }));
      return draft.accounts;
    });
  }

  async microsoftStart(): Promise<DeviceCodeStart> {
    const { settings } = await this.database.read();
    const clientId = (settings.microsoftClientId || process.env.DAWN_MICROSOFT_CLIENT_ID || '').trim();
    if (!clientId) {
      throw new Error('Add a Microsoft public client ID in Settings before signing in.');
    }

    const body = new URLSearchParams({
      client_id: clientId,
      scope: 'XboxLive.signin offline_access'
    });

    const response = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });

    if (!response.ok) {
      throw new Error(`Microsoft device login failed (${response.status}).`);
    }

    const payload = (await response.json()) as MicrosoftDeviceResponse;
    this.pendingMicrosoftAuth = {
      clientId,
      deviceCode: payload.device_code,
      expiresAt: Date.now() + payload.expires_in * 1000,
      interval: payload.interval
    };

    return {
      userCode: payload.user_code,
      verificationUri: payload.verification_uri,
      message: payload.message,
      expiresIn: payload.expires_in,
      interval: payload.interval
    };
  }

  async microsoftComplete(): Promise<LauncherAccount> {
    const pending = this.pendingMicrosoftAuth;
    if (!pending) {
      throw new Error('Start Microsoft login first.');
    }

    while (Date.now() < pending.expiresAt) {
      const token = await this.pollMicrosoftToken(pending);
      if (token.access_token) {
        const account = await this.exchangeForMinecraftAccount(token);
        this.pendingMicrosoftAuth = undefined;
        await this.database.mutate((draft) => {
          draft.accounts = draft.accounts.filter((item) => item.uuid !== account.uuid).map((item) => ({ ...item, selected: false }));
          draft.accounts.push(account);
        });
        return account;
      }

      await new Promise((resolve) => setTimeout(resolve, pending.interval * 1000));
    }

    this.pendingMicrosoftAuth = undefined;
    throw new Error('Microsoft login expired. Start a new login request.');
  }

  private async pollMicrosoftToken(pending: PendingMicrosoftAuth): Promise<MicrosoftTokenResponse> {
    const response = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: pending.clientId,
        device_code: pending.deviceCode
      })
    });

    const payload = (await response.json()) as MicrosoftTokenResponse;
    if (payload.error === 'authorization_pending') {
      return payload;
    }
    if (payload.error) {
      throw new Error(payload.error_description || payload.error);
    }

    return payload;
  }

  private async exchangeForMinecraftAccount(token: MicrosoftTokenResponse): Promise<LauncherAccount> {
    const xbl = await this.postJson<{ Token: string; DisplayClaims: { xui: { uhs: string }[] } }>(
      'https://user.auth.xboxlive.com/user/authenticate',
      {
        Properties: {
          AuthMethod: 'RPS',
          SiteName: 'user.auth.xboxlive.com',
          RpsTicket: `d=${token.access_token}`
        },
        RelyingParty: 'http://auth.xboxlive.com',
        TokenType: 'JWT'
      }
    );

    const xsts = await this.postJson<{ Token: string; DisplayClaims: { xui: { uhs: string }[] } }>(
      'https://xsts.auth.xboxlive.com/xsts/authorize',
      {
        Properties: {
          SandboxId: 'RETAIL',
          UserTokens: [xbl.Token]
        },
        RelyingParty: 'rp://api.minecraftservices.com/',
        TokenType: 'JWT'
      }
    );

    const uhs = xsts.DisplayClaims.xui[0]?.uhs;
    if (!uhs) {
      throw new Error('Xbox Live did not return a user hash for this account. The account may not have Xbox Live enabled.');
    }

    const minecraft = await this.postJson<{ access_token: string; expires_in: number }>(
      'https://api.minecraftservices.com/authentication/login_with_xbox',
      {
        identityToken: `XBL3.0 x=${uhs};${xsts.Token}`
      }
    );

    if (!minecraft.access_token) {
      throw new Error('Failed to obtain Minecraft access token. Please try signing in again.');
    }

    const entitlements = await fetch('https://api.minecraftservices.com/entitlements/mcstore', {
      headers: { Authorization: `Bearer ${minecraft.access_token}` }
    });
    if (!entitlements.ok) {
      throw new Error('This Microsoft account does not have Minecraft Java Edition. Ensure you own the game.');
    }

    const profileResponse = await fetch('https://api.minecraftservices.com/minecraft/profile', {
      headers: { Authorization: `Bearer ${minecraft.access_token}` }
    });

    if (!profileResponse.ok) {
      throw new Error('This Microsoft account does not have a Minecraft Java profile. You may need to create one first.');
    }

    const profile = (await profileResponse.json()) as { id: string; name: string };
    if (!profile.id || !profile.name) {
      throw new Error('Invalid Minecraft profile data received. Please try signing in again.');
    }

    return {
      id: randomUUID(),
      kind: 'microsoft',
      username: profile.name,
      uuid: profile.id,
      accessToken: minecraft.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + minecraft.expires_in * 1000,
      avatarUrl: `https://crafatar.com/avatars/${profile.id}?overlay`,
      selected: true
    };
  }

  private async postJson<T>(url: string, body: unknown): Promise<T> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const text = await response.text();
        let errorMsg = `Authentication request failed (${response.status}).`;
        try {
          const error = JSON.parse(text);
          if (error.XErr) {
            errorMsg = `Xbox error: ${error.XErr}. Check your Microsoft account status.`;
          } else if (error.error) {
            errorMsg = error.error_description || error.error;
          }
        } catch {
          errorMsg = text || errorMsg;
        }
        throw new Error(errorMsg);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Network error during authentication: ${String(error)}`);
    }
  }

  private offlineUuid(username: string): string {
    const hash = createHash('md5').update(`OfflinePlayer:${username}`).digest();
    hash[6] = (hash[6] & 0x0f) | 0x30;
    hash[8] = (hash[8] & 0x3f) | 0x80;
    const hex = hash.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
}
