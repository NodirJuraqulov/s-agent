import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Majburiy .env o'zgaruvchisi topilmadi: ${name}`);
  }
  return value;
}

export const config = {
  cameraEntryUrl: required('CAMERA_ENTRY_URL'),
  cameraExitUrl: required('CAMERA_EXIT_URL'),
  serverUrl: required('SERVER_URL'),
  orgId: required('ORG_ID'),
  agentApiKey: required('AGENT_API_KEY'),
  cameraUsername: process.env.CAMERA_USERNAME || 'admin',
  cameraPassword: process.env.CAMERA_PASSWORD || 'admin',
  barrierPort: process.env.BARRIER_PORT || '',
  barrierOpenSeconds: Number(process.env.BARRIER_OPEN_SECONDS) || 3,
  captureIntervalMs: Number(process.env.CAPTURE_INTERVAL_MS) || 2000,
  motionThreshold: Number(process.env.MOTION_THRESHOLD) || 20,
};
