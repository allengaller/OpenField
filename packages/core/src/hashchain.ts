import { EvidenceEntry, EvidenceAction, Actor, EpochMs, Sha256 } from './entities';
import { sha256Hex } from './canonical';

export const GENESIS_PREV_HASH = '0'.repeat(64);

export interface EntryInput {
  ts: number;
  actor: string;
  action: EvidenceAction;
  payloadHash: string;
}

// '|' 连接编码的无歧义前提：payloadHash 为 64 位小写 hex、action 为受控枚举、
// actor 不含 '|'（createEntry 用 Actor schema 强制）。任一前提失效，
// 不同字段组合可能产生相同哈希前像。
export function computeEntryHash(
  e: Pick<EvidenceEntry, 'seq' | 'prevHash' | 'ts' | 'actor' | 'action' | 'payloadHash'>,
): string {
  return sha256Hex(`${e.seq}|${e.prevHash}|${e.ts}|${e.actor}|${e.action}|${e.payloadHash}`);
}

export function createEntry(prev: EvidenceEntry | null, input: EntryInput): EvidenceEntry {
  const p = prev ? EvidenceEntry.parse(prev) : null;
  const candidate = {
    seq: p ? p.seq + 1 : 0,
    ts: EpochMs.parse(input.ts),
    actor: Actor.parse(input.actor),
    action: EvidenceAction.parse(input.action),
    payloadHash: Sha256.parse(input.payloadHash),
    prevHash: p ? p.entryHash : GENESIS_PREV_HASH,
  };
  return { ...candidate, entryHash: computeEntryHash(candidate) };
}

export type ChainVerifyResult = { ok: true } | { ok: false; brokenAt: number; reason: string };

export function verifyChain(entries: EvidenceEntry[]): ChainVerifyResult {
  let prev: EvidenceEntry | null = null;
  for (const e of entries) {
    const schemaCheck = EvidenceEntry.safeParse(e);
    if (!schemaCheck.success) {
      const issue = schemaCheck.error.issues[0];
      const loc = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
      return {
        ok: false,
        brokenAt: Number.isSafeInteger(e?.seq) && e.seq >= 0 ? e.seq : -1,
        reason: issue
          ? `条目不符合 EvidenceEntry schema（${loc}${issue.message}）`
          : '条目不符合 EvidenceEntry schema',
      };
    }
    if (e.seq !== (prev ? prev.seq + 1 : 0)) {
      return { ok: false, brokenAt: e.seq, reason: 'seq 不连续' };
    }
    const expectedPrev = prev ? prev.entryHash : GENESIS_PREV_HASH;
    if (e.prevHash !== expectedPrev) {
      return { ok: false, brokenAt: e.seq, reason: 'prevHash 断链' };
    }
    if (e.entryHash !== computeEntryHash(e)) {
      return { ok: false, brokenAt: e.seq, reason: 'entryHash 不匹配' };
    }
    prev = e;
  }
  return { ok: true };
}
