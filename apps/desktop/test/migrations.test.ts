import { describe, it, expect, afterAll } from 'vitest';
import Database from 'better-sqlite3-multiple-ciphers';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyMigrations } from '../src/main/services/migrations';

const dir = mkdtempSync(join(tmpdir(), 'of-mig-'));
const db = new Database(join(dir, 'plain.db'));
afterAll(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

function tableNames(db: Database.Database): string[] {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
}

describe('applyMigrations', () => {
  it('v1 建出全部 11 张表并记录版本', () => {
    applyMigrations(db);
    const names = tableNames(db);
    for (const t of ['field_events', 'encounters', 'artifacts', 'participants', 'participant_identity', 'consent_records', 'memos', 'inbox_items', 'time_sync_records', 'evidence_log', 'schema_migrations']) {
      expect(names).toContain(t);
    }
    const version = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number };
    expect(version.v).toBe(1);
  });

  it('重复执行幂等', () => {
    applyMigrations(db);
    expect(() => applyMigrations(db)).not.toThrow();
    const count = db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('artifacts.sha256 唯一、ref_id 唯一索引存在', () => {
    db.prepare("INSERT INTO artifacts (id, type, sha256, size, mime, captured_at, device_id, version, original_path) VALUES ('a1','audio','" + 'a'.repeat(64) + "',1,'audio/wav',1,'d',1,'/tmp/x')").run();
    expect(() =>
      db.prepare("INSERT INTO artifacts (id, type, sha256, size, mime, captured_at, device_id, version, original_path) VALUES ('a2','audio','" + 'a'.repeat(64) + "',1,'audio/wav',1,'d',1,'/tmp/y')").run(),
    ).toThrow();
  });

  it('evidence_log 追加只读：UPDATE/DELETE 被触发器拒绝（A1）', () => {
    db.prepare("INSERT INTO evidence_log (seq, ts, actor, action, payload_hash, prev_hash, entry_hash) VALUES (0, 1, 'test', 'TIME_SYNC', '" + 'a'.repeat(64) + "', '" + 'b'.repeat(64) + "', '" + 'c'.repeat(64) + "')").run();
    expect(() => db.prepare("UPDATE evidence_log SET actor = 'x'").run()).toThrow(/append-only/);
    expect(() => db.prepare('DELETE FROM evidence_log').run()).toThrow(/append-only/);
    const n = db.prepare('SELECT COUNT(*) AS n FROM evidence_log').get() as { n: number };
    expect(n.n).toBe(1);
  });
});
