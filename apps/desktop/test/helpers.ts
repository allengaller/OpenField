import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3-multiple-ciphers';
import { openVault, resolveVaultPaths, type VaultPaths } from '../src/main/services/vault';

export const TEST_PASSPHRASE = 'test-passphrase-8';

export function makeTestVault(): { db: Database.Database; paths: VaultPaths; home: string } {
  const home = mkdtempSync(join(tmpdir(), 'of-vault-'));
  const paths = resolveVaultPaths(home);
  const db = openVault(paths, TEST_PASSPHRASE, true);
  for (const dir of [paths.originalsRoot, paths.inboxDir, paths.quarantineDir, paths.backupsDir]) {
    mkdirSync(dir, { recursive: true });
  }
  return { db, paths, home };
}

export function cleanupTestVault(home: string): void {
  rmSync(home, { recursive: true, force: true });
}
