import { describe, it, expect } from 'vitest';
import * as core from '../src';
import { computePayloadHash, createEntry, verifyChain, encodeBundle, decodeBundle, makeRefId } from '../src';

// 最小合法 bundle（空集合）：本文件多个用例共用，提取为文件内 helper。
// 经 decodeBundle(encodeBundle(...)) 往返一次，得到 schema 校验并定型后的 Bundle 对象。
function makeMinimalBundle() {
  return decodeBundle(
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
}

const minimalBundle = makeMinimalBundle();

// 场景：手机端产出一个 bundle，桌面端将其内容登记入证据链
describe('bundle → 证据链 集成', () => {
  it('bundle 内容哈希可作为链上 payloadHash，链校验通过，引用 ID 可生成', () => {
    const payloadHash = computePayloadHash(minimalBundle);
    const e1 = createEntry(null, { ts: 1757376000000, actor: 'mobile:iphone-01', action: 'CREATE_EVENT', payloadHash });
    const e2 = createEntry(e1, { ts: 1757376000001, actor: 'desktop', action: 'INGEST_ARTIFACT', payloadHash: computePayloadHash({ artifactId: 'art-1' }) });
    expect(verifyChain([e1, e2])).toEqual({ ok: true });
    expect(makeRefId({ date: '2026-09-09', cityCode: 'KMG', seq: 1, offsetSeconds: 754 })).toBe(
      'OF-20260909-KMG-001#T12:34',
    );
  });

  it('encodeBundle 字节稳定：encode → decode → encode 幂等', () => {
    const text = encodeBundle(minimalBundle);
    expect(encodeBundle(decodeBundle(text))).toBe(text);
  });
});

// 防线：export * 在跨模块导出重名时会静默丢弃后导入的名字而非报错。
// 本测试钉住公共面必须包含的关键运行时符号，漏一个即失败。
// 类型导出（ChainVerifyResult、BundleIssue、RefIdParts、ParsedRefId、EntryInput、Bundle）
// 不出现在 Object.keys 里，故意不列入清单。
describe('公共导出面', () => {
  it('关键符号经 barrel 导出（export * 静默丢弃会被抓住）', () => {
    const expected = [
      'CORE_VERSION',
      'ArtifactType', 'MemoType', 'ConsentTemplateType', 'InboxStatus', 'EvidenceAction',
      'Gps', 'CityCode', 'Sha256', 'IsoDate', 'EpochMs', 'Id', 'Actor',
      'FieldEvent', 'Encounter', 'Artifact', 'Participant', 'Memo', 'ConsentRecord',
      'InboxItem', 'TimeSyncRecord', 'EvidenceEntry',
      'sha256Hex', 'stableStringify', 'computePayloadHash',
      'GENESIS_PREV_HASH', 'computeEntryHash', 'createEntry', 'verifyChain',
      'MediaRef', 'BundleV1', 'BundleValidationError', 'encodeBundle', 'decodeBundle',
      'RefIdError', 'makeRefId', 'parseRefId',
    ];
    const actual = new Set(Object.keys(core));
    for (const name of expected) {
      expect(actual.has(name), `${name} 未从公共面导出`).toBe(true);
    }
  });
});
