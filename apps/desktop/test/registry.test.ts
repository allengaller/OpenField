import { describe, it, expect, afterAll } from 'vitest';
import { Encounter, FieldEvent, verifyChain } from '@openfield/core';
import { cleanupTestVault, makeTestVault } from './helpers';
import { listEvidenceEntries } from '../src/main/services/evidence';
import { insertConsentRecord, listMemos } from '../src/main/services/repos';
import { buildDailyJournal, confirmMemoWithEntry, createEncounterWithEntry, createEventWithEntry, withdrawConsentWithEntry } from '../src/main/services/registry';

const { db, home } = makeTestVault();
afterAll(() => cleanupTestVault(home));

const event = FieldEvent.parse({ id: 'evt-1', date: '2026-09-09', cityCode: 'KMG', locationName: '昆明篆新市场' });

describe('registry', () => {
  it('createEventWithEntry：INSERT 与 CREATE_EVENT 同事务入链', () => {
    const { entry } = createEventWithEntry(db, event, { ts: 1757376000000 });
    expect(entry.action).toBe('CREATE_EVENT');
    expect(entry.seq).toBe(0);
    expect(verifyChain(listEvidenceEntries(db)).ok).toBe(true);
    expect(() => createEventWithEntry(db, event)).toThrow(); // id 冲突
  });

  it('createEncounterWithEntry：要求 eventId 已存在', () => {
    const encounter = Encounter.parse({ id: 'enc-1', eventId: 'evt-1', participantRef: 'P01', samplingReason: '雪球引荐', startedAt: 1757376100000 });
    const { entry } = createEncounterWithEntry(db, encounter, { ts: 1757376100000 });
    expect(entry.action).toBe('CREATE_ENCOUNTER');
    expect(() => createEncounterWithEntry(db, Encounter.parse({ ...encounter, id: 'enc-2', eventId: 'evt-nope' }))).toThrow(/不存在/);
  });

  it('buildDailyJournal：聚合当日内容为 daily 草稿并入链 CREATE_MEMO，重复调用幂等且链长不变（A4）', () => {
    const memo = buildDailyJournal(db, '2026-09-09', { now: 1757462400000 });
    expect(memo.type).toBe('daily');
    expect(memo.confirmedAt).toBeNull();
    expect(memo.content).toContain('evt-1');
    expect(memo.content).toContain('enc-1');
    expect(listEvidenceEntries(db).at(-1)?.action).toBe('CREATE_MEMO');
    expect(verifyChain(listEvidenceEntries(db)).ok).toBe(true);
    const chainLen = listEvidenceEntries(db).length;
    const again = buildDailyJournal(db, '2026-09-09');
    expect(again.id).toBe(memo.id);
    expect(listEvidenceEntries(db).length).toBe(chainLen);
  });

  it('confirmMemoWithEntry：确认时间落库且 MEMO_CONFIRM 入链', () => {
    const memo = listMemos(db).find((m) => m.type === 'daily');
    expect(memo).toBeTruthy();
    const { memo: confirmed, entry } = confirmMemoWithEntry(db, memo!.id, { confirmedAt: 1757462500000 });
    expect(confirmed.confirmedAt).toBe(1757462500000);
    expect(entry.action).toBe('MEMO_CONFIRM');
    expect(verifyChain(listEvidenceEntries(db)).ok).toBe(true);
  });

  it('withdrawConsentWithEntry：撤回落库 + CONSENT_WITHDRAW 入链；重复撤回与未知 ID 拒绝', () => {
    insertConsentRecord(db, {
      id: 'consent-1',
      encounterId: 'enc-1',
      templateType: 'recording',
      scope: '仅用于学术研究',
      withdrawnAt: null,
    });
    const { consent, entry } = withdrawConsentWithEntry(db, 'consent-1', { ts: 1757462600000 });
    expect(consent.withdrawnAt).toBe(1757462600000);
    expect(entry.action).toBe('CONSENT_WITHDRAW');
    expect(verifyChain(listEvidenceEntries(db)).ok).toBe(true);
    expect(() => withdrawConsentWithEntry(db, 'consent-1')).toThrow(/已撤回/);
    expect(() => withdrawConsentWithEntry(db, 'consent-nope')).toThrow(/不存在/);
  });
});
