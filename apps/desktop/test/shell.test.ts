import { describe, it, expect, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupTestVault } from './helpers';
import { listInboxItems } from '../src/main/services/repos';
import { VaultError } from '../src/main/services/vault';
import { AppState } from '../src/main/state';
import { createIpcHandlers } from '../src/main/ipc';
import { startInboxWatcher } from '../src/main/watcher';
import { resolveHome } from '../src/main/home';

const home = mkdtempSync(join(tmpdir(), 'of-shell-'));
afterAll(() => cleanupTestVault(home));

describe('resolveHome', () => {
  it('解析 --openfield-home= 参数，缺省回退', () => {
    expect(resolveHome(['electron', '.', '--openfield-home=/tmp/ofx'], 'fallback')).toBe('/tmp/ofx');
    expect(resolveHome(['electron', '.'], 'fallback')).toBe('fallback');
    expect(resolveHome(['--openfield-home='], 'fallback')).toBe('fallback');
  });
});

describe('AppState', () => {
  it('create → status unlocked → close → reopen，错口令抛 VaultError', () => {
    const state = new AppState(join(home, 's1'));
    expect(state.status().unlocked).toBe(false);
    state.createVault('passphrase-1234');
    expect(state.status()).toMatchObject({ hasVault: true, unlocked: true });
    state.close();
    expect(state.status().unlocked).toBe(false);

    state.openVault('passphrase-1234');
    expect(state.unlocked).toBe(true);
    state.close();

    expect(() => new AppState(join(home, 's1')).openVault('wrong-pass-999')).toThrow(VaultError);
  });

  it('未解锁时 getDb 抛错', () => {
    const state = new AppState(join(home, 's2'));
    expect(() => state.getDb()).toThrow(/未解锁/);
  });
});

describe('createIpcHandlers 端到端（main 进程同款调用序列）', () => {
  it('建库 → 登记 → 扫描 → 确认 → 校验 → 引用 全链 ok:true', async () => {
    const state = new AppState(join(home, 's3'));
    const h = createIpcHandlers(state);

    const created = await h['vault:create']({ passphrase: 'passphrase-1234' });
    expect(created).toMatchObject({ ok: true });

    expect(await h['events:create']({ id: 'evt-1', date: '2026-09-11', cityCode: 'KMG', locationName: '篆新市场' })).toMatchObject({ ok: true });
    expect(await h['encounters:create']({ id: 'enc-1', eventId: 'evt-1', participantRef: 'P01', samplingReason: '目的性抽样', startedAt: Date.now() })).toMatchObject({ ok: true });

    writeFileSync(join(state.paths.inboxDir, 'rec.wav'), Buffer.from('S'.repeat(128)));
    const scan = await h['inbox:scan'](undefined);
    expect(scan).toMatchObject({ ok: true });

    const pending = (await h['inbox:list']({ status: 'pending' })) as { ok: true; data: { id: string }[] };
    expect(pending.data).toHaveLength(1);
    const confirmed = await h['inbox:confirm']({ itemId: pending.data[0]!.id, encounterId: 'enc-1' });
    expect(confirmed).toMatchObject({ ok: true });

    const verify = (await h['verify:run'](undefined)) as { ok: true; data: { chainOk: boolean; issues: unknown[] } };
    expect(verify.data.chainOk).toBe(true);
    expect(verify.data.issues).toEqual([]);

    const artifactId = (confirmed as { ok: true; data: { id: string } }).data.id;
    const cite = await h['citation:make']({ artifactId });
    expect(cite.ok).toBe(true);

    state.close();
  });

  it('非法入参 → ok:false + 错误信息（不抛穿 IPC 边界）', async () => {
    const state = new AppState(join(home, 's4'));
    const h = createIpcHandlers(state);
    const bad = await h['events:create']({ oops: true });
    expect(bad).toEqual({ ok: false, error: expect.stringMatching(/.+/) });
    state.close();
  });
});

describe('startInboxWatcher', () => {
  it('inbox 落入新文件 → 防抖后自动 scanOnce', async () => {
    const state = new AppState(join(home, 's5'));
    state.createVault('passphrase-1234');
    const summaries: unknown[] = [];
    const stop = startInboxWatcher(state, (s) => summaries.push(s));
    try {
      writeFileSync(join(state.paths.inboxDir, 'watched.wav'), Buffer.from('W'.repeat(64)));
      await vi.waitFor(() => expect(listInboxItems(state.getDb(), 'pending')).toHaveLength(1), { timeout: 5_000, interval: 100 });
    } finally {
      stop();
      state.close();
    }
  });
});
