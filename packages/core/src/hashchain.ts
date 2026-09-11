import type { EvidenceEntry, EvidenceAction } from './entities';
import { sha256Hex } from './canonical';

export const GENESIS_PREV_HASH = '0'.repeat(64);

export interface EntryInput {
  ts: number;
  actor: string;
  action: EvidenceAction;
  payloadHash: string;
}

export function computeEntryHash(
  e: Pick<EvidenceEntry, 'seq' | 'prevHash' | 'ts' | 'actor' | 'action' | 'payloadHash'>,
): string {
  return sha256Hex(`${e.seq}|${e.prevHash}|${e.ts}|${e.actor}|${e.action}|${e.payloadHash}`);
}

export function createEntry(prev: EvidenceEntry | null, input: EntryInput): EvidenceEntry {
  const candidate = {
    seq: prev ? prev.seq + 1 : 0,
    ts: input.ts,
    actor: input.actor,
    action: input.action,
    payloadHash: input.payloadHash,
    prevHash: prev ? prev.entryHash : GENESIS_PREV_HASH,
  };
  return { ...candidate, entryHash: computeEntryHash(candidate) };
}

export type ChainVerifyResult = { ok: true } | { ok: false; brokenAt: number; reason: string };

export function verifyChain(entries: EvidenceEntry[]): ChainVerifyResult {
  let prev: EvidenceEntry | null = null;
  for (const e of entries) {
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
