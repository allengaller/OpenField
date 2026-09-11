import type Database from 'better-sqlite3-multiple-ciphers';
import { createEntry, computePayloadHash, TimeSyncRecord, type EvidenceAction, type EvidenceEntry } from '@openfield/core';
import { randomUUID } from 'node:crypto';
import Sntp from '@hapi/sntp';
import { insertTimeSyncRecord } from './repos';

type Row = Record<string, unknown>;

export function rowToEvidenceEntry(r: Row): EvidenceEntry {
  return {
    seq: r.seq as number,
    ts: r.ts as number,
    actor: r.actor as string,
    action: r.action as EvidenceAction,
    payloadHash: r.payload_hash as string,
    prevHash: r.prev_hash as string,
    entryHash: r.entry_hash as string,
  };
}

export function listEvidenceEntries(db: Database.Database): EvidenceEntry[] {
  return (db.prepare('SELECT * FROM evidence_log ORDER BY seq').all() as Row[]).map(rowToEvidenceEntry);
}

export function getLastEntry(db: Database.Database): EvidenceEntry | null {
  const r = db.prepare('SELECT * FROM evidence_log ORDER BY seq DESC LIMIT 1').get() as Row | undefined;
  return r ? rowToEvidenceEntry(r) : null;
}

// 必须在调用方事务内执行：链条目与业务写库要么同时生效，要么同时回滚。
export function appendEntry(
  db: Database.Database,
  input: { ts: number; actor: string; action: EvidenceAction; payloadHash: string },
): EvidenceEntry {
  const prev = getLastEntry(db);
  const entry = createEntry(prev, input);
  db.prepare(
    'INSERT INTO evidence_log (seq, ts, actor, action, payload_hash, prev_hash, entry_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(entry.seq, entry.ts, entry.actor, entry.action, entry.payloadHash, entry.prevHash, entry.entryHash);
  return entry;
}

export interface TimeSyncResult {
  record: TimeSyncRecord;
  entry: EvidenceEntry;
}

export function recordTimeSync(db: Database.Database, input: { ntpServer: string; offsetMs: number; ts?: number }): TimeSyncResult {
  const record = TimeSyncRecord.parse({
    id: `tsync-${randomUUID()}`,
    checkedAt: input.ts ?? Date.now(),
    ntpServer: input.ntpServer,
    offsetMs: input.offsetMs,
  });
  const tx = db.transaction((): TimeSyncResult => {
    insertTimeSyncRecord(db, record);
    const entry = appendEntry(db, { ts: record.checkedAt, actor: 'desktop', action: 'TIME_SYNC', payloadHash: computePayloadHash(record) });
    return { record, entry };
  });
  return tx();
}

export async function syncTime(
  db: Database.Database,
  opts: { host?: string; offsetFn?: () => Promise<number> } = {},
): Promise<TimeSyncResult> {
  const host = opts.host ?? 'ntp.aliyun.com';
  const offsetFn = opts.offsetFn ?? (async () => await Sntp.offset({ host, timeout: 5000 }));
  const offsetMs = await offsetFn();
  return recordTimeSync(db, { ntpServer: host, offsetMs });
}
