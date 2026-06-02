import type { DawnApi } from './launcher';

declare global {
  interface Window {
    dawn: DawnApi;
  }
}

export {};
