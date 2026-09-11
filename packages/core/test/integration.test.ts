import { describe, it, expect } from 'vitest';
import { computePayloadHash } from '../src/canonical';
import { createEntry, verifyChain } from '../src/hashchain';
import { encodeBundle, decodeBundle } from '../src/bundle';
import { makeRefId } from '../src/refid';

// 场景：手机端产出一个 bundle，桌面端将其内容登记入证据链
describe('bundle → 证据链 集成', () => {
  it('bundle 内容哈希可作为链上 payloadHash，链校验通过，引用 ID 可生成', () => {
    const bundle = decodeBundle(
      encodeBundle({
        schemaVersion: 1,
        id: 'b-1',
        deviceId: 'iphone-01',
        createdAt: 1757376000000,
        events: [],
        encounters: [],
        participants: [],
        consents: [],
        memos: [],
        mediaRefs: [],
      }),
    );
    const payloadHash = computePayloadHash(bundle);
    const e1 = createEntry(null, { ts: 1757376000000, actor: 'mobile:iphone-01', action: 'CREATE_EVENT', payloadHash });
    const e2 = createEntry(e1, { ts: 1757376000001, actor: 'desktop', action: 'INGEST_ARTIFACT', payloadHash: computePayloadHash({ artifactId: 'art-1' }) });
    expect(verifyChain([e1, e2])).toEqual({ ok: true });
    expect(makeRefId({ date: '2026-09-09', cityCode: 'KMG', seq: 1, offsetSeconds: 754 })).toBe(
      'OF-20260909-KMG-001#T12:34',
    );
  });
});
