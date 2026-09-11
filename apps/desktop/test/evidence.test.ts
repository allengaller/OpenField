import { describe, it, expect, afterAll } from 'vitest';
import { verifyChain } from '@openfield/core';
import { cleanupTestVault, makeTestVault } from './helpers';
import { appendEntry, getLastEntry, listEvidenceEntries, recordTimeSync } from '../src/main/services/evidence';

const { db, home } = makeTestVault();
afterAll(() => cleanupTestVault(home));

describe('appendEntry', () => {
  it('从 0 开始连续追加，链校验通过', () => {
    const e0 = appendEntry(db, { ts: 1757376000000, actor: 'desktop', action: 'CREATE_EVENT', payloadHash: 'a'.repeat(64) });
    const e1 = appendEntry(db, { ts: 1757376000001, actor: 'desktop', action: 'INGEST_ARTIFACT', payloadHash: 'b'.repeat(64) });
    expect(e0.seq).toBe(0);
    expect(e0.prevHash).toBe('0'.repeat(64));
    expect(e1.seq).toBe(1);
    expect(e1.prevHash).toBe(e0.entryHash);
    expect(verifyChain(listEvidenceEntries(db))).toEqual({ ok: true });
    expect(getLastEntry(db)?.seq).toBe(1);
  });

  it('直接改库篡改 entry_hash 会被 verifyChain 检出（DROP 触发器模拟越权篡改，A7）', () => {
    const tampered = makeTestVault();
    try {
      appendEntry(tampered.db, { ts: 1757376000000, actor: 'desktop', action: 'CREATE_EVENT', payloadHash: 'a'.repeat(64) });
      appendEntry(tampered.db, { ts: 1757376000001, actor: 'desktop', action: 'INGEST_ARTIFACT', payloadHash: 'b'.repeat(64) });
      tampered.db.exec('DROP TRIGGER evidence_log_no_update; DROP TRIGGER evidence_log_no_delete;');
      tampered.db.prepare('UPDATE evidence_log SET entry_hash = ? WHERE seq = 0').run('f'.repeat(64));
      const result = verifyChain(listEvidenceEntries(tampered.db));
      expect(result.ok).toBe(false);
    } finally {
      tampered.db.close();
      cleanupTestVault(tampered.home);
    }
  });
});

describe('recordTimeSync', () => {
  it('记录 TimeSyncRecord 并以 TIME_SYNC 入链', () => {
    const before = listEvidenceEntries(db).length;
    const { record, entry } = recordTimeSync(db, { ntpServer: 'test.pool', offsetMs: -320, ts: 1757376100000 });
    expect(record.id).toBeTruthy();
    expect(record.offsetMs).toBe(-320);
    expect(entry.action).toBe('TIME_SYNC');
    expect(listEvidenceEntries(db).length).toBe(before + 1);
  });
});
