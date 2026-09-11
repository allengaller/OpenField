import type Database from 'better-sqlite3-multiple-ciphers';
import { computePayloadHash, makeRefId } from '@openfield/core';
import AdmZip from 'adm-zip';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appendEntry } from './evidence';
import { getArtifact, getEncounter, getFieldEvent, setArtifactRefId, type ArtifactRecord } from './repos';
import { backupVault, type VaultPaths } from './vault';

export class ExportError extends Error {
  constructor(readonly code: 'no-encounter' | 'no-event' | 'io', message: string) {
    super(message);
  }
}

export function makeCitation(
  db: Database.Database,
  input: { artifactId: string; actor: string; ts?: number },
): { refId: string; artifact: ArtifactRecord } {
  const artifact = getArtifact(db, input.artifactId);
  if (!artifact) throw new ExportError('io', `artifact 不存在：${input.artifactId}`);
  if (!artifact.encounterId) throw new ExportError('no-encounter', '采集物未挂访谈，无法定位引用时间与城市');
  const encounter = getEncounter(db, artifact.encounterId);
  if (!encounter) throw new ExportError('no-encounter', `encounter 不存在：${artifact.encounterId}`);
  const event = getFieldEvent(db, encounter.eventId);
  if (!event) throw new ExportError('no-event', `event 不存在：${encounter.eventId}`);

  const prefix = `OF-${event.date.replaceAll('-', '')}-${event.cityCode}-`;
  const counted = db.prepare('SELECT COUNT(*) AS n FROM artifacts WHERE ref_id LIKE ?').get(`${prefix}%`) as { n: number };
  const seq = counted.n + 1;
  const rawOffset = Math.floor((artifact.capturedAt - encounter.startedAt) / 1000);
  const offsetSeconds = Math.min(Math.max(rawOffset, 0), 5999);
  const refId = makeRefId({ date: event.date, cityCode: event.cityCode, seq, offsetSeconds });

  const tx = db.transaction(() => {
    setArtifactRefId(db, artifact.id, refId);
    appendEntry(db, {
      ts: input.ts ?? Date.now(),
      actor: input.actor,
      action: 'EXPORT',
      payloadHash: computePayloadHash({ artifactId: artifact.id, refId }),
    });
  });
  try {
    tx();
  } catch (err) {
    if (err instanceof Error && /UNIQUE constraint/.test(err.message)) {
      throw new ExportError('io', `引用 ID 冲突，请重试：${refId}`);
    }
    throw err;
  }
  return { refId, artifact: { ...artifact, refId } };
}

// 自研 OFBK1 容器：'OFBK1' + salt(16) + iv(12) + GCM tag(16) + AES-256-GCM(zip(vault.db 副本 + originals/))
const MAGIC = Buffer.from('OFBK1', 'ascii');

export function exportBackup(db: Database.Database, paths: VaultPaths, passphrase: string, outPath: string): void {
  if (existsSync(outPath)) throw new ExportError('io', `备份目标已存在：${outPath}`);
  const tmpDb = `${outPath}.tmp-vault.db`;
  backupVault(db, tmpDb);
  try {
    const zip = new AdmZip();
    zip.addFile('vault.db', readFileSync(tmpDb));
    zip.addLocalFolder(paths.originalsRoot, 'originals');

    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = scryptSync(passphrase, salt, 32);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(zip.toBuffer()), cipher.final()]);
    writeFileSync(outPath, Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), ciphertext]));
  } finally {
    rmSync(tmpDb, { force: true });
  }
}

export function readBackup(backupPath: string, passphrase: string): Buffer {
  const raw = readFileSync(backupPath);
  if (!raw.subarray(0, 5).equals(MAGIC)) throw new ExportError('io', '不是 OpenField 备份文件');
  const salt = raw.subarray(5, 21);
  const iv = raw.subarray(21, 33);
  const tag = raw.subarray(33, 49);
  const decipher = createDecipheriv('aes-256-gcm', scryptSync(passphrase, salt, 32), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(raw.subarray(49)), decipher.final()]);
}
