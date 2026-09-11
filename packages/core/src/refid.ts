import { CityCode, IsoDate } from './entities';

export class RefIdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RefIdError';
  }
}

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
  const city = CityCode.safeParse(parts.cityCode);
  if (!city.success) throw new RefIdError(`城市码须为 3 位大写字母：${parts.cityCode}`);
  if (!IsoDate.safeParse(parts.date).success) {
    throw new RefIdError(`日期格式须为 YYYY-MM-DD（含日历有效性）：${parts.date}`);
  }
  if (!Number.isInteger(parts.seq) || parts.seq < 0 || parts.seq > 999) {
    throw new RefIdError(`seq 须为 0-999 整数：${parts.seq}`);
  }
  const base = `OF-${parts.date.replaceAll('-', '')}-${city.data}-${String(parts.seq).padStart(3, '0')}`;
  if (parts.offsetSeconds === undefined) return base;
  if (!Number.isInteger(parts.offsetSeconds) || parts.offsetSeconds < 0 || parts.offsetSeconds > 5999) {
    throw new RefIdError(`offsetSeconds 须为 0-5999 整数（#T99:59 上限）：${parts.offsetSeconds}`);
  }
  const m = Math.floor(parts.offsetSeconds / 60);
  const s = parts.offsetSeconds % 60;
  return `${base}#T${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 正则内联 [A-Z]{3} 与 entities 的 CityCode 重复：待 CityCode 演进（如城市白名单）时一并收敛。
export function parseRefId(refId: string): ParsedRefId {
  const m = /^OF-(\d{4})(\d{2})(\d{2})-([A-Z]{3})-(\d{3})(?:#T(\d{2}):(\d{2}))?$/.exec(refId);
  if (!m || !m[1] || !m[2] || !m[3] || !m[4] || !m[5]) throw new RefIdError(`无法解析引用 ID：${refId}`);
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (!IsoDate.safeParse(date).success) throw new RefIdError(`无法解析引用 ID：${refId}`);
  if (m[6] !== undefined) {
    const minutes = Number.parseInt(m[6], 10);
    const seconds = Number.parseInt(m[7] ?? '0', 10);
    if (minutes > 99 || seconds > 59) throw new RefIdError(`无法解析引用 ID：${refId}`);
    return {
      date,
      cityCode: m[4],
      seq: Number.parseInt(m[5], 10),
      offsetSeconds: minutes * 60 + seconds,
    };
  }
  return {
    date,
    cityCode: m[4],
    seq: Number.parseInt(m[5], 10),
    offsetSeconds: undefined,
  };
}
