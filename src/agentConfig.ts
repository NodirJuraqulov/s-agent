import { config } from './config';
import { logger } from './logger';

export type BarrierMode = 'single' | 'separate';

export interface AgentConfig {
  cameraEntryUrl: string | null;
  cameraExitUrl: string | null;
  cameraUsername: string | null;
  cameraPassword: string | null;
  barrierEnabled: boolean;
  barrierMode?: BarrierMode;
  barrierEntryPort?: string;
  barrierExitPort?: string;
  barrierOpenSeconds: number;
}

let current: AgentConfig | null = null;

export function hasAgentConfig(): boolean {
  return current !== null;
}

export function getAgentConfig(): AgentConfig {
  if (!current) {
    throw new Error("Agent konfiguratsiyasi hali backend'dan yuklanmagan");
  }
  return current;
}

export function resolveBarrierPort(agentConfig: AgentConfig, type: 'entry' | 'exit'): string | undefined {
  if (agentConfig.barrierMode === 'separate' && type === 'exit') {
    return agentConfig.barrierExitPort;
  }
  return agentConfig.barrierEntryPort;
}

export function resolveCameraAuth(agentConfig: AgentConfig): { username: string; password: string } {
  return {
    username: agentConfig.cameraUsername ?? config.cameraUsername,
    password: agentConfig.cameraPassword ?? config.cameraPassword,
  };
}

export function updateAgentConfig(newConfig: AgentConfig): void {
  current = newConfig;

  const barrierSummary = newConfig.barrierEnabled
    ? `yoqilgan (mode=${newConfig.barrierMode ?? '-'}, entry_port=${newConfig.barrierEntryPort ?? '-'}, exit_port=${newConfig.barrierExitPort ?? '-'}, ${newConfig.barrierOpenSeconds}s)`
    : "o'chirilgan";

  logger.info(
    `Konfiguratsiya backend dan olindi: Kirish kamerasi=${newConfig.cameraEntryUrl ?? 'sozlanmagan'}, ` +
      `Chiqish kamerasi=${newConfig.cameraExitUrl ?? 'sozlanmagan'}, Shlagbaum=${barrierSummary}`
  );
}
