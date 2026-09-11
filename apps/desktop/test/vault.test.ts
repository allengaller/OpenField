import { describe, it, expect, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupTestVault, makeTestVault, TEST_PASSPHRASE } from './helpers';
import { backupVault, closeVault, openVault, resolveVaultPaths, VaultError } from '../src/main/services/vault';

const home = makeTestVault().home;
afterAll(() => cleanupTestVault(home));

describe('openVault', () => {
  it('创建 → 关闭 → 重开，数据仍在（加密持久化）', () => {
    const paths = resolveVaultPaths(join(home, 'v1'));
    const db = openVault(paths, TEST_PASSPHRASE, true);
    db.prepare("INSERT INTO field_events (id, date, city_code, location_name) VALUES ('e1','2026-09-09','KMG','昆明')").run();
    closeVault(db);
    expect(existsSync(paths.vaultDb)).toBe(true);

    const reopened = openVault(paths, TEST_PASSPHRASE, false);
    const row = reopened.prepare("SELECT location_name FROM field_events WHERE id='e1'").get() as { location_name: string };
    expect(row.location_name).toBe('昆明');
    closeVault(reopened);
  });

  it('错误口令被探测并拒绝（不是静默损坏）', () => {
    const paths = resolveVaultPaths(join(home, 'v2'));
    closeVault(openVault(paths, TEST_PASSPHRASE, true));
    expect(() => openVault(paths, 'wrong-pass-0001', false)).toThrow(VaultError);
    try {
      openVault(paths, 'wrong-pass-0001', false);
    } catch (err) {
      expect((err as VaultError).code).toBe('wrong-key');
    }
  });

  it('口令短于 8 字符直接拒绝', () => {
    const paths = resolveVaultPaths(join(home, 'v3'));
    expect(() => openVault(paths, 'short', true)).toThrow(/至少 8 个字符/);
  });
});

describe('backupVault', () => {
  it('VACUUM INTO 产出加密备份文件，可用正确口令重开', () => {
    const paths = resolveVaultPaths(join(home, 'v4'));
    const db = openVault(paths, TEST_PASSPHRASE, true);
    const outPath = join(paths.backupsDir, 'backup.db');
    backupVault(db, outPath);
    expect(existsSync(outPath)).toBe(true);
    closeVault(db);

    const restored = openVault({ ...paths, vaultDb: outPath }, TEST_PASSPHRASE, false);
    expect(restored.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()).toBeTruthy();
    closeVault(restored);
  });

  it('目标已存在时拒绝覆盖', () => {
    const paths = resolveVaultPaths(join(home, 'v5'));
    const db = openVault(paths, TEST_PASSPHRASE, true);
    const outPath = join(paths.backupsDir, 'dup.db');
    backupVault(db, outPath);
    expect(() => backupVault(db, outPath)).toThrow(/已存在/);
    closeVault(db);
  });
});
