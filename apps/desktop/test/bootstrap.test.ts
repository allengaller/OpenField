import { describe, it, expect } from 'vitest';

describe('测试链路', () => {
  it('运行在 Electron 内嵌 Node 上（与 App 同 ABI）', () => {
    expect(process.versions.electron).toBeTruthy();
  });

  it('better-sqlite3-multiple-ciphers 原生模块可加载', async () => {
    const { default: Database } = await import('better-sqlite3-multiple-ciphers');
    const db = new Database(':memory:');
    expect(db.prepare('SELECT 1 AS one').get()).toEqual({ one: 1 });
    db.close();
  });
});
