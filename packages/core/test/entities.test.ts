import { describe, it, expect } from 'vitest';
import {
  CityCode, FieldEvent, Encounter, Artifact, Participant, EvidenceAction, EvidenceEntry, ConsentRecord,
  Memo, InboxItem, TimeSyncRecord,
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
  it('拒绝不存在的日历日期', () => {
    expect(FieldEvent.safeParse({ ...validEvent, date: '2026-02-31' }).success).toBe(false);
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
  it('拒绝大写 sha256', () => {
    expect(Artifact.safeParse({ ...validArtifact, sha256: 'A'.repeat(64) }).success).toBe(false);
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
  it('拒绝任何未知字段（含 camelCase realName）', () => {
    expect(Participant.safeParse({ pseudonym: 'P-001', realName: '张三' }).success).toBe(false);
  });
  it('接受合法档案', () => {
    const p = { pseudonym: 'P-001', industry: '菌子批发', referralChain: ['P-002'] };
    expect(Participant.parse(p).referralChain).toEqual(['P-002']);
  });
});

describe('EvidenceAction', () => {
  it('接受新增的 CREATE_PARTICIPANT 与 CREATE_MEMO', () => {
    expect(EvidenceAction.parse('CREATE_PARTICIPANT')).toBe('CREATE_PARTICIPANT');
    expect(EvidenceAction.parse('CREATE_MEMO')).toBe('CREATE_MEMO');
  });
  it('拒绝未定义的 action', () => {
    expect(EvidenceAction.safeParse('NOT_AN_ACTION').success).toBe(false);
  });
});

describe('EvidenceEntry', () => {
  const validEntry = {
    seq: 0,
    ts: 1757376000000,
    actor: 'desktop',
    action: 'INGEST_ARTIFACT',
    payloadHash: 'b'.repeat(64),
    prevHash: '0'.repeat(64),
    entryHash: 'c'.repeat(64),
  };
  it('接受合法链上条目', () => {
    expect(EvidenceEntry.parse(validEntry).action).toBe('INGEST_ARTIFACT');
  });
  it('拒绝未定义的 action', () => {
    const e = {
      seq: 0, ts: 1757376000000, actor: 'desktop', action: 'DELETE_EVERYTHING',
      payloadHash: 'b'.repeat(64), prevHash: '0'.repeat(64), entryHash: 'c'.repeat(64),
    };
    expect(EvidenceEntry.safeParse(e).success).toBe(false);
  });
  it.each(['u|v', 'u\nv', 'u\rv'])('拒绝 actor 含管道符或换行符 %s', (badActor) => {
    expect(EvidenceEntry.safeParse({ ...validEntry, actor: badActor }).success).toBe(false);
  });
  it('拒绝 129 字符 actor', () => {
    expect(EvidenceEntry.safeParse({ ...validEntry, actor: 'a'.repeat(129) }).success).toBe(false);
  });
  it('接受恰好 128 字符 actor（长度上界恰过）', () => {
    expect(EvidenceEntry.parse({ ...validEntry, actor: 'x'.repeat(128) }).actor).toHaveLength(128);
  });
  it('拒绝空串 actor', () => {
    expect(EvidenceEntry.safeParse({ ...validEntry, actor: '' }).success).toBe(false);
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

describe('Memo', () => {
  const validMemo = {
    id: 'memo-001',
    linkedArtifactIds: ['art-001'],
    type: 'reflexive',
    content: '第一天的反思笔记',
    createdAt: 1757376000000,
  };
  it('接受合法备忘且 confirmedAt 缺省为 null', () => {
    expect(Memo.parse(validMemo).confirmedAt).toBeNull();
  });
  it('拒绝非法备忘类型', () => {
    expect(Memo.safeParse({ ...validMemo, type: 'rant' }).success).toBe(false);
  });
});

describe('InboxItem', () => {
  const validItem = {
    id: 'inb-001',
    sourcePath: '/Volumes/SD/IMG_0001.MP4',
    detectedAt: 1757376000000,
    status: 'pending',
  };
  it('接受合法收件项', () => {
    expect(InboxItem.parse(validItem).status).toBe('pending');
  });
  it('拒绝非法状态', () => {
    expect(InboxItem.safeParse({ ...validItem, status: 'done' }).success).toBe(false);
  });
});

describe('TimeSyncRecord', () => {
  const validSync = {
    id: 'ts-001',
    checkedAt: 1757376000000,
    ntpServer: 'ntp.aliyun.com',
    offsetMs: -350,
  };
  it('接受负时钟偏移', () => {
    expect(TimeSyncRecord.parse(validSync).offsetMs).toBe(-350);
  });
  it('拒绝小数偏移', () => {
    expect(TimeSyncRecord.safeParse({ ...validSync, offsetMs: 1.5 }).success).toBe(false);
  });
});
