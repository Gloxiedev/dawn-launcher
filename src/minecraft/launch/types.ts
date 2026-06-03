import type { Instance, JavaRuntime, LauncherAccount, LauncherSettings } from '@/types/launcher';
import type { MojangVersion } from '../MinecraftTypes';

export interface LaunchContext {
  versionId: string;
  instance: Instance;
  account: LauncherAccount;
  java: JavaRuntime;
  settings: LauncherSettings;
  signal?: AbortSignal;
  onStage?: (message: string) => void;
}

export interface LaunchPlanResult {
  version: MojangVersion;
  javaPath: string;
  args: string[];
  gameDir: string;
  nativesDir: string;
}

export interface SyncProgress {
  phase: 'libraries' | 'assets';
  completed: number;
  total: number;
  cached?: number;
}
