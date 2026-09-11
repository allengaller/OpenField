import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
import { Encounter, FieldEvent, verifyChain } from '@openfield/core';
import { cleanupTestVault, makeTestVault, TEST_PASSPHRASE } from './helpers';
import { ingestFile } from '../src/main/services/ingest';
import { listEvidenceEntries } from '../src/main/services/evidence';
import { insertEncounter, insertFieldEvent } from '../src/main/services/repos';
import { ExportError, exportBackup, makeCitation, readBackup } from '../src/main/services/export';

const { db, paths, home } = makeTestVault();
const fixDir = mkdtempSync(join(tmpdir(), 'of-exp-'));
const T0 = 1757376100000;

beforeAll(async () => {
  insertFieldEvent(db, FieldEvent.parse({ id: 'evt-1', date: '2026-09-09', cityCode: 'KMG', locationName: '斗南花市' }));
  insertEncounter(db, Encounter.parse({ id: 'enc-1', eventId: 'evt-1', participantRef: 'P01', samplingReason: '关键知情人', startedAt: T0 }));
  insertEncounter(db, Encounter.parse({ id: 'enc-2', eventId: 'evt-1', participantRef: 'P02', samplingReason: '对照样本', startedAt: T0 }));
});

afterAll(() => {
  rmSync(fixDir, { recursive: true, force: true });
  cleanupTestVault(home);
});

async function ingestFixture(name: string, capturedAt?: number, encounterId?: string) {
  const src = join(fixDir, name);
  writeFileSync(src, name);
  return ingestFile(db, paths.originalsRoot, {
    sourcePath: src, mime: 'audio/wav', type: 'audio', deviceId: 'desktop',
    ...(capturedAt !== undefined ? { capturedAt } : {}),
    ...(encounterId !== undefined ? { encounterId } : {}),
  });
}

describe('makeCitation', () => {
  it('seq 递增 + 偏移 = capturedAt-startedAt，EXPORT 入链', async () => {
    const r1 = await ingestFixture('a1.wav', T0 + 90_000, 'enc-1');
    const c1 = makeCitation(db, { artifactId: r1.artifact.id, actor: 'desktop', ts: T0 + 100_000 });
    expect(c1.refId).toBe('OF-20260909-KMG-001#T01:30');

    const r2 = await ingestFixture('a2.wav', T0 + 125_000, 'enc-1');
    const c2 = makeCitation(db, { artifactId: r2.artifact.id, actor: 'desktop' });
    expect(c2.refId).toBe('OF-20260909-KMG-002#T02:05');

    expect(listEvidenceEntries(db).at(-1)?.action).toBe('EXPORT');
    expect(verifyChain(listEvidenceEntries(db)).ok).toBe(true);
  });

  it('偏移夹取到 0-5999（早于访谈起点 → T00:00，超一小时 → T99:59）', async () => {
    const r3 = await ingestFixture('a3.wav', T0 - 5_000, 'enc-2');
    expect(makeCitation(db, { artifactId: r3.artifact.id, actor: 'desktop' }).refId).toMatch(/#T00:00$/);
    const r4 = await ingestFixture('a4.wav', T0 + 7_000_000, 'enc-2');
    expect(makeCitation(db, { artifactId: r4.artifact.id, actor: 'desktop' }).refId).toMatch(/#T99:59$/);
  });

  it('未挂访谈的采集物拒绝引用', async () => {
    const r5 = await ingestFixture('a5.wav');
    expect(() => makeCitation(db, { artifactId: r5.artifact.id, actor: 'desktop' })).toThrow(/未挂访谈/);
  });
});

describe('exportBackup / readBackup', () => {
  const outPath = join(paths.backupsDir, 'daily.ofbackup');

  it('加密容器可被正确口令解开，含 vault.db 与 originals', () => {
    exportBackup(db, paths, TEST_PASSPHRASE, outPath);
    const zip = new AdmZip(readBackup(outPath, TEST_PASSPHRASE));
    const names = zip.getEntries().map((e) => e.entryName);
    expect(names).toContain('vault.db');
    expect(names.some((n) => n.startsWith('originals/'))).toBe(true);
  });

  it('错误口令解包直接失败（GCM 认证拒绝）', () => {
    expect(() => readBackup(outPath, 'wrong-pass-999')).toThrow();
  });
});
