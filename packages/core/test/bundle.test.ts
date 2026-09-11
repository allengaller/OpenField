import { describe, it, expect } from 'vitest';
import { BundleV1, BundleValidationError, encodeBundle, decodeBundle } from '../src/bundle';

const validBundle = {
  schemaVersion: 1 as const,
  id: 'bundle-iphone-01-1757376000000',
  deviceId: 'iphone-01',
  createdAt: 1757376000000,
  events: [
    {
      id: 'evt-1', date: '2026-09-09', cityCode: 'KMG',
      locationName: '篆新农贸市场', contextNote: '早市',
    },
  ],
  encounters: [
    {
      id: 'enc-1', eventId: 'evt-1', participantRef: 'P-001',
      samplingReason: '滚雪球引荐', startedAt: 1757376000000,
    },
  ],
  participants: [{ pseudonym: 'P-001', industry: '菌子批发' }],
  consents: [
    { id: 'con-1', encounterId: 'enc-1', templateType: 'recording', scope: '学术研究' },
  ],
  memos: [
    { id: 'memo-1', linkedArtifactIds: [], type: 'quicknote', content: '摊主提到雨季涨价', createdAt: 1757376000000 },
  ],
  mediaRefs: [
    {
      filename: 'IMG_0001.HEIC', sha256: 'a'.repeat(64), bytes: 2048,
      mime: 'image/heic', type: 'photo', capturedAt: 1757376000000, encounterId: 'enc-1',
    },
  ],
};

describe('bundle v1', () => {
  it('合法 bundle 解析通过', () => {
    const b = BundleV1.parse(validBundle);
    expect(b.encounters[0]!.participantRef).toBe('P-001');
  });
  it('encode → decode 往返等值', () => {
    const b = BundleV1.parse(validBundle);
    expect(decodeBundle(encodeBundle(b))).toEqual(b);
  });
  it('拒绝错误 schemaVersion', () => {
    const bad = { ...validBundle, schemaVersion: 2 };
    expect(() => decodeBundle(JSON.stringify(bad))).toThrow(BundleValidationError);
  });
  it('拒绝坏 sha256 的 mediaRef', () => {
    const bad = {
      ...validBundle,
      mediaRefs: [{ ...validBundle.mediaRefs[0]!, sha256: 'nothex' }],
    };
    expect(() => decodeBundle(JSON.stringify(bad))).toThrow(BundleValidationError);
  });
  it('非 JSON 文本 → BundleValidationError 而非 SyntaxError 泄漏', () => {
    expect(() => decodeBundle('not json')).toThrow(BundleValidationError);
  });
});
