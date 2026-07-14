import axios from 'axios';
import { config } from './config';
import { AgentConfig } from './agentConfig';

interface RawAgentConfig {
  camera_entry_url: string | null;
  camera_exit_url: string | null;
  camera_username: string | null;
  camera_password: string | null;
  barrier_enabled: boolean;
  barrier_mode?: 'single' | 'separate' | null;
  barrier_entry_port?: string | null;
  barrier_exit_port?: string | null;
  barrier_open_seconds: number;
}

/** Backend'dan agent konfiguratsiyasini (kamera URL'lari, shlagbaum) oladi. */
export async function fetchAgentConfig(): Promise<AgentConfig> {
  const response = await axios.get<RawAgentConfig>(`${config.serverUrl}/api/agent/config`, {
    headers: {
      'X-Agent-Key': config.agentApiKey,
    },
    timeout: 10000,
  });

  const raw = response.data;

  return {
    cameraEntryUrl: raw.camera_entry_url,
    cameraExitUrl: raw.camera_exit_url,
    cameraUsername: raw.camera_username,
    cameraPassword: raw.camera_password,
    barrierEnabled: raw.barrier_enabled,
    barrierMode: raw.barrier_mode ?? undefined,
    barrierEntryPort: raw.barrier_entry_port ?? undefined,
    barrierExitPort: raw.barrier_exit_port ?? undefined,
    barrierOpenSeconds: raw.barrier_open_seconds,
  };
}
