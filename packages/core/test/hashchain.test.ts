import { describe, it, expect } from 'vitest';
import { computePayloadHash } from '../src/canonical';
import { GENESIS_PREV_HASH, computeEntryHash, createEntry, verifyChain } from '../src/hashchain';
import type { EvidenceEntry } from '../src/entities';

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
