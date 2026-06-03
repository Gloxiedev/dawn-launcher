import { spawn, type ChildProcess } from 'node:child_process';
import type { LaunchPlanResult } from './types';

export class GameProcessLauncher {
  spawn(plan: LaunchPlanResult): ChildProcess {
    return spawn(plan.javaPath, plan.args, {
      cwd: plan.gameDir,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        APPDATA: process.env.APPDATA,
        HOME: process.env.HOME
      }
    });
  }

  waitForSpawn(child: ChildProcess, timeoutMs = 15_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Process spawn timeout — Minecraft did not start (check console for Java errors)'));
      }, timeoutMs);

      const finish = (error?: Error) => {
        clearTimeout(timeout);
        if (error) {
          reject(error);
          return;
        }
        resolve();
      };

      child.once('error', (error) => finish(error));

      child.once('spawn', () => {
        setTimeout(() => {
          if (child.killed || child.exitCode !== null) {
            finish(new Error(`Minecraft exited immediately with code ${child.exitCode ?? 'unknown'}`));
            return;
          }
          if (!child.pid) {
            finish(new Error('Minecraft process has no PID'));
            return;
          }
          try {
            process.kill(child.pid, 0);
            finish();
          } catch {
            finish(new Error('Minecraft process died during startup'));
          }
        }, 500);
      });
    });
  }
}
