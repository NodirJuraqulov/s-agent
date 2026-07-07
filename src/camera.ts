import axios from 'axios';
import { config } from './config';

/** IP kameradan bitta kadr (JPEG) yuklab oladi (HTTP Basic Auth bilan). */
export async function captureFrame(cameraUrl: string): Promise<Buffer> {
  const response = await axios.get<ArrayBuffer>(cameraUrl, {
    responseType: 'arraybuffer',
    timeout: 5000,
    auth: {
      username: config.cameraUsername,
      password: config.cameraPassword,
    },
  });
  return Buffer.from(response.data);
}
