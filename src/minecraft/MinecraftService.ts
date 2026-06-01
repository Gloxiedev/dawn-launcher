import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { ConsoleEvent, Instance, LaunchRequest, LaunchResult, LauncherAccount, ProcessState } from '@/types/launcher';
import { JsonDatabase } from '@/launcher/JsonDatabase';
import { InstanceService } from '@/launcher/InstanceService';
import { JavaService } from '@/launcher/JavaService';
import { LoaderService } from './LoaderService';
import { VersionService } from './VersionService';

export class MinecraftService {
  private processes = new Map<string, ChildProcessWithoutNullStreams>();

  constructor(
    private readonly database: JsonDatabase,
    private readonly versions: VersionService,
    private readonly loaders: LoaderService,
    private readonly java: JavaService,
    private readonly instances: InstanceService,
    private readonly onConsole: (event: ConsoleEvent) => void
  ) {}

  listVersions(): Promise<string[]> {
    return this.versions.listVersions();
  }

  scanJava() {
    return this.database.read().then(({ settings }) => this.java.scan(settings));
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
    try {
      const data = await this.database.read();
      let instance = data.instances.find((item) => item.id === input.instanceId);
      const account = data.accounts.find((item) => item.id === input.accountId);
      if (!instance) {
        throw new Error('Instance not found.');
      }
      if (!account) {
        throw new Error('Select an account before launching.');
      }

      this.emit(input.instanceId, 'info', 'Validating instance');
      
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
      const requiredJavaMajor = await this.versions.requiredJavaMajor(versionId, data.settings);
      const runtime = instance.javaPath
        ? await this.validateCustomJava(instance.javaPath, gameVersion, requiredJavaMajor)
        : await this.java.pick(data.settings, gameVersion, requiredJavaMajor);

      this.emit(input.instanceId, 'info', `Using Java ${runtime.major} at ${runtime.path}`);
      const plan = await this.versions.createLaunchPlan({
        versionId,
        instance,
        account: this.normalizeAccount(account),
        java: runtime,
        settings: data.settings
      });

      this.emit(input.instanceId, 'info', `Launching ${plan.version.id}`);
      const child = spawn(plan.javaPath, plan.args, {
        cwd: plan.gameDir,
        env: {
          ...process.env,
          APPDATA: process.env.APPDATA,
          HOME: process.env.HOME
        }
      });

      await this.waitForSpawn(child, instance.id);
      this.processes.set(instance.id, child);
      await this.instances.markPlayed(instance.id);

      child.stdout.on('data', (chunk: Buffer) => this.emit(instance!.id, 'info', chunk.toString()));
      child.stderr.on('data', (chunk: Buffer) => this.emit(instance!.id, 'warn', chunk.toString()));
      child.on('error', (error) => this.emit(instance!.id, 'error', error.message));
      child.on('exit', (code) => {
        this.processes.delete(instance!.id);
        const state: ProcessState = code === 0 ? 'exited' : 'crashed';
        this.emit(instance!.id, state === 'crashed' ? 'error' : 'info', `Minecraft ${state} with code ${code ?? 'unknown'}`);
      });

      return {
        pid: child.pid ?? 0,
        instanceId: instance.id,
        state: 'running'
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emit(input.instanceId, 'error', message);
      throw error;
    }
  }

  async stop(instanceId: string): Promise<void> {
    const child = this.processes.get(instanceId);
    if (child) {
      child.kill();
      this.processes.delete(instanceId);
    }
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

  private async validateCustomJava(path: string, gameVersion: string, requiredMajor = this.java.requiredMajor(gameVersion)) {
    const runtime = await this.java.inspect(path);
    if (!runtime?.valid) {
      throw new Error(`Java was not found at ${path}.`);
    }
    if (runtime.major < requiredMajor) {
      throw new Error(`Java ${requiredMajor}+ is required for Minecraft ${gameVersion}. Selected Java is ${runtime.major}.`);
    }
    return runtime;
  }

  private waitForSpawn(child: ChildProcessWithoutNullStreams, instanceId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', (error) => {
        this.emit(instanceId, 'error', error.message);
        reject(error);
      });
    });
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
