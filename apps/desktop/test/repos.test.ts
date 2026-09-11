import { describe, it, expect, afterAll } from 'vitest';
import { Artifact, FieldEvent, InboxItem, Participant } from '@openfield/core';
import { cleanupTestVault, makeTestVault } from './helpers';
import {
  getArtifact, getArtifactBySha256, getFieldEvent, getInboxItemBySourcePath, getParticipant,
  getRealName, insertArtifact, insertFieldEvent, insertInboxItem, setRealName, upsertParticipant,
} from '../src/main/services/repos';

const { db, home } = makeTestVault();
afterAll(() => cleanupTestVault(home));

const event = FieldEvent.parse({ id: 'evt-1', date: '2026-09-09', cityCode: 'KMG', locationName: '昆明篆新市场', gps: { lat: 25.03, lng: 102.71 } });
const artifact = Artifact.parse({
  id: 'art-1', type: 'audio', sha256: 'b'.repeat(64), size: 1024, mime: 'audio/wav',
  capturedAt: 1757376000000, deviceId: 'desktop', version: 1, refId: 'OF-20260909-KMG-001',
});

describe('repos', () => {
  it('FieldEvent 往返（gps 拆列）', () => {
    insertFieldEvent(db, event);
    expect(getFieldEvent(db, 'evt-1')).toEqual(event);
    expect(getFieldEvent(db, 'nope')).toBeNull();
  });

  it('Artifact 往返 + 按 sha256 查询 + originalPath 额外列', () => {
    insertArtifact(db, artifact, '/tmp/originals/art-1/v1.wav');
    const got = getArtifact(db, 'art-1');
    expect(got).toEqual({ ...artifact, originalPath: '/tmp/originals/art-1/v1.wav' });
    expect(getArtifactBySha256(db, 'b'.repeat(64))?.id).toBe('art-1');
    expect(getArtifactBySha256(db, 'c'.repeat(64))).toBeNull();
  });

  it('重复 sha256 被唯一约束拒绝', () => {
    expect(() => insertArtifact(db, { ...artifact, id: 'art-2' }, '/tmp/x')).toThrow();
  });

  it('Participant strict：类型层面拒绝 real_name 等多余字段', () => {
    upsertParticipant(db, Participant.parse({ pseudonym: 'P01', industry: '蔬菜批发' }));
    expect(getParticipant(db, 'P01')?.industry).toBe('蔬菜批发');
  });

  it('real_name 只存在于 participant_identity，读需显式函数', () => {
    setRealName(db, 'P01', '张三', 1757376000000);
    expect(getRealName(db, 'P01')).toBe('张三');
    expect(getRealName(db, 'P404')).toBeNull();
  });

  it('InboxItem 按 sourcePath+status 查询', () => {
    const item = InboxItem.parse({ id: 'inb-1', sourcePath: '/tmp/inbox/a.wav', detectedAt: 1757376000000, status: 'pending' });
    insertInboxItem(db, item);
    expect(getInboxItemBySourcePath(db, '/tmp/inbox/a.wav', 'pending')?.id).toBe('inb-1');
    expect(getInboxItemBySourcePath(db, '/tmp/inbox/a.wav', 'ingested')).toBeNull();
  });
});
