import type { Instance, JavaRuntime, LauncherAccount, LauncherSettings } from '@/types/launcher';

export interface MojangRule {
  action: 'allow' | 'disallow';
  os?: {
    name?: 'windows' | 'osx' | 'linux';
    arch?: string;
    version?: string;
  };
  features?: Record<string, boolean>;
}

export interface MojangArgument {
  rules?: MojangRule[];
  value: string | string[];
}

export interface MojangLibrary {
  name: string;
  downloads?: {
    artifact?: MojangDownload;
    classifiers?: Record<string, MojangDownload>;
  };
  natives?: Record<string, string>;
  rules?: MojangRule[];
  extract?: {
    exclude?: string[];
  };
  url?: string;
}

export interface MojangDownload {
  path?: string;
  sha1?: string;
  size?: number;
  url: string;
}

export interface MojangVersion {
  id: string;
  type: string;
  inheritsFrom?: string;
  mainClass: string;
  assets?: string;
  assetIndex?: {
    id: string;
    sha1: string;
    size: number;
    totalSize: number;
    url: string;
  };
  javaVersion?: {
    component: string;
    majorVersion: number;
  };
  downloads?: {
    client?: MojangDownload;
  };
  libraries: MojangLibrary[];
  arguments?: {
    game?: Array<string | MojangArgument>;
    jvm?: Array<string | MojangArgument>;
  };
  minecraftArguments?: string;
  releaseTime?: string;
}

export interface VersionManifest {
  latest: {
    release: string;
    snapshot: string;
  };
  versions: Array<{
    id: string;
    type: string;
    url: string;
    time: string;
    releaseTime: string;
    sha1?: string;
  }>;
}

export interface AssetIndex {
  objects: Record<string, { hash: string; size: number }>;
}

export interface LaunchPlanInput {
  versionId: string;
  instance: Instance;
  account: LauncherAccount;
  java: JavaRuntime;
  settings: LauncherSettings;
  onStage?: (message: string) => void;
  signal?: AbortSignal;
}

export interface LaunchPlan {
  version: MojangVersion;
  javaPath: string;
  args: string[];
  gameDir: string;
  nativesDir: string;
}
