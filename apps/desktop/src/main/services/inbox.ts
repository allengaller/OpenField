import type Database from 'better-sqlite3-multiple-ciphers';
import { computePayloadHash, decodeBundle, type Bundle, type InboxStatus } from '@openfield/core';
import { appendEntry } from './evidence';
import { mkdir, readFile, rename, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  getInboxItemBySourcePath, insertConsentRecordIfAbsent, insertEncounterIfAbsent, insertFieldEventIfAbsent,
  insertInboxItem, insertMemoIfAbsent, insertParticipantIfAbsent, listFieldEvents,
} from './repos';

export interface InboxDirs {
  inboxDir: string;
  quarantineDir: string;
}

export interface ScanSummary {
  pending: number;
  quarantined: number;
  skippedIcloud: number;
  skippedEmpty: number;
  appliedBundles: number;
}

const ICLOUD_STUB = /^\..+\.icloud$/;

export function applyBundle(db: Database.Database, bundle: Bundle): void {
  const actor = `bundle:${bundle.id}`;
  const ts = bundle.createdAt;
  const tx = db.transaction(() => {
    for (const e of bundle.events) if (insertFieldEventIfAbsent(db, e)) appendEntry(db, { ts, actor, action: 'CREATE_EVENT', payloadHash: computePayloadHash(e) });
    for (const p of bundle.participants) if (insertParticipantIfAbsent(db, p)) appendEntry(db, { ts, actor, action: 'CREATE_PARTICIPANT', payloadHash: computePayloadHash(p) });
    for (const c of bundle.encounters) if (insertEncounterIfAbsent(db, c)) appendEntry(db, { ts, actor, action: 'CREATE_ENCOUNTER', payloadHash: computePayloadHash(c) });
    for (const c of bundle.consents) if (insertConsentRecordIfAbsent(db, c)) appendEntry(db, { ts, actor, action: 'CONSENT_RECORDED', payloadHash: computePayloadHash(c) });
    for (const m of bundle.memos) if (insertMemoIfAbsent(db, m)) appendEntry(db, { ts, actor, action: 'CREATE_MEMO', payloadHash: computePayloadHash(m) });
    for (const m of bundle.mediaRefs) {
      insertInboxItem(db, {
        id: `inbox-${randomUUID()}`,
        sourcePath: `bundle:${bundle.id}:${m.filename}`,
        detectedAt: bundle.createdAt,
        sha256: m.sha256,
        suggestedEncounterId: m.encounterId,
        status: 'pending' as InboxStatus,
      });
    }
  });
  tx();
}

function localDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function suggestEventId(db: Database.Database, mtimeMs: number): string | undefined {
  const date = localDate(mtimeMs);
  return listFieldEvents(db, date)[0]?.id;
}

export async function scanOnce(db: Database.Database, dirs: InboxDirs): Promise<ScanSummary> {
  const summary: ScanSummary = { pending: 0, quarantined: 0, skippedIcloud: 0, skippedEmpty: 0, appliedBundles: 0 };
  let names: string[];
  try {
    names = await readdir(dirs.inboxDir);
  } catch {
    return summary; // 目录不存在视为空
  }

  for (const name of names.sort()) {
    const full = join(dirs.inboxDir, name);
    const st = await stat(full);
    if (!st.isFile()) continue;
    if (ICLOUD_STUB.test(name)) {
      summary.skippedIcloud += 1; // iCloud 未下载完的占位文件：等它变成本体
      continue;
    }
    if (st.size === 0) {
      summary.skippedEmpty += 1; // macOS 14+ dataless 文件大小为 0：不当原始件
      continue;
    }
    if (getInboxItemBySourcePath(db, full, 'pending')) continue;

    if (name.endsWith('.ofbundle.json')) {
      try {
        const bundle = decodeBundle(await readFile(full, 'utf8'));
        applyBundle(db, bundle);
        insertInboxItem(db, { id: `inbox-${randomUUID()}`, sourcePath: full, detectedAt: Date.now(), status: 'ingested' });
        summary.appliedBundles += 1;
      } catch {
        await mkdir(dirs.quarantineDir, { recursive: true });
        const dest = join(dirs.quarantineDir, name);
        await rename(full, dest);
        insertInboxItem(db, { id: `inbox-${randomUUID()}`, sourcePath: dest, detectedAt: Date.now(), status: 'quarantined' });
        summary.quarantined += 1;
      }
      continue;
    }

    insertInboxItem(db, {
      id: `inbox-${randomUUID()}`,
      sourcePath: full,
      detectedAt: Date.now(),
      suggestedEventId: suggestEventId(db, st.mtimeMs),
      status: 'pending',
    });
    summary.pending += 1;
  }
  return summary;
}
