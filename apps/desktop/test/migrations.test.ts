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
    db.prepare("INSERT INTO artifacts (id, type, sha256, size, mime, captured_at, device_id, version, ref_id, original_path) VALUES ('r1','audio','" + 'b'.repeat(64) + "',1,'audio/wav',1,'d',1,'ref-1','/tmp/r1')").run();
    expect(() =>
      db.prepare("INSERT INTO artifacts (id, type, sha256, size, mime, captured_at, device_id, version, ref_id, original_path) VALUES ('r2','audio','" + 'c'.repeat(64) + "',1,'audio/wav',1,'d',1,'ref-1','/tmp/r2')").run(),
    ).toThrow();
    db.prepare("INSERT INTO artifacts (id, type, sha256, size, mime, captured_at, device_id, version, ref_id, original_path) VALUES ('n1','audio','" + 'd'.repeat(64) + "',1,'audio/wav',1,'d',1,NULL,'/tmp/n1')").run();
    db.prepare("INSERT INTO artifacts (id, type, sha256, size, mime, captured_at, device_id, version, ref_id, original_path) VALUES ('n2','audio','" + 'e'.repeat(64) + "',1,'audio/wav',1,'d',1,NULL,'/tmp/n2')").run();
    const nullRefs = db.prepare('SELECT COUNT(*) AS n FROM artifacts WHERE ref_id IS NULL').get() as { n: number };
    expect(nullRefs.n).toBe(3);
  });

  it('evidence_log 追加只读：UPDATE/DELETE 被触发器拒绝（A1）', () => {
    db.prepare("INSERT INTO evidence_log (seq, ts, actor, action, payload_hash, prev_hash, entry_hash) VALUES (0, 1, 'test', 'TIME_SYNC', '" + 'a'.repeat(64) + "', '" + 'b'.repeat(64) + "', '" + 'c'.repeat(64) + "')").run();
    expect(() => db.prepare("UPDATE evidence_log SET actor = 'x'").run()).toThrow(/append-only/);
    expect(() => db.prepare('DELETE FROM evidence_log').run()).toThrow(/append-only/);
    const n = db.prepare('SELECT COUNT(*) AS n FROM evidence_log').get() as { n: number };
    expect(n.n).toBe(1);
  });

  it('外键强制：孤儿 encounter 与孤儿 identity 被拒绝', () => {
    expect(() =>
      db.prepare("INSERT INTO encounters (id, event_id, participant_ref, sampling_reason, started_at) VALUES ('orphan-enc','no-such-event','p1','random',1)").run(),
    ).toThrow();
    expect(() =>
      db.prepare("INSERT INTO participant_identity (pseudonym, real_name, created_at) VALUES ('no-such-pseudonym','real-name',1)").run(),
    ).toThrow();
  });
});
