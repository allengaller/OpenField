import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { computePayloadHash } from '../src/canonical';
import { GENESIS_PREV_HASH, computeEntryHash, createEntry, verifyChain } from '../src/hashchain';
import type { EvidenceAction, EvidenceEntry } from '../src/entities';

function buildChain(n: number): EvidenceEntry[] {
  const out: EvidenceEntry[] = [];
  for (let i = 0; i < n; i++) {
    out.push(
      createEntry(out[i - 1] ?? null, {
        ts: 1757376000000 + i,
        actor: 'desktop',
        action: 'INGEST_ARTIFACT',
        payloadHash: computePayloadHash({ artifactId: `art-00${i}` }),
      }),
    );
  }
  return out;
}

describe('createEntry', () => {
  it('首条 entry：seq=0，prevHash=GENESIS，自洽', () => {
    const e = createEntry(null, {
      ts: 1757376000000,
      actor: 'desktop',
      action: 'CREATE_EVENT',
      payloadHash: computePayloadHash({ id: 'evt-1' }),
    });
    expect(e.seq).toBe(0);
    expect(e.prevHash).toBe(GENESIS_PREV_HASH);
    expect(e.entryHash).toBe(computeEntryHash(e));
  });
  it('后续 entry：seq 递增，prevHash 接续前条', () => {
    const chain = buildChain(2);
    expect(chain[1]!.seq).toBe(1);
    expect(chain[1]!.prevHash).toBe(chain[0]!.entryHash);
  });
  it('ts 为 Number.MAX_SAFE_INTEGER → 通过，entryHash 为 64 位小写 hex，单条链校验通过', () => {
    const e = createEntry(null, {
      ts: Number.MAX_SAFE_INTEGER,
      actor: 'desktop',
      action: 'CREATE_EVENT',
      payloadHash: 'a'.repeat(64),
    });
    expect(e.entryHash).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyChain([e])).toEqual({ ok: true });
  });
});

describe('createEntry 输入校验', () => {
  it('拒绝前像碰撞样例 payloadHash（终审发现）', () => {
    // 'EXPORT|' + 57×a 恰 64 字符但非小写 hex 且含 '|'。若无 Sha256 校验，
    // (actor='u', action='CREATE_EVENT', payloadHash='EXPORT|X') 与
    // (actor='u|CREATE_EVENT', action='EXPORT', payloadHash='X') 产生相同 '|' 前像。
    expect(() =>
      createEntry(null, {
        ts: 1757376000000,
        actor: 'u',
        action: 'CREATE_EVENT',
        payloadHash: 'EXPORT|' + 'a'.repeat(57),
      }),
    ).toThrow(ZodError);
  });
  it.each([0, -1, 1.5])('拒绝非法 ts %s', (badTs) => {
    expect(() =>
      createEntry(null, {
        ts: badTs,
        actor: 'desktop',
        action: 'INGEST_ARTIFACT',
        payloadHash: computePayloadHash({ artifactId: 'art-x' }),
      }),
    ).toThrow(ZodError);
  });
  it.each(['', 'u|v', 'a'.repeat(129)])('拒绝非法 actor %s', (badActor) => {
    expect(() =>
      createEntry(null, {
        ts: 1757376000000,
        actor: badActor,
        action: 'INGEST_ARTIFACT',
        payloadHash: computePayloadHash({ artifactId: 'art-x' }),
      }),
    ).toThrow(ZodError);
  });
  it('拒绝未定义的 action', () => {
    expect(() =>
      createEntry(null, {
        ts: 1757376000000,
        actor: 'desktop',
        action: 'NOPE' as EvidenceAction,
        payloadHash: computePayloadHash({ artifactId: 'art-x' }),
      }),
    ).toThrow(ZodError);
  });
  it('拒绝畸形 prev（上一条不通过 EvidenceEntry schema）', () => {
    expect(() =>
      createEntry({ seq: 0.5, entryHash: 'garbage' } as unknown as EvidenceEntry, {
        ts: 1757376000000,
        actor: 'desktop',
        action: 'INGEST_ARTIFACT',
        payloadHash: computePayloadHash({ artifactId: 'art-x' }),
      }),
    ).toThrow(ZodError);
  });
});

describe('verifyChain', () => {
  it('完整链校验通过', () => {
    expect(verifyChain(buildChain(5))).toEqual({ ok: true });
  });
  it('空链通过', () => {
    expect(verifyChain([])).toEqual({ ok: true });
  });
  it('篡改中段 payloadHash → 断在该条', () => {
    const chain = buildChain(3);
    chain[1]!.payloadHash = 'f'.repeat(64);
    const r = verifyChain(chain);
    expect(r).toMatchObject({ ok: false, brokenAt: 1 });
    expect(r.ok === false && r.reason).toContain('entryHash');
  });
  it('篡改首条 ts（时间回拨）→ 检出', () => {
    const chain = buildChain(3);
    chain[0]!.ts = 1111111111111;
    expect(verifyChain(chain)).toMatchObject({ ok: false, brokenAt: 0 });
  });
  it('直接伪造 entryHash → 检出', () => {
    const chain = buildChain(3);
    chain[2]!.entryHash = 'a'.repeat(64);
    expect(verifyChain(chain)).toMatchObject({ ok: false, brokenAt: 2 });
  });
  it('抽掉中间一条 → seq 不连续', () => {
    const chain = buildChain(3);
    const broken = [chain[0]!, chain[2]!];
    const r = verifyChain(broken);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain('seq');
  });
  it('乱序 → prevHash 断链', () => {
    const chain = buildChain(3);
    const r = verifyChain([chain[0]!, chain[2]!, chain[1]!]);
    expect(r.ok).toBe(false);
  });
  it('首条 prevHash 非 GENESIS → 检出', () => {
    const chain = buildChain(2);
    const forged = { ...chain[0]!, prevHash: 'e'.repeat(64) };
    forged.entryHash = computeEntryHash(forged);
    const r = verifyChain([forged, chain[1]!]);
    expect(r).toMatchObject({ ok: false, brokenAt: 0 });
    expect(r.ok === false && r.reason).toContain('prevHash');
  });
});

describe('verifyChain schema 前置校验', () => {
  it('schema 破损条目（actor 含 |）→ 报 schema 错而非哈希/结构错', () => {
    const chain = buildChain(2);
    // entryHash 与各字段自洽（哈希重算会通过）——证明 schema 检查先于哈希重算
    const badEntry: EvidenceEntry = {
      seq: 1,
      ts: 1757376000001,
      actor: 'u|v',
      action: 'INGEST_ARTIFACT',
      payloadHash: 'a'.repeat(64),
      prevHash: chain[0]!.entryHash,
      entryHash: computeEntryHash({
        seq: 1,
        ts: 1757376000001,
        actor: 'u|v',
        action: 'INGEST_ARTIFACT',
        payloadHash: 'a'.repeat(64),
        prevHash: chain[0]!.entryHash,
      }),
    };
    const r = verifyChain([chain[0]!, badEntry]);
    expect(r).toMatchObject({ ok: false, brokenAt: 1 });
    expect(r.ok === false && r.reason).toContain('EvidenceEntry schema');
    expect(r.ok === false && r.reason).toContain('actor');
  });
  it('数组中的 null 条目 → brokenAt=-1 而非抛 TypeError', () => {
    const r = verifyChain([null as unknown as EvidenceEntry]);
    expect(r).toMatchObject({ ok: false, brokenAt: -1 });
    expect(r.ok === false && r.reason).toContain('EvidenceEntry schema');
  });
  it('seq 为 NaN 的条目 → brokenAt=-1 而非 NaN 泄漏', () => {
    const r = verifyChain([{ seq: NaN } as unknown as EvidenceEntry]);
    expect(r).toMatchObject({ ok: false, brokenAt: -1 });
    expect(r.ok === false && r.reason).toContain('EvidenceEntry schema');
    // NaN 经 JSON.stringify 会变成 null，这里钉住 brokenAt 必须是数字 -1
    expect(JSON.parse(JSON.stringify(r)).brokenAt).toBe(-1);
  });
});
