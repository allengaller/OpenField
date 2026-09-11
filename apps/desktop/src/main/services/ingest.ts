import type Database from 'better-sqlite3-multiple-ciphers';
import { type Artifact, type ArtifactType } from '@openfield/core';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, copyFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { basename, join } from 'node:path';
import { appendEntry } from './evidence';
import { getArtifactBySha256, getInboxItem, insertArtifact, updateInboxItem } from './repos';

export class IngestError extends Error {
  constructor(readonly code: 'empty-file' | 'hash-mismatch' | 'unknown-ext' | 'io', message: string) {
    super(message);
  }
}

const EXT_MAP: Record<string, { type: ArtifactType; mime: string }> = {
  wav: { type: 'audio', mime: 'audio/wav' },
  mp3: { type: 'audio', mime: 'audio/mpeg' },
  m4a: { type: 'audio', mime: 'audio/mp4' },
  aac: { type: 'audio', mime: 'audio/aac' },
  jpg: { type: 'photo', mime: 'image/jpeg' },
  jpeg: { type: 'photo', mime: 'image/jpeg' },
  png: { type: 'photo', mime: 'image/png' },
  heic: { type: 'photo', mime: 'image/heic' },
  pdf: { type: 'doc', mime: 'application/pdf' },
  docx: { type: 'doc', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  txt: { type: 'note', mime: 'text/plain' },
  md: { type: 'note', mime: 'text/markdown' },
};

export function guessArtifactType(filename: string): { type: ArtifactType; mime: string } {
  const parts = filename.split('.');
  const ext = parts.length > 1 ? (parts.pop() ?? '').toLowerCase() : '';
  const hit = EXT_MAP[ext];
  if (!hit) throw new IngestError('unknown-ext', `无法识别的扩展名，拒绝猜测证据类型：${filename}`);
  return hit;
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export interface IngestInput {
  sourcePath: string;
  mime: string;
  type: ArtifactType;
  deviceId: string;
  capturedAt?: number;
  encounterId?: string;
  eventId?: string;
  refId?: string;
  artifactId?: string;
  ts?: number;
}

export type IngestResult = { status: 'ingested'; artifact: Artifact } | { status: 'duplicate'; artifact: Artifact };

export async function ingestFile(db: Database.Database, originalsRoot: string, input: IngestInput): Promise<IngestResult> {
  const st = await stat(input.sourcePath);
  if (!st.isFile()) throw new IngestError('io', `不是普通文件：${input.sourcePath}`);
  if (st.size === 0) throw new IngestError('empty-file', `空文件拒绝登记（疑似 iCloud 未下载完成的占位文件）：${input.sourcePath}`);

  const sha256 = await sha256File(input.sourcePath);
  const existing = getArtifactBySha256(db, sha256);
  if (existing) return { status: 'duplicate', artifact: existing };

  const artifactId = input.artifactId ?? `art-${randomUUID()}`;
  const artifactDir = join(originalsRoot, artifactId);
  const parts = basename(input.sourcePath).split('.');
  const ext = parts.length > 1 ? (parts.pop() ?? 'bin') : 'bin';
  const tmpPath = join(artifactDir, `.tmp-${randomUUID()}`);
  const finalPath = join(artifactDir, `v1.${ext}`);

  await mkdir(artifactDir, { recursive: true });
  try {
    await copyFile(input.sourcePath, tmpPath);
    const sealedHash = await sha256File(tmpPath);
    if (sealedHash !== sha256) {
      throw new IngestError('hash-mismatch', '封存过程中文件内容发生变化，拒绝登记');
    }
    await rename(tmpPath, finalPath);
    await chmod(finalPath, 0o444);

    const artifact: Artifact = {
      id: artifactId,
      ...(input.encounterId !== undefined ? { encounterId: input.encounterId } : {}),
      ...(input.eventId !== undefined ? { eventId: input.eventId } : {}),
      type: input.type,
      sha256,
      size: st.size,
      mime: input.mime,
      capturedAt: input.capturedAt ?? Math.floor(st.mtimeMs),
      deviceId: input.deviceId,
      version: 1,
      ...(input.refId !== undefined ? { refId: input.refId } : {}),
    };
    const tx = db.transaction(() => {
      insertArtifact(db, artifact, finalPath);
      appendEntry(db, { ts: input.ts ?? Date.now(), actor: 'desktop', action: 'INGEST_ARTIFACT', payloadHash: sha256 });
    });
    tx();
    return { status: 'ingested', artifact };
  } catch (err) {
    // 补偿：登记失败时删除已封存目录，避免孤儿（verify 也会兜底报告）
    await rm(artifactDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

export async function confirmInboxItem(
  db: Database.Database,
  originalsRoot: string,
  itemId: string,
  attribution: { deviceId: string; encounterId?: string; eventId?: string },
): Promise<Artifact> {
  const item = getInboxItem(db, itemId);
  if (!item) throw new IngestError('io', `InboxItem 不存在：${itemId}`);
  if (item.status !== 'pending') throw new IngestError('io', `InboxItem 状态为 ${item.status}，仅 pending 可确认`);
  const { type, mime } = guessArtifactType(item.sourcePath);
  const result = await ingestFile(db, originalsRoot, {
    sourcePath: item.sourcePath,
    mime,
    type,
    deviceId: attribution.deviceId,
    ...(attribution.encounterId !== undefined ? { encounterId: attribution.encounterId } : {}),
    ...(attribution.eventId !== undefined ? { eventId: attribution.eventId } : {}),
  });
  updateInboxItem(db, itemId, { status: 'ingested', sha256: result.artifact.sha256 });
  return result.artifact;
}

export function rejectInboxItem(db: Database.Database, itemId: string): void {
  const item = getInboxItem(db, itemId);
  if (!item) throw new IngestError('io', `InboxItem 不存在：${itemId}`);
  updateInboxItem(db, itemId, { status: 'rejected' });
}
