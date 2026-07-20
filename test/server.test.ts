import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/config', () => ({
  config: {
    serverUrl: 'http://test-server',
    agentApiKey: 'test-key',
    cameraUsername: 'admin',
    cameraPassword: 'admin',
    captureIntervalMs: 2000,
    motionThreshold: 20,
    barrierConfidenceThreshold: 0.75,
  },
}));

vi.mock('../src/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    isAxiosError: (error: unknown): boolean =>
      Boolean(error && typeof error === 'object' && 'isAxiosError' in error),
  },
}));

import axios from 'axios';
import { sendToServer } from '../src/server';

describe('sendToServer', () => {
  const image = Buffer.from('fake-image');

  beforeEach(() => {
    vi.mocked(axios.post).mockReset();
  });

  it("candidate_found:false javobida reason='no_candidate' saqlab qoladi", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: { detected: false, reason: 'no_candidate', message: 'Nomer aniqlanmadi' },
    });

    const result = await sendToServer('entry', image);

    expect(result.detected).toBe(false);
    expect(result.reason).toBe('no_candidate');
  });

  it("OCR o'qiy olmagan javobda reason='ocr_failed' saqlab qoladi", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: { detected: false, reason: 'ocr_failed', message: 'Nomer aniqlanmadi' },
    });

    const result = await sendToServer('entry', image);

    expect(result.detected).toBe(false);
    expect(result.reason).toBe('ocr_failed');
  });

  it('muvaffaqiyatli javobni ozgarishsiz qaytaradi (regressiya yoq)', async () => {
    const backendResponse = {
      detected: true,
      session: { id: 1, plate_number: '01A123AA' },
      confidence: 0.97,
    };
    vi.mocked(axios.post).mockResolvedValue({ data: backendResponse });

    const result = await sendToServer('entry', image);

    expect(result).toEqual(backendResponse);
    expect(result.reason).toBeUndefined();
  });

  it("reason maydoni umuman bolmasa xavfsizlik uchun 'ocr_failed' deb belgilaydi", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: { detected: false, message: 'Nomer aniqlanmadi' },
    });

    const result = await sendToServer('entry', image);

    expect(result.reason).toBe('ocr_failed');
  });
});
