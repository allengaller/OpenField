import { describe, it, expect } from 'vitest';
import { makeRefId, parseRefId } from '../src/refid';

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
  it('小写城市码 → 抛错', () => {
    expect(() => makeRefId({ date: '2026-09-09', cityCode: 'kmg', seq: 1 })).toThrow();
  });
  it('坏日期 → 抛错', () => {
    expect(() => makeRefId({ date: '2026-9-9', cityCode: 'KMG', seq: 1 })).toThrow(/YYYY-MM-DD/);
  });
  it('seq 超过 999 → 抛错', () => {
    expect(() => makeRefId({ date: '2026-09-09', cityCode: 'KMG', seq: 1000 })).toThrow(/seq/);
  });
  it('负偏移 → 抛错', () => {
    expect(() => makeRefId({ date: '2026-09-09', cityCode: 'KMG', seq: 1, offsetSeconds: -1 })).toThrow();
  });
  it('偏移超过 #T99:59 上限 → 抛错', () => {
    expect(() => makeRefId({ date: '2026-09-09', cityCode: 'KMG', seq: 1, offsetSeconds: 6000 })).toThrow();
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
  it('垃圾输入 → 抛错', () => {
    expect(() => parseRefId('OF-2026-KMG-1')).toThrow(/无法解析/);
  });
  it('非法分钟 #T99:99 → 抛错', () => {
    expect(() => parseRefId('OF-20260909-KMG-003#T99:99')).toThrow(/无法解析/);
  });
});
