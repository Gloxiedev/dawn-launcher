import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import type { ConsoleEvent, Instance, LaunchRequest, LaunchResult, LauncherAccount, ProcessState } from '@/types/launcher';
import { AccountService } from '@/launcher/AccountService';
import { friendlyErrorMessage } from '@/launcher/errors';
import { JsonDatabase } from '@/launcher/JsonDatabase';
import { InstanceService } from '@/launcher/InstanceService';
import { validateInstanceBeforeLaunch } from '@/launcher/InstanceValidation';
import { JavaService } from '@/launcher/JavaService';
import type { Logger } from '@/launcher/Logger';
import { LoaderService } from './LoaderService';
import { VersionService } from './VersionService';

const execFileAsync = promisify(execFile);

interface InstanceSession {
  child?: ChildProcess;
  state: ProcessState;
  abort: AbortController;
}

export type ProcessStateListener = (instanceId: string, state: ProcessState) => void;

export class MinecraftService {
  private readonly sessions = new Map<string, InstanceSession>();

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

  async launch(input: LaunchRequest): Promise<LaunchResult> {
    const abort = new AbortController();
    this.sessions.set(input.instanceId, { state: 'preparing', abort });

    try {
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

      const validationIssues = await validateInstanceBeforeLaunch(instance);
      for (const issue of validationIssues) {
        this.emit(input.instanceId, issue.level, issue.message);
        if (issue.level === 'error') {
          throw new Error(issue.message);
        }
      }

      this.assertNotAborted(input.instanceId);

      if (instance.loader !== 'vanilla' && !instance.launchVersionId) {
        this.emit(input.instanceId, 'info', `Installing ${instance.loader} loader`);
        instance = await this.loaders.install(instance, data.settings);
      }

      if (!instance.launchVersionId && instance.loader !== 'vanilla') {
        throw new Error(`Failed to install ${instance.loader} loader. Please try again or use vanilla Minecraft.`);
      }

      await this.instances.ensureRoots(data.settings);
      this.emit(input.instanceId, 'info', 'Preparing instance');

      const gameVersion = await this.versions.resolveAlias(instance.gameVersion);
      const versionId = instance.launchVersionId || gameVersion;
      const requiredJavaMajor =
        (await this.versions.requiredJavaMajor(versionId, data.settings)) ?? this.java.requiredMajor(gameVersion);

      this.setState(input.instanceId, 'downloading');
      this.emit(input.instanceId, 'info', 'Downloading and verifying game files');

      const runtime = instance.javaPath
        ? await this.validateCustomJava(instance.javaPath, gameVersion, requiredJavaMajor)
        : await this.java.pick(data.settings, gameVersion, requiredJavaMajor);

      this.assertNotAborted(input.instanceId);
      this.setState(input.instanceId, 'launching');

      this.emit(input.instanceId, 'info', `Using Java ${runtime.major} at ${runtime.path}`);
      const plan = await this.versions.createLaunchPlan({
        versionId,
        instance,
        account: this.normalizeAccount(account),
        java: runtime,
        settings: data.settings
      });

      this.assertNotAborted(input.instanceId);
      this.emit(input.instanceId, 'info', `Launching ${plan.version.id}`);

      const child = spawn(plan.javaPath, plan.args, {
        cwd: plan.gameDir,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          APPDATA: process.env.APPDATA,
          HOME: process.env.HOME
        }
      });

      await this.waitForSpawn(child, input.instanceId);
      this.assertNotAborted(input.instanceId);

      const session = this.sessions.get(input.instanceId);
      if (session) {
        session.child = child;
      }

      this.setState(input.instanceId, 'running');
      await this.instances.markPlayed(instance.id);
      await this.logger?.info('launch', `Started ${instance.name}`, { pid: child.pid, versionId });

      child.stdout?.on('data', (chunk: Buffer) => this.emit(instance!.id, 'info', chunk.toString()));
      child.stderr?.on('data', (chunk: Buffer) => this.emit(instance!.id, 'warn', chunk.toString()));
      child.on('error', (error) => this.emit(instance!.id, 'error', error.message));
      child.on('exit', (code) => {
        this.sessions.delete(instance!.id);
        const state: ProcessState = code === 0 ? 'exited' : 'crashed';
        this.setState(instance!.id, state);
        this.emit(instance!.id, state === 'crashed' ? 'error' : 'info', `Minecraft ${state} with code ${code ?? 'unknown'}`);
        void this.logger?.info('launch', `Process ${state}`, { instanceId: instance!.id, code });
        setTimeout(() => {
          if (!this.sessions.has(instance!.id)) {
            this.setState(instance!.id, 'idle');
          }
        }, 1500);
      });

      return {
        pid: child.pid ?? 0,
        instanceId: instance.id,
        state: 'running'
      };
    } catch (error) {
      const aborted =
        error instanceof Error &&
        (error.name === 'AbortError' || this.sessions.get(input.instanceId)?.abort.signal.aborted);
      if (aborted) {
        this.setState(input.instanceId, 'stopped');
        setTimeout(() => this.setState(input.instanceId, 'idle'), 1000);
        return { pid: 0, instanceId: input.instanceId, state: 'stopped' };
      }

      const message = friendlyErrorMessage(error);
      this.sessions.delete(input.instanceId);
      this.setState(input.instanceId, 'idle');
      this.emit(input.instanceId, 'error', message);
      await this.logger?.error('launch', message, { instanceId: input.instanceId });
      throw new Error(message);
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

  private async validateCustomJava(path: string, gameVersion: string, requiredMajor: number) {
    const runtime = await this.java.inspect(path);
    if (!runtime?.valid) {
      throw new Error(`Java was not found at ${path}.`);
    }
    if (runtime.major < requiredMajor) {
      throw new Error(`Java ${requiredMajor}+ is required for Minecraft ${gameVersion}. Selected Java is ${runtime.major}.`);
    }
    return runtime;
  }

  private waitForSpawn(child: ChildProcess, instanceId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', (error) => {
        this.emit(instanceId, 'error', error.message);
        reject(error);
      });
    });
  }

  private assertNotAborted(instanceId: string): void {
    if (this.sessions.get(instanceId)?.abort.signal.aborted) {
      const error = new Error('Launch cancelled');
      error.name = 'AbortError';
      throw error;
    }
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
