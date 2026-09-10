import { describe, it, expect } from 'vitest';
import {
  CityCode, FieldEvent, Encounter, Artifact, Participant, EvidenceEntry, ConsentRecord,
} from '../src/entities';

const validEvent = {
  id: 'evt-2026-09-09-kunming-01',
  date: '2026-09-09',
  cityCode: 'KMG',
  locationName: '昆明篆新农贸市场',
  gps: { lat: 25.0301, lng: 102.7092 },
  contextNote: '早市观察，跟随摊主进货路线',
};

describe('FieldEvent', () => {
  it('接受合法事件', () => {
    expect(FieldEvent.parse(validEvent)).toMatchObject({ cityCode: 'KMG' });
  });
  it('拒绝非法日期', () => {
    expect(FieldEvent.safeParse({ ...validEvent, date: '2026-9-9' }).success).toBe(false);
  });
});

describe('CityCode', () => {
  it.each(['kmg', 'KM', 'KMG1', ''])('拒绝非法城市码 %s', (bad) => {
    expect(CityCode.safeParse(bad).success).toBe(false);
  });
});

describe('Artifact', () => {
  const validArtifact = {
    id: 'art-001',
    type: 'audio',
    sha256: 'a'.repeat(64),
    size: 1048576,
    mime: 'audio/mp4',
    capturedAt: 1757376000000,
    deviceId: 'iphone-01',
  };
  it('version 缺省为 1', () => {
    expect(Artifact.parse(validArtifact).version).toBe(1);
  });
  it('拒绝非法 sha256', () => {
    expect(Artifact.safeParse({ ...validArtifact, sha256: 'xyz' }).success).toBe(false);
  });
  it('拒绝非法类型', () => {
    expect(Artifact.safeParse({ ...validArtifact, type: 'video' }).success).toBe(false);
  });
});

describe('Encounter', () => {
  const validEncounter = {
    id: 'enc-001',
    eventId: 'evt-2026-09-09-kunming-01',
    participantRef: 'P-001',
    samplingReason: '滚雪球：由 P-002 引荐，经营菌子批发 12 年',
    startedAt: 1757376000000,
  };
  it('接受合法访谈', () => {
    expect(Encounter.parse(validEncounter).participantRef).toBe('P-001');
  });
  it('拒绝空 samplingReason', () => {
    expect(Encounter.safeParse({ ...validEncounter, samplingReason: '' }).success).toBe(false);
  });
});

describe('Participant 隐私边界', () => {
  it('strict 模式拒绝携带 real_name', () => {
    const withRealName = { pseudonym: 'P-001', real_name: '张三' };
    expect(Participant.safeParse(withRealName).success).toBe(false);
  });
  it('接受合法档案', () => {
    const p = { pseudonym: 'P-001', industry: '菌子批发', referralChain: ['P-002'] };
    expect(Participant.parse(p).referralChain).toEqual(['P-002']);
  });
});

describe('EvidenceEntry', () => {
  it('接受合法链上条目', () => {
    const e = {
      seq: 0,
      ts: 1757376000000,
      actor: 'desktop',
      action: 'INGEST_ARTIFACT',
      payloadHash: 'b'.repeat(64),
      prevHash: '0'.repeat(64),
      entryHash: 'c'.repeat(64),
    };
    expect(EvidenceEntry.parse(e).action).toBe('INGEST_ARTIFACT');
  });
  it('拒绝未定义的 action', () => {
    const e = {
      seq: 0, ts: 1757376000000, actor: 'desktop', action: 'DELETE_EVERYTHING',
      payloadHash: 'b'.repeat(64), prevHash: '0'.repeat(64), entryHash: 'c'.repeat(64),
    };
    expect(EvidenceEntry.safeParse(e).success).toBe(false);
  });
});

describe('ConsentRecord', () => {
  it('withdrawnAt 缺省为 null', () => {
    const c = {
      id: 'con-001', encounterId: 'enc-001', templateType: 'recording', scope: '仅学术研究使用',
    };
    expect(ConsentRecord.parse(c).withdrawnAt).toBeNull();
  });
  it('拒绝非法模板类型', () => {
    const c = { id: 'con-001', encounterId: 'enc-001', templateType: 'verbal_only', scope: 'x' };
    expect(ConsentRecord.safeParse(c).success).toBe(false);
  });
});
