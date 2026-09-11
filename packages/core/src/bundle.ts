import { z } from 'zod';
import { FieldEvent, Encounter, Participant, ConsentRecord, Memo, Gps, Sha256, EpochMs, Id } from './entities';

export const MediaRef = z.object({
  filename: z.string().min(1),
  sha256: Sha256,
  bytes: z.number().int().nonnegative(),
  mime: z.string().min(1),
  type: z.enum(['audio', 'photo', 'note', 'doc']),
  capturedAt: EpochMs,
  gps: Gps.optional(),
  encounterId: Id.optional(),
});
export type MediaRef = z.infer<typeof MediaRef>;

export const BundleV1 = z.strictObject({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  deviceId: z.string().min(1),
  createdAt: EpochMs,
  events: z.array(FieldEvent),
  encounters: z.array(Encounter),
  participants: z.array(Participant),
  consents: z.array(ConsentRecord),
  memos: z.array(Memo),
  mediaRefs: z.array(MediaRef),
});
export type Bundle = z.infer<typeof BundleV1>;

export interface BundleIssue {
  message: string;
  path?: string;
  code: string;
}

export class BundleValidationError extends Error {
  constructor(readonly issues: BundleIssue[]) {
    super(`bundle 校验失败：${issues.length} 个问题`);
    this.name = 'BundleValidationError';
  }
}

function toIssues(error: z.ZodError): BundleIssue[] {
  return error.issues.map((i) => ({
    message: i.message,
    ...(i.path.length > 0 ? { path: i.path.join('.') } : {}),
    code: i.code,
  }));
}

export function encodeBundle(bundle: Bundle): string {
  const parsed = BundleV1.safeParse(bundle);
  if (!parsed.success) throw new BundleValidationError(toIssues(parsed.error));
  return JSON.stringify(parsed.data, null, 2);
}

export function decodeBundle(text: string): Bundle {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BundleValidationError([{ message: '不是合法 JSON', code: 'invalid_json' }]);
  }
  const parsed = BundleV1.safeParse(raw);
  if (!parsed.success) throw new BundleValidationError(toIssues(parsed.error));
  return parsed.data;
}
