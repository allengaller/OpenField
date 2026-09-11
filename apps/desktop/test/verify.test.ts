import { describe, it, expect } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupTestVault, makeTestVault } from './helpers';
import { ingestFile } from '../src/main/services/ingest';
import { listArtifacts } from '../src/main/services/repos';
import { runVerify } from '../src/main/services/verify';

async function seededVault(): Promise<{ home: string; originalsRoot: string; db: ReturnType<typeof makeTestVault>['db'] }> {
  const { db, paths, home } = makeTestVault();
  const fixDir = mkdtempSync(join(tmpdir(), 'of-vfy-'));
  const src = join(fixDir, 'a.wav');
  writeFileSync(src, 'V'.repeat(256));
  await ingestFile(db, paths.originalsRoot, { sourcePath: src, mime: 'audio/wav', type: 'audio', deviceId: 'desktop' });
  rmSync(fixDir, { recursive: true, force: true });
  return { home, originalsRoot: paths.originalsRoot, db };
}

describe('runVerify', () => {
  it('干净 vault：链完整、issues 为空', async () => {
    const { db, originalsRoot, home } = await seededVault();
    try {
      const report = await runVerify(db, originalsRoot);
      expect(report.chainOk).toBe(true);
      expect(report.chainBrokenAt).toBeNull();
      expect(report.issues).toEqual([]);
      expect(report.artifactCount).toBe(1);
    } finally {
      cleanupTestVault(home);
    }
  });

  it('原始件被改动 → hash-mismatch 指向该 artifact', async () => {
    const { db, originalsRoot, home } = await seededVault();
    try {
      const art = listArtifacts(db)[0]!;
      chmodSync(art.originalPath, 0o644);
      writeFileSync(art.originalPath, 'tampered-after-seal');
      const report = await runVerify(db, originalsRoot);
      expect(report.issues).toEqual([expect.objectContaining({ kind: 'hash-mismatch', artifactId: art.id })]);
    } finally {
      cleanupTestVault(home);
    }
  });

  it('原始件文件被删 → original-missing', async () => {
    const { db, originalsRoot, home } = await seededVault();
    try {
      const art = listArtifacts(db)[0]!;
      rmSync(art.originalPath);
      const report = await runVerify(db, originalsRoot);
      expect(report.issues).toEqual([expect.objectContaining({ kind: 'original-missing', artifactId: art.id })]);
    } finally {
      cleanupTestVault(home);
    }
  });

  it('originals 下出现未登记目录 → orphan-directory', async () => {
    const { db, originalsRoot, home } = await seededVault();
    try {
      mkdirSync(join(originalsRoot, 'not-an-artifact'));
      const report = await runVerify(db, originalsRoot);
      expect(report.issues).toEqual([expect.objectContaining({ kind: 'orphan-directory', path: expect.stringContaining('not-an-artifact') })]);
    } finally {
      cleanupTestVault(home);
    }
  });

  it('evidence_log 被篡改 → chainOk=false 且 brokenAt 定位到 seq', async () => {
    const { db, originalsRoot, home } = await seededVault();
    try {
      db.exec('DROP TRIGGER evidence_log_no_update; DROP TRIGGER evidence_log_no_delete;'); // A7：模拟越权篡改
      db.prepare('UPDATE evidence_log SET payload_hash = ? WHERE seq = 0').run('f'.repeat(64));
      const report = await runVerify(db, originalsRoot);
      expect(report.chainOk).toBe(false);
      expect(report.chainBrokenAt).toBe(0);
    } finally {
      cleanupTestVault(home);
    }
  });
});
