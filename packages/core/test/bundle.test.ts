import { describe, it, expect } from 'vitest';
import { BundleV1, BundleValidationError, MediaRef, encodeBundle, decodeBundle } from '../src/bundle';
import type { BundleIssue } from '../src/bundle';

function issuesOf(fn: () => unknown): BundleIssue[] {
  try {
    fn();
  } catch (e) {
    if (!(e instanceof BundleValidationError)) throw e;
    return e.issues;
  }
  throw new Error('预期抛出 BundleValidationError');
}

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
  it('拒绝未知顶层字段', () => {
    const bad = { ...validBundle, extraField: 'x' };
    expect(() => decodeBundle(JSON.stringify(bad))).toThrow(BundleValidationError);
  });
});

describe('bundle 错误面', () => {
  it('encodeBundle 对非法 bundle（createdAt: 0）抛 BundleValidationError 而非泄漏 ZodError', () => {
    const bad = { ...BundleV1.parse(validBundle), createdAt: 0 };
    expect(() => encodeBundle(bad)).toThrow(BundleValidationError);
  });
  it('decodeBundle 非 JSON → issues 形状恰为 [{ message: "不是合法 JSON", code: "invalid_json" }]', () => {
    expect(issuesOf(() => decodeBundle('not json'))).toEqual([
      { message: '不是合法 JSON', code: 'invalid_json' },
    ]);
  });
  it('BundleValidationError 实例 name 为类名（Error.name 覆写，不回退到 Error）', () => {
    try {
      decodeBundle('not json');
    } catch (e) {
      expect(e).toBeInstanceOf(BundleValidationError);
      expect((e as BundleValidationError).name).toBe('BundleValidationError');
      return;
    }
    throw new Error('预期抛出 BundleValidationError');
  });
  it('decodeBundle 未知顶层键 → issue 标识该键（zod 4 顶层未知键无 path，按实际行为断言）', () => {
    const issues = issuesOf(() => decodeBundle(JSON.stringify({ ...validBundle, surprise: true })));
    expect(issues[0]).toMatchObject({ code: 'unrecognized_keys' });
    expect(issues[0]!.message).toContain('surprise');
  });
  it('decodeBundle 嵌套字段错误 → issues[0].path 为点连接路径', () => {
    const bad = { ...validBundle, mediaRefs: [{ ...validBundle.mediaRefs[0]!, sha256: 'nothex' }] };
    const issues = issuesOf(() => decodeBundle(JSON.stringify(bad)));
    expect(issues[0]!.path).toBe('mediaRefs.0.sha256');
  });
  it('MediaRef 拒绝空串 encounterId', () => {
    expect(MediaRef.safeParse({ ...validBundle.mediaRefs[0]!, encounterId: '' }).success).toBe(false);
  });
  it.each([0, 1.5])('BundleV1 拒绝非法 createdAt %s', (badCreatedAt) => {
    expect(BundleV1.safeParse({ ...validBundle, createdAt: badCreatedAt }).success).toBe(false);
  });
});
