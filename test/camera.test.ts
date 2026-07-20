import { describe, it, expect } from 'vitest';
import { extractFirstJpeg } from '../src/camera';

function u16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n, 0);
  return b;
}

function buildSosSegment(header: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xda]), u16(header.length + 2), header]);
}

function buildSimpleJpeg(): Buffer {
  const soi = Buffer.from([0xff, 0xd8]);
  const sos = buildSosSegment(Buffer.from([0x03, 0x01, 0x00, 0x00, 0x3f, 0x00]));
  const scanData = Buffer.from([0x11, 0x22, 0x33, 0xff, 0xd9]);
  return Buffer.concat([soi, sos, scanData]);
}

function buildJpegWithExifThumbnail(): { full: Buffer } {
  const soi = Buffer.from([0xff, 0xd8]);

  const fakeThumbnail = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0x01, 0x02, 0x03, 0x04]),
    Buffer.from([0xff, 0xd9]),
  ]);

  const app1Payload = Buffer.concat([
    Buffer.from('Exif\0\0', 'ascii'),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    fakeThumbnail,
  ]);
  const app1SegmentLength = app1Payload.length + 2;
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), u16(app1SegmentLength), app1Payload]);

  const sos = buildSosSegment(Buffer.from([0x03, 0x01, 0x00, 0x00, 0x3f, 0x00]));

  const scanData = Buffer.concat([
    Buffer.from([0x10, 0x20, 0x30]),
    Buffer.from([0xff, 0xd0]),
    Buffer.from([0x40, 0x50]),
    Buffer.from([0xff, 0xd9]),
  ]);

  const full = Buffer.concat([soi, app1, sos, scanData]);
  return { full };
}

describe('extractFirstJpeg', () => {
  it('oddiy JPEGni togri ajratadi', () => {
    const jpeg = buildSimpleJpeg();
    const buffer = Buffer.concat([Buffer.from([0x00, 0x11]), jpeg, Buffer.from([0x22, 0x33])]);

    const result = extractFirstJpeg(buffer);

    expect(result).not.toBeNull();
    expect(result!.equals(jpeg)).toBe(true);
  });

  it('EXIF thumbnaildagi soxta EOIga aldanmay tolliq kadrni ajratadi', () => {
    const { full } = buildJpegWithExifThumbnail();
    const buffer = Buffer.concat([full, Buffer.from([0x00, 0x11, 0x22])]);

    const result = extractFirstJpeg(buffer);

    expect(result).not.toBeNull();
    expect(result!.equals(full)).toBe(true);
    expect(result!.length).toBe(full.length);
  });
});
