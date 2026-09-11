import { CityCode } from './entities';

export interface RefIdParts {
  date: string;
  cityCode: string;
  seq: number;
  offsetSeconds?: number;
}

export interface ParsedRefId {
  date: string;
  cityCode: string;
  seq: number;
  offsetSeconds?: number;
}

export function makeRefId(parts: RefIdParts): string {
  const city = CityCode.parse(parts.cityCode);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parts.date)) {
    throw new Error(`日期格式须为 YYYY-MM-DD：${parts.date}`);
  }
  if (!Number.isInteger(parts.seq) || parts.seq < 0 || parts.seq > 999) {
    throw new Error(`seq 须为 0-999 整数：${parts.seq}`);
  }
  const base = `OF-${parts.date.replaceAll('-', '')}-${city}-${String(parts.seq).padStart(3, '0')}`;
  if (parts.offsetSeconds === undefined) return base;
  if (parts.offsetSeconds < 0 || parts.offsetSeconds > 5999) {
    throw new Error(`offsetSeconds 须在 0-5999（#T99:59 上限）：${parts.offsetSeconds}`);
  }
  const m = Math.floor(parts.offsetSeconds / 60);
  const s = parts.offsetSeconds % 60;
  return `${base}#T${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function parseRefId(refId: string): ParsedRefId {
  const m = /^OF-(\d{4})(\d{2})(\d{2})-([A-Z]{3})-(\d{3})(?:#T(\d{2}):(\d{2}))?$/.exec(refId);
  if (!m || !m[1] || !m[2] || !m[3] || !m[4] || !m[5]) throw new Error(`无法解析引用 ID：${refId}`);
  if (m[6] !== undefined) {
    const minutes = Number.parseInt(m[6], 10);
    const seconds = Number.parseInt(m[7] ?? '0', 10);
    if (minutes > 59 || seconds > 59) throw new Error(`无法解析引用 ID：${refId}`);
    return {
      date: `${m[1]}-${m[2]}-${m[3]}`,
      cityCode: m[4],
      seq: Number.parseInt(m[5], 10),
      offsetSeconds: minutes * 60 + seconds,
    };
  }
  return {
    date: `${m[1]}-${m[2]}-${m[3]}`,
    cityCode: m[4],
    seq: Number.parseInt(m[5], 10),
    offsetSeconds: undefined,
  };
}
