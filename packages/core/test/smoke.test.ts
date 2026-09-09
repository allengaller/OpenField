import { describe, it, expect } from 'vitest';
import { CORE_VERSION } from '../src/index';

describe('脚手架接线', () => {
  it('TS + vitest + 模块解析全链路可用', () => {
    expect(CORE_VERSION).toBe('0.1.0');
  });
});
