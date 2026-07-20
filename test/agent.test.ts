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

import { logDetectionOutcome } from '../src/agent';
import { logger } from '../src/logger';
import type { EntryResult } from '../src/server';

describe('logDetectionOutcome', () => {
  const label = 'Kirish';

  beforeEach(() => {
    logger.info.mockClear();
    logger.warn.mockClear();
    logger.error.mockClear();
  });

  it("reason='no_candidate' bolganda faqat INFO darajasida yozadi, WARN chaqirilmaydi", () => {
    const result: EntryResult = { detected: false, reason: 'no_candidate' };

    logDetectionOutcome(label, result);

    expect(logger.info).toHaveBeenCalledWith(`${label}: harakat sezildi, lekin nomer-kandidat topilmadi`);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("reason='ocr_failed' bolganda hozirgidek WARN darajasida yozadi", () => {
    const result: EntryResult = { detected: false, reason: 'ocr_failed' };

    logDetectionOutcome(label, result);

    expect(logger.warn).toHaveBeenCalledWith(`${label}: nomer aniqlanmadi — operator xabardor`);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("reason maydoni yoq bolsa xavfsizlik uchun ocr_failed kabi WARN qiladi", () => {
    const result: EntryResult = { detected: false };

    logDetectionOutcome(label, result);

    expect(logger.warn).toHaveBeenCalledWith(`${label}: nomer aniqlanmadi — operator xabardor`);
  });

  it("reason='duplicate' hozirgidek WARN qiladi (regressiya yoq)", () => {
    const result: EntryResult = { detected: false, reason: 'duplicate' };

    logDetectionOutcome(label, result);

    expect(logger.warn).toHaveBeenCalledWith(`${label}: Bu mashina allaqachon stoyankada (409)`);
  });

  it("reason='auth_error' hozirgidek ERROR qiladi (regressiya yoq)", () => {
    const result: EntryResult = { detected: false, reason: 'auth_error' };

    logDetectionOutcome(label, result);

    expect(logger.error).toHaveBeenCalledWith(`${label}: Server autentifikatsiya xatosi (401) — Agent API Key ni tekshiring!`);
  });
});
