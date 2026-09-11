import type Database from 'better-sqlite3-multiple-ciphers';
import { computePayloadHash, Encounter, FieldEvent, type EvidenceEntry, type Memo } from '@openfield/core';
import { appendEntry } from './evidence';
import {
  confirmMemo, insertEncounter, insertFieldEvent, insertMemo, listArtifacts, listArtifactsByEncounter,
  listEncountersByEvent, listFieldEvents, listMemos,
} from './repos';

export function createEventWithEntry(
  db: Database.Database,
  event: FieldEvent,
  opts: { ts?: number } = {},
): { event: FieldEvent; entry: EvidenceEntry } {
  const v = FieldEvent.parse(event);
  const ts = opts.ts ?? Date.now();
  const tx = db.transaction((): { event: FieldEvent; entry: EvidenceEntry } => {
    insertFieldEvent(db, v);
    const entry = appendEntry(db, { ts, actor: 'desktop', action: 'CREATE_EVENT', payloadHash: computePayloadHash(v) });
    return { event: v, entry };
  });
  try {
    return tx();
  } catch (err) {
    if (err instanceof Error && /UNIQUE constraint/.test(err.message)) {
      throw new Error(`FieldEvent 已存在：${v.id}`);
    }
    throw err;
  }
}

export function createEncounterWithEntry(
  db: Database.Database,
  encounter: Encounter,
  opts: { ts?: number } = {},
): { encounter: Encounter; entry: EvidenceEntry } {
  const v = Encounter.parse(encounter);
  const ts = opts.ts ?? Date.now();
  const tx = db.transaction((): { encounter: Encounter; entry: EvidenceEntry } => {
    const parent = db.prepare('SELECT id FROM field_events WHERE id = ?').get(v.eventId);
    if (!parent) throw new Error(`eventId 不存在：${v.eventId}`);
    insertEncounter(db, v);
    const entry = appendEntry(db, { ts, actor: 'desktop', action: 'CREATE_ENCOUNTER', payloadHash: computePayloadHash(v) });
    return { encounter: v, entry };
  });
  try {
    return tx();
  } catch (err) {
    if (err instanceof Error && /UNIQUE constraint/.test(err.message)) {
      throw new Error(`Encounter 已存在：${v.id}`);
    }
    throw err;
  }
}

function localTimeline(db: Database.Database, date: string): string {
  const events = listFieldEvents(db, date);
  const lines: string[] = [`${date} 田野日志（草稿，待人工补写反思）`];
  for (const e of events) {
    lines.push(`- 事件 ${e.id}：${e.cityCode} ${e.locationName}`);
    const encounters = listEncountersByEvent(db, e.id);
    for (const c of encounters) {
      lines.push(`  - 访谈 ${c.id}：受访者 ${c.participantRef}（${c.samplingReason}）`);
      for (const a of listArtifactsByEncounter(db, c.id)) {
        lines.push(`    - 采集物 ${a.id}（${a.type}，sha256 前 8 位 ${a.sha256.slice(0, 8)}）`);
      }
    }
  }
  const total = listArtifacts(db).filter((a) => {
    if (a.encounterId) return false; // 已随访谈列出
    const owner = a.eventId ? listFieldEvents(db).find((e) => e.id === a.eventId) : undefined;
    return owner?.date === date;
  }).length;
  lines.push(`- 未挂访谈的当日采集物：${total} 份`);
  return lines.join('\n');
}

export function buildDailyJournal(db: Database.Database, date: string, opts: { now?: number } = {}): Memo {
  const existing = listMemos(db).find((m) => m.type === 'daily' && m.id === `journal-${date}`);
  if (existing) return existing;
  const now = opts.now ?? Date.now();
  const memo: Memo = {
    id: `journal-${date}`,
    linkedArtifactIds: [],
    type: 'daily',
    content: localTimeline(db, date),
    createdAt: now,
    confirmedAt: null,
  };
  const tx = db.transaction((): Memo => {
    insertMemo(db, memo);
    appendEntry(db, { ts: now, actor: 'desktop', action: 'CREATE_MEMO', payloadHash: computePayloadHash(memo) });
    return memo;
  });
  return tx();
}

export function confirmMemoWithEntry(
  db: Database.Database,
  memoId: string,
  opts: { confirmedAt?: number } = {},
): { memo: Memo; entry: EvidenceEntry } {
  const confirmedAt = opts.confirmedAt ?? Date.now();
  const tx = db.transaction((): { memo: Memo; entry: EvidenceEntry } => {
    const memo = confirmMemo(db, memoId, confirmedAt);
    const entry = appendEntry(db, { ts: confirmedAt, actor: 'desktop', action: 'MEMO_CONFIRM', payloadHash: computePayloadHash(memo) });
    return { memo, entry };
  });
  return tx();
}
