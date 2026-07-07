import FormData from 'form-data';
import axios from 'axios';
import { config } from './config';
import { logger } from './logger';

export interface EntryResult {
  detected: boolean;
  session?: {
    id?: number;
    plate_number?: string;
  };
}

/** Rasmni s-backend ga yuboradi: POST {SERVER_URL}/api/parking/entry */
export async function sendToServer(image: Buffer): Promise<EntryResult> {
  const form = new FormData();
  form.append('image', image, {
    filename: 'snapshot.jpg',
    contentType: 'image/jpeg',
  });

  try {
    const response = await axios.post<EntryResult>(`${config.serverUrl}/api/parking/entry`, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${config.secretKey}`,
      },
      timeout: 15000,
    });
    return response.data;
  } catch (error) {
    logger.error(`Server ga yuborishda xato: ${(error as Error).message}`);
    return { detected: false };
  }
}
