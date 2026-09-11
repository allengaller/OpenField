import { describe, it, expect } from 'vitest';
import { makeRefId, parseRefId, RefIdError } from '../src/refid';

describe('makeRefId', () => {
  it('基础格式（README 示例结构）', () => {
    expect(makeRefId({ date: '2026-09-09', cityCode: 'KMG', seq: 3 })).toBe('OF-20260909-KMG-003');
  });
  it('带录音内时间偏移 754s → #T12:34', () => {
    expect(makeRefId({ date: '2026-09-09', cityCode: 'KMG', seq: 3, offsetSeconds: 754 })).toBe(
      'OF-20260909-KMG-003#T12:34',
    );
  });
  it('偏移 0 → #T00:00', () => {
    expect(makeRefId({ date: '2026-09-09', cityCode: 'KMG', seq: 1, offsetSeconds: 0 })).toBe(
      'OF-20260909-KMG-001#T00:00',
    );
  });
  it('seq 下界 0 → 含 -000', () => {
    expect(makeRefId({ date: '2026-09-09', cityCode: 'KMG', seq: 0 })).toBe('OF-20260909-KMG-000');
  });
  it('seq 上界 999 → 含 -999', () => {
    expect(makeRefId({ date: '2026-09-09', cityCode: 'KMG', seq: 999 })).toBe('OF-20260909-KMG-999');
  });
  it('seq 非整数 1.5 → 抛 RefIdError', () => {
    expect(() => makeRefId({ date: '2026-09-09', cityCode: 'KMG', seq: 1.5 })).toThrow(RefIdError);
  });
  it('seq 负数 -1 → 抛 RefIdError', () => {
    expect(() => makeRefId({ date: '2026-09-09', cityCode: 'KMG', seq: -1 })).toThrow(RefIdError);
  });
  it('小写城市码 → 抛错', () => {
    expect(() => makeRefId({ date: '2026-09-09', cityCode: 'kmg', seq: 1 })).toThrow(RefIdError);
  });
  it('坏日期 → 抛错', () => {
    expect(() => makeRefId({ date: '2026-9-9', cityCode: 'KMG', seq: 1 })).toThrow(/YYYY-MM-DD/);
  });
  it('不存在的日历日期 → 抛错', () => {
    expect(() => makeRefId({ date: '2026-02-31', cityCode: 'KMG', seq: 1 })).toThrow(/YYYY-MM-DD/);
  });
  it('seq 超过 999 → 抛错', () => {
    expect(() => makeRefId({ date: '2026-09-09', cityCode: 'KMG', seq: 1000 })).toThrow(/seq/);
  });
  it('负偏移 → 抛错', () => {
    expect(() => makeRefId({ date: '2026-09-09', cityCode: 'KMG', seq: 1, offsetSeconds: -1 })).toThrow(RefIdError);
  });
  it('偏移超过 #T99:59 上限 → 抛错', () => {
    expect(() => makeRefId({ date: '2026-09-09', cityCode: 'KMG', seq: 1, offsetSeconds: 6000 })).toThrow(RefIdError);
  });
  it('offsetSeconds 非整数 1.5 → 抛 RefIdError（引用 ID 会被印进论文，禁畸形 #T00:01.5）', () => {
    expect(() => makeRefId({ date: '2026-09-09', cityCode: 'KMG', seq: 1, offsetSeconds: 1.5 })).toThrow(RefIdError);
  });
  it('offsetSeconds 非整数 -0.5 → 抛 RefIdError', () => {
    expect(() => makeRefId({ date: '2026-09-09', cityCode: 'KMG', seq: 1, offsetSeconds: -0.5 })).toThrow(RefIdError);
  });
});

describe('parseRefId', () => {
  it('解析基础 ID', () => {
    expect(parseRefId('OF-20260909-KMG-003')).toEqual({
      date: '2026-09-09', cityCode: 'KMG', seq: 3, offsetSeconds: undefined,
    });
  });
  it('解析带时间偏移的 ID', () => {
    expect(parseRefId('OF-20260909-KMG-003#T12:34').offsetSeconds).toBe(754);
  });
  it('make → parse 往返等值', () => {
    const id = makeRefId({ date: '2026-09-09', cityCode: 'KMG', seq: 42, offsetSeconds: 61 });
    expect(parseRefId(id)).toEqual({ date: '2026-09-09', cityCode: 'KMG', seq: 42, offsetSeconds: 61 });
  });
  it('偏移 3600s → #T60:00 往返', () => {
    const id = makeRefId({ date: '2026-09-09', cityCode: 'KMG', seq: 7, offsetSeconds: 3600 });
    expect(id).toBe('OF-20260909-KMG-007#T60:00');
    expect(parseRefId(id).offsetSeconds).toBe(3600);
  });
  it('偏移 5999s → #T99:59 往返', () => {
    const id = makeRefId({ date: '2026-09-09', cityCode: 'KMG', seq: 7, offsetSeconds: 5999 });
    expect(id).toBe('OF-20260909-KMG-007#T99:59');
    expect(parseRefId(id).offsetSeconds).toBe(5999);
  });
  it('垃圾输入 → 抛错', () => {
    expect(() => parseRefId('OF-2026-KMG-1')).toThrow(/无法解析/);
  });
  it('非法分钟 #T99:99 → 抛错', () => {
    expect(() => parseRefId('OF-20260909-KMG-003#T99:99')).toThrow(/无法解析/);
  });
  it('不存在的日历日期 → 抛错', () => {
    expect(() => parseRefId('OF-20260231-KMG-003')).toThrow(/无法解析/);
  });
});

// 错误统一：所有非法输入一律抛 RefIdError（不再混入 ZodError），调用方可单点捕获。
describe('错误统一', () => {
  it.each([
    ['make：小写城市码', () => makeRefId({ date: '2026-09-09', cityCode: 'kmg', seq: 1 })],
    ['make：不存在的日历日期', () => makeRefId({ date: '2026-02-31', cityCode: 'KMG', seq: 1 })],
    ['make：非整数 seq', () => makeRefId({ date: '2026-09-09', cityCode: 'KMG', seq: 1.5 })],
    ['make：offsetSeconds 超过 5999', () => makeRefId({ date: '2026-09-09', cityCode: 'KMG', seq: 1, offsetSeconds: 6000 })],
    ['parse：垃圾输入', () => parseRefId('OF-2026-KMG-1')],
    ['parse：非法分钟 #T99:99', () => parseRefId('OF-20260909-KMG-003#T99:99')],
    ['parse：不存在的日历日期', () => parseRefId('OF-20260231-KMG-001')],
  ])('%s → RefIdError', (_name, trigger) => {
    // try/catch 捕获错误对象：除类型外钉住 Error.name 覆写（防止 name 回退为 'Error'）。
    try {
      trigger();
    } catch (e) {
      expect(e).toBeInstanceOf(RefIdError);
      expect((e as RefIdError).name).toBe('RefIdError');
      return;
    }
    throw new Error('预期抛出 RefIdError');
  });
});
