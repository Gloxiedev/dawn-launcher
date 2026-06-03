import { execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { nanoid } from 'nanoid';
import type { ConsoleEvent, Instance, LaunchHistoryEntry, LaunchRequest, LaunchResult, LauncherAccount, ProcessState } from '@/types/launcher';
import { AccountService } from '@/launcher/AccountService';
import { friendlyErrorMessage } from '@/launcher/errors';
import { JsonDatabase } from '@/launcher/JsonDatabase';
import { InstanceService } from '@/launcher/InstanceService';
import { validateInstanceBeforeLaunch } from '@/launcher/InstanceValidation';
import { JavaService } from '@/launcher/JavaService';
import type { Logger } from '@/launcher/Logger';
import { GameProcessLauncher } from './launch/GameProcessLauncher';
import { LoaderService } from './LoaderService';
import { VersionService } from './VersionService';

const execFileAsync = promisify(execFile);

const MAX_HISTORY_ENTRIES = 500;
const CREATE_LAUNCH_PLAN_TIMEOUT_MS = 15 * 60_000;

interface InstanceSession {
  child?: ChildProcess;
  state: ProcessState;
  abort: AbortController;
  historyId?: string;
  launchedAt?: number;
}

export type ProcessStateListener = (instanceId: string, state: ProcessState) => void;

export class MinecraftService {
  private readonly sessions = new Map<string, InstanceSession>();
  private readonly processLauncher = new GameProcessLauncher();

  constructor(
    private readonly database: JsonDatabase,
    private readonly versions: VersionService,
    private readonly loaders: LoaderService,
    private readonly java: JavaService,
    private readonly instances: InstanceService,
    private readonly accounts: AccountService,
    private readonly onConsole: (event: ConsoleEvent) => void,
    private readonly onProcessState: ProcessStateListener,
    private readonly logger?: Logger
  ) {}

  listVersions(): Promise<string[]> {
    return this.versions.listVersions();
  }

  listVersionCatalog() {
    return this.versions.listVersionCatalog();
  }

  scanJava() {
    return this.database.read().then(({ settings }) => this.java.scan(settings));
  }

  getProcessState(instanceId: string): ProcessState {
    return this.sessions.get(instanceId)?.state ?? 'idle';
  }

  getProcessStates(): Record<string, ProcessState> {
    const states: Record<string, ProcessState> = {};
    for (const [instanceId, session] of this.sessions) {
      states[instanceId] = session.state;
    }
    return states;
  }

  async installLoader(instanceId: string): Promise<Instance> {
    const data = await this.database.read();
    const instance = data.instances.find((item) => item.id === instanceId);
    if (!instance) {
      throw new Error('Instance not found.');
    }
    return this.loaders.install(instance, data.settings);
  }

  async listHistory(): Promise<LaunchHistoryEntry[]> {
    const data = await this.database.read();
    return [...(data.launchHistory ?? [])].reverse();
  }

  async clearHistory(): Promise<void> {
    await this.database.mutate((draft) => {
      draft.launchHistory = [];
    });
  }

  async launch(input: LaunchRequest): Promise<LaunchResult> {
    const existing = this.sessions.get(input.instanceId);
    if (existing && ['preparing', 'downloading', 'launching', 'running'].includes(existing.state)) {
      throw new Error('This instance is already launching or running.');
    }

    const abort = new AbortController();
    const launchedAt = Date.now();
    const historyId = nanoid();
    const launchTimeout = setTimeout(() => {
      abort.abort();
    }, 600000);

    this.sessions.set(input.instanceId, { state: 'preparing', abort, historyId, launchedAt });

    try {
      const stageTimers = new Map<string, number>();
      const startStage = (name: string) => {
        stageTimers.set(name, Date.now());
      };
      const endStage = (name: string) => {
        const started = stageTimers.get(name);
        if (!started) return;
        this.emit(input.instanceId, 'debug', `${name}: ${Date.now() - started}ms`);
      };
      const stage = async <T>(name: string, action: () => Promise<T>): Promise<T> => {
        startStage(name);
        try {
          return await action();
        } finally {
          endStage(name);
        }
      };

      const data = await this.database.read();
      let instance = data.instances.find((item) => item.id === input.instanceId);
      let account = data.accounts.find((item) => item.id === input.accountId);
      if (!instance) {
        throw new Error('Instance not found.');
      }
      if (!account) {
        throw new Error('Select an account before launching.');
      }

      this.assertNotAborted(input.instanceId);
      this.setState(input.instanceId, 'preparing');
      this.emit(input.instanceId, 'info', 'Validating instance');

      if (account.kind === 'microsoft') {
        account = await this.accounts.ensureValidSession(account);
      }

      const validationIssues = await stage('Validate Instance', async () => validateInstanceBeforeLaunch(instance!));
      for (const issue of validationIssues) {
        this.emit(input.instanceId, issue.level, issue.message);
        if (issue.level === 'error') {
          throw new Error(issue.message);
        }
      }

      this.assertNotAborted(input.instanceId);

      if (instance.loader !== 'vanilla' && !instance.launchVersionId) {
        this.emit(input.instanceId, 'info', `Installing ${instance.loader} loader`);
        instance = await stage('Install Loader', async () => this.loaders.install(instance!, data.settings));
      }

      if (!instance.launchVersionId && instance.loader !== 'vanilla') {
        throw new Error(`Failed to install ${instance.loader} loader. Please try again or use vanilla Minecraft.`);
      }

      await stage('Prepare Instance Roots', async () => this.instances.ensureRoots(data.settings));
      this.emit(input.instanceId, 'info', 'Preparing instance');

      const gameVersion = await stage('Resolve Version Alias', async () => this.versions.resolveAlias(instance!.gameVersion));
      const versionId = instance.launchVersionId || gameVersion;
      const requiredJavaMajor = await stage('Resolve Required Java', async () =>
        this.java.requiredMajorForVersion(await this.versions.resolveAlias(versionId))
      );

      this.setState(input.instanceId, 'downloading');
      this.emit(input.instanceId, 'info', 'Downloading and verifying game files');

      const runtime = await stage('Select Java Runtime', async () => {
        if (instance!.javaPath) {
          const custom = await this.java.inspect(instance!.javaPath);
          if (custom?.valid && custom.major === requiredJavaMajor) {
            return custom;
          }
          if (custom?.valid) {
            this.emit(
              input.instanceId,
              'warn',
              `Instance Java ${custom.major} ignored; Minecraft ${gameVersion} needs Java ${requiredJavaMajor}.`
            );
          }
        }
        return this.java.pick(data.settings, gameVersion, requiredJavaMajor);
      });

      if (!runtime?.path) {
        throw new Error(`No compatible Java runtime found. Required: Java ${requiredJavaMajor || '8+'}`);
      }
      if (runtime.major !== requiredJavaMajor) {
        throw new Error(
          `Java ${requiredJavaMajor} is required for Minecraft ${gameVersion}, but Java ${runtime.major} was selected at ${runtime.path}.`
        );
      }

      this.assertNotAborted(input.instanceId);
      this.setState(input.instanceId, 'launching');

      this.emit(input.instanceId, 'info', `Using Java ${runtime.major} at ${runtime.path}`);
      this.emit(input.instanceId, 'debug', `Java version: ${runtime.version}`);
      this.emit(input.instanceId, 'debug', 'Creating launch plan (downloading game files)...');

      let plan: any;
      const launchPlanAbort = new AbortController();
      try {
        console.log(`[MinecraftService] Starting createLaunchPlan for version ${versionId}`);
        plan = await stage('Create Launch Plan', async () => {
          if (abort.signal.aborted) {
            launchPlanAbort.abort(new Error('Launch cancelled'));
          }
          const detachAbortLink = this.linkAbortSignal(abort.signal, launchPlanAbort);
          try {
            return await this.withTimeout(
              this.versions.createLaunchPlan({
              versionId,
              instance,
              account: this.normalizeAccount(account),
              java: runtime,
              settings: data.settings,
                onStage: (message) => this.emit(input.instanceId, 'info', message),
                signal: launchPlanAbort.signal
              }),
              CREATE_LAUNCH_PLAN_TIMEOUT_MS,
              `Launch plan timed out after ${Math.round(CREATE_LAUNCH_PLAN_TIMEOUT_MS / 60000)} minutes (version: ${versionId})`,
              () => launchPlanAbort.abort(new Error(`Launch plan timed out after ${Math.round(CREATE_LAUNCH_PLAN_TIMEOUT_MS / 60000)} minutes`))
            );
          } finally {
            detachAbortLink();
          }
        });
        console.log(`[MinecraftService] Successfully created launch plan`);
      } catch (error) {
        console.error(`[MinecraftService] createLaunchPlan failed:`, error);
        const message = error instanceof Error ? error.message : String(error);
        this.emit(input.instanceId, 'error', `Failed to create launch plan: ${message}`);
        throw error;
      }

      this.assertNotAborted(input.instanceId);
      this.emit(input.instanceId, 'info', `Launching ${plan.version.id}`);
      this.emit(input.instanceId, 'debug', `Game directory: ${plan.gameDir}`);
      this.emit(input.instanceId, 'info', 'Spawning Minecraft process...');
      this.emit(input.instanceId, 'debug', `Command: ${plan.javaPath} ${plan.args.join(' ')}`);

      let child: ChildProcess;
      try {
        child = await stage('Spawn Minecraft Process', async () => this.processLauncher.spawn(plan));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('ENOENT')) {
          this.emit(input.instanceId, 'error', `Java executable not found at: ${plan.javaPath}`);
        } else {
          this.emit(input.instanceId, 'error', `Failed to start Minecraft: ${message}`);
        }
        throw error;
      }

      if (!child.pid) {
        throw new Error('Failed to start process (no PID)');
      }

      const session = this.sessions.get(input.instanceId);
      if (session) {
        session.child = child;
      }

      child.stdout?.on('data', (chunk: Buffer) => this.emit(instance!.id, 'info', chunk.toString().trimEnd()));
      child.stderr?.on('data', (chunk: Buffer) => this.emit(instance!.id, 'warn', chunk.toString().trimEnd()));
      child.on('error', (error) => this.emit(instance!.id, 'error', error.message));
      child.on('exit', (code) => {
        const exitedAt = Date.now();
        const durationMs = exitedAt - launchedAt;
        this.sessions.delete(instance!.id);
        const state: ProcessState = code === 0 ? 'exited' : 'crashed';
        this.setState(instance!.id, state);
        this.emit(instance!.id, state === 'crashed' ? 'error' : 'info', `Minecraft ${state} with code ${code ?? 'unknown'}`);
        void this.logger?.info('launch', `Process ${state}`, { instanceId: instance!.id, code });
        void this.finalizeHistory(historyId, instance!.id, exitedAt, durationMs, code, state === 'exited' ? 'exited' : 'crashed');
        setTimeout(() => {
          if (!this.sessions.has(instance!.id)) {
            this.setState(instance!.id, 'idle');
          }
        }, 1500);
      });

      try {
        await stage('Wait For Process Spawn', async () => {
          await this.processLauncher.waitForSpawn(child);
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.emit(input.instanceId, 'error', `Process failed to start: ${message}`);
        throw error;
      }

      this.assertNotAborted(input.instanceId);
      this.setState(input.instanceId, 'running');
      this.emit(input.instanceId, 'info', `Minecraft is running (PID ${child.pid})`);

      void this.instances.markPlayed(instance.id);
      void this.logger?.info('launch', `Started ${instance.name}`, { pid: child.pid, versionId });
      void this.appendHistory({
        id: historyId,
        instanceId: instance.id,
        instanceName: instance.name,
        gameVersion: instance.gameVersion,
        loader: instance.loader,
        accountId: account.id,
        accountUsername: account.username,
        launchedAt,
        state: 'running'
      });

      return {
        pid: child.pid ?? 0,
        instanceId: instance.id,
        state: 'running'
      };
    } catch (error) {
      clearTimeout(launchTimeout);
      const aborted =
        error instanceof Error &&
        (error.name === 'AbortError' || this.sessions.get(input.instanceId)?.abort.signal.aborted);
      if (aborted) {
        const exitedAt = Date.now();
        const durationMs = exitedAt - launchedAt;
        this.setState(input.instanceId, 'stopped');
        void this.finalizeHistory(historyId, input.instanceId, exitedAt, durationMs, null, 'stopped');
        setTimeout(() => this.setState(input.instanceId, 'idle'), 1000);
        return { pid: 0, instanceId: input.instanceId, state: 'stopped' };
      }

      const message = friendlyErrorMessage(error);
      this.sessions.delete(input.instanceId);
      this.setState(input.instanceId, 'idle');
      this.emit(input.instanceId, 'error', message);
      await this.logger?.error('launch', message, { instanceId: input.instanceId });
      throw new Error(message);
    } finally {
      clearTimeout(launchTimeout);
    }
  }

  async stop(instanceId: string): Promise<void> {
    const session = this.sessions.get(instanceId);
    if (!session) {
      this.setState(instanceId, 'idle');
      return;
    }

    this.setState(instanceId, 'stopping');
    this.emit(instanceId, 'info', 'Stopping Minecraft');
    session.abort.abort();

    if (session.child?.pid) {
      await killProcessTree(session.child).catch((error) => {
        void this.logger?.warn('launch', 'Failed to kill process tree', {
          instanceId,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    }

    this.sessions.delete(instanceId);
    this.setState(instanceId, 'stopped');
    this.emit(instanceId, 'info', 'Minecraft stopped');
    await this.logger?.info('launch', 'Stopped by user', { instanceId });

    setTimeout(() => {
      if (!this.sessions.has(instanceId)) {
        this.setState(instanceId, 'idle');
      }
    }, 1000);
  }

  private async appendHistory(entry: LaunchHistoryEntry): Promise<void> {
    await this.database.mutate((draft) => {
      if (!draft.launchHistory) draft.launchHistory = [];
      draft.launchHistory.push(entry);
      if (draft.launchHistory.length > MAX_HISTORY_ENTRIES) {
        draft.launchHistory = draft.launchHistory.slice(-MAX_HISTORY_ENTRIES);
      }
      const inst = draft.instances.find((i) => i.id === entry.instanceId);
      if (inst) {
        inst.launchCount = (inst.launchCount ?? 0) + 1;
      }
    });
  }

  private async finalizeHistory(
    historyId: string,
    instanceId: string,
    exitedAt: number,
    durationMs: number,
    exitCode: number | null | undefined,
    state: LaunchHistoryEntry['state']
  ): Promise<void> {
    await this.database.mutate((draft) => {
      if (!draft.launchHistory) return;
      const entry = draft.launchHistory.find((h) => h.id === historyId);
      if (entry) {
        entry.exitedAt = exitedAt;
        entry.durationMs = durationMs;
        entry.exitCode = exitCode ?? null;
        entry.state = state;
      }
      const inst = draft.instances.find((i) => i.id === instanceId);
      if (inst) {
        inst.totalPlayTimeMs = (inst.totalPlayTimeMs ?? 0) + durationMs;
      }
    });
  }

  private normalizeAccount(account: LauncherAccount): LauncherAccount {
    if (account.kind === 'offline') {
      return {
        ...account,
        accessToken: '0'
      };
    }
    if (!account.accessToken) {
      throw new Error('Microsoft session is missing an access token. Sign in again.');
    }
    return account;
  }

  private assertNotAborted(instanceId: string): void {
    if (this.sessions.get(instanceId)?.abort.signal.aborted) {
      const error = new Error('Launch cancelled');
      error.name = 'AbortError';
      throw error;
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string, onTimeout?: () => void): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_resolve, reject) => {
          timeout = setTimeout(() => {
            onTimeout?.();
            reject(new Error(message));
          }, timeoutMs);
        })
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private linkAbortSignal(parent: AbortSignal, child: AbortController): () => void {
    if (parent.aborted) {
      child.abort(parent.reason);
      return () => undefined;
    }
    const onAbort = () => child.abort(parent.reason);
    parent.addEventListener('abort', onAbort, { once: true });
    return () => parent.removeEventListener('abort', onAbort);
  }

  private setState(instanceId: string, state: ProcessState): void {
    const session = this.sessions.get(instanceId);
    if (session) {
      session.state = state;
    }
    this.onProcessState(instanceId, state);
  }

  private emit(instanceId: string, level: ConsoleEvent['level'], message: string): void {
    for (const line of message.split(/\r?\n/).filter(Boolean)) {
      this.onConsole({
        instanceId,
        level,
        message: line,
        time: Date.now()
      });
    }
  }
}

async function killProcessTree(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (!pid) {
    child.kill('SIGKILL');
    return;
  }

  if (process.platform === 'win32') {
    await execFileAsync('taskkill', ['/pid', String(pid), '/T', '/F']);
    return;
  }

  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }

  await new Promise((resolve) => setTimeout(resolve, 1500));

  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
}
