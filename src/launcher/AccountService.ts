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
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface PendingMicrosoftAuth {
  clientId: string;
  deviceCode: string;
  expiresAt: number;
  interval: number;
}

export type MicrosoftPollResult =
  | { status: 'pending'; interval: number }
  | { status: 'slow_down'; interval: number }
  | { status: 'complete'; account: LauncherAccount }
  | { status: 'expired' }
  | { status: 'error'; message: string };

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
      throw new Error('Microsoft client ID missing. Use Offline account or set Credentials.');
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
      const text = await response.text();
      throw new Error(`Microsoft device login failed (${response.status}): ${text}`);
    }

    const payload = (await response.json()) as MicrosoftDeviceResponse;
    this.pendingMicrosoftAuth = {
      clientId,
      deviceCode: payload.device_code,
      expiresAt: Date.now() + payload.expires_in * 1000,
      interval: Math.max(5, payload.interval)
    };

    return {
      userCode: payload.user_code,
      verificationUri: payload.verification_uri,
      message: payload.message,
      expiresIn: payload.expires_in,
      interval: payload.interval
    };
  }

  /** Single non-blocking poll step — call from the renderer on an interval. */
  async microsoftPoll(): Promise<MicrosoftPollResult> {
    const pending = this.pendingMicrosoftAuth;
    if (!pending) {
      return { status: 'error', message: 'Start Microsoft login first.' };
    }

    if (Date.now() >= pending.expiresAt) {
      this.pendingMicrosoftAuth = undefined;
      return { status: 'expired' };
    }

    const token = await this.pollMicrosoftToken(pending);
    if (token.error === 'authorization_pending') {
      return { status: 'pending', interval: pending.interval * 1000 };
    }
    if (token.error === 'slow_down') {
      pending.interval = Math.min(pending.interval + 5, 60);
      return { status: 'slow_down', interval: pending.interval * 1000 };
    }
    if (token.error) {
      this.pendingMicrosoftAuth = undefined;
      return { status: 'error', message: token.error_description || token.error };
    }

    if (!token.access_token) {
      return { status: 'pending', interval: pending.interval * 1000 };
    }

    try {
      const account = await this.exchangeForMinecraftAccount(token);
      this.pendingMicrosoftAuth = undefined;
      await this.database.mutate((draft) => {
        draft.accounts = draft.accounts.filter((item) => item.uuid !== account.uuid).map((item) => ({ ...item, selected: false }));
        draft.accounts.push(account);
      });
      return { status: 'complete', account };
    } catch (error) {
      this.pendingMicrosoftAuth = undefined;
      return { status: 'error', message: error instanceof Error ? error.message : String(error) };
    }
  }

  async microsoftComplete(): Promise<LauncherAccount> {
    const result = await this.microsoftPoll();
    if (result.status === 'complete') {
      return result.account;
    }
    if (result.status === 'expired') {
      throw new Error('Microsoft login expired. Start a new login request.');
    }
    if (result.status === 'error') {
      throw new Error(result.message);
    }
    throw new Error('Sign in is still pending. Complete the browser step, then try again.');
  }

  async ensureValidSession(account: LauncherAccount): Promise<LauncherAccount> {
    if (account.kind !== 'microsoft') {
      return account;
    }

    const expiresAt = account.expiresAt ?? 0;
    if (account.accessToken && Date.now() < expiresAt - 60_000) {
      return account;
    }

    if (!account.refreshToken) {
      throw new Error('Microsoft session expired. Sign in again from Accounts.');
    }

    const { settings } = await this.database.read();
    const clientId = (settings.microsoftClientId || process.env.DAWN_MICROSOFT_CLIENT_ID || '').trim();
    if (!clientId) {
      throw new Error('Microsoft client ID missing. Use Offline account or set Credentials.');
    }

    const response = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: account.refreshToken,
        scope: 'XboxLive.signin offline_access'
      })
    });

    const payload = (await response.json()) as MicrosoftTokenResponse;
    if (!response.ok || !payload.access_token) {
      throw new Error(payload.error_description || payload.error || 'Failed to refresh Microsoft session.');
    }

    const refreshed = await this.exchangeForMinecraftAccount({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token ?? account.refreshToken,
      expires_in: payload.expires_in
    });

    const updated: LauncherAccount = { ...refreshed, id: account.id, selected: account.selected };
    await this.database.mutate((draft) => {
      const index = draft.accounts.findIndex((item) => item.id === account.id);
      if (index !== -1) {
        draft.accounts[index] = updated;
      }
    });

    return updated;
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

    return (await response.json()) as MicrosoftTokenResponse;
  }

  private async exchangeForMinecraftAccount(token: MicrosoftTokenResponse): Promise<LauncherAccount> {
    if (!token.access_token) {
      throw new Error('Microsoft did not return an access token.');
    }

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
      throw new Error('Xbox Live did not return a user hash. Enable Xbox Live on this Microsoft account.');
    }

    const minecraft = await this.postJson<{ access_token: string; expires_in: number }>(
      'https://api.minecraftservices.com/authentication/login_with_xbox',
      {
        identityToken: `XBL3.0 x=${uhs};${xsts.Token}`
      }
    );

    const entitlementsResponse = await fetch('https://api.minecraftservices.com/entitlements/mcstore', {
      headers: { Authorization: `Bearer ${minecraft.access_token}` }
    });
    if (!entitlementsResponse.ok) {
      throw new Error('Could not verify Minecraft ownership for this account.');
    }

    const entitlements = (await entitlementsResponse.json()) as {
      items?: Array<{ name?: string }>;
    };
    const ownsJava = entitlements.items?.some(
      (item) => item.name === 'product_minecraft' || item.name === 'game_minecraft'
    );
    if (!ownsJava) {
      throw new Error('This Microsoft account does not own Minecraft Java Edition.');
    }

    const profileResponse = await fetch('https://api.minecraftservices.com/minecraft/profile', {
      headers: { Authorization: `Bearer ${minecraft.access_token}` }
    });

    if (!profileResponse.ok) {
      throw new Error('No Minecraft Java profile found. Create one at minecraft.net first.');
    }

    const profile = (await profileResponse.json()) as { id: string; name: string };
    if (!profile.id || !profile.name) {
      throw new Error('Invalid Minecraft profile data received.');
    }

    return {
      id: randomUUID(),
      kind: 'microsoft',
      username: profile.name,
      uuid: profile.id,
      accessToken: minecraft.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + (token.expires_in ?? minecraft.expires_in) * 1000,
      avatarUrl: `https://crafatar.com/avatars/${profile.id}?overlay`,
      selected: true
    };
  }

  private async postJson<T>(url: string, body: unknown): Promise<T> {
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
        const error = JSON.parse(text) as { XErr?: number; error?: string; error_description?: string };
        if (error.XErr) {
          errorMsg = `Xbox error ${error.XErr}. Verify Xbox Live is enabled for this account.`;
        } else if (error.error) {
          errorMsg = error.error_description || error.error;
        }
      } catch {
        errorMsg = text || errorMsg;
      }
      throw new Error(errorMsg);
    }

    return (await response.json()) as T;
  }

  private offlineUuid(username: string): string {
    const hash = createHash('md5').update(`OfflinePlayer:${username}`).digest();
    hash[6] = (hash[6] & 0x0f) | 0x30;
    hash[8] = (hash[8] & 0x3f) | 0x80;
    const hex = hash.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
}
