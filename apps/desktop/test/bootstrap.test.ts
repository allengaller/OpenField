import { describe, it, expect } from 'vitest';
import { CORE_VERSION } from '@openfield/core';
import Database from 'better-sqlite3-multiple-ciphers';

describe('脚手架接线', () => {
  it('workspace 依赖 @openfield/core 可解析', () => {
    expect(CORE_VERSION).toBe('0.1.0');
  });

  it('原生 sqlite 模块在纯 Node（vitest）下可加载', () => {
    const db = new Database(':memory:');
    expect(db.prepare('SELECT 1 AS one').get()).toEqual({ one: 1 });
    db.close();
  });
});
