import { describe, it, expect } from 'vitest';
import { sha256Hex, stableStringify, computePayloadHash } from '../src/canonical';

describe('sha256Hex', () => {
  it('已知向量 abc', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('对字节数组与等价字符串结果一致', () => {
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(sha256Hex('abc'));
  });
});

describe('stableStringify', () => {
  it('键顺序无关', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });
  it('跳过 undefined 值', () => {
    expect(stableStringify({ a: undefined, b: 1 })).toBe('{"b":1}');
  });
  it('嵌套对象键序也规范化', () => {
    expect(stableStringify({ x: { d: 1, c: 2 }, b: 1 })).toBe(stableStringify({ b: 1, x: { c: 2, d: 1 } }));
  });
  it('数组顺序保留（顺序有语义）', () => {
    expect(stableStringify([{ k: 'a' }, { k: 'b' }])).toBe('[{"k":"a"},{"k":"b"}]');
  });
  it('基本类型直通 JSON', () => {
    expect(stableStringify('x')).toBe('"x"');
    expect(stableStringify(42)).toBe('42');
    expect(stableStringify(null)).toBe('null');
  });
});

describe('computePayloadHash', () => {
  it('同对象不同键序哈希一致', () => {
    const a = { id: 'art-1', type: 'audio', size: 10 };
    const b = { size: 10, type: 'audio', id: 'art-1' };
    expect(computePayloadHash(a)).toBe(computePayloadHash(b));
  });
  it('内容不同则哈希不同', () => {
    expect(computePayloadHash({ size: 10 })).not.toBe(computePayloadHash({ size: 11 }));
  });
});
