import { z } from 'zod';
import { FieldEvent, Encounter, Participant, ConsentRecord, Memo, Gps, Sha256, EpochMs } from './entities';

export const MediaRef = z.object({
  filename: z.string().min(1),
  sha256: Sha256,
  bytes: z.number().int().nonnegative(),
  mime: z.string().min(1),
  type: z.enum(['audio', 'photo', 'note', 'doc']),
  capturedAt: EpochMs,
  gps: Gps.optional(),
  encounterId: z.string().optional(),
});
export type MediaRef = z.infer<typeof MediaRef>;

export const BundleV1 = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  deviceId: z.string().min(1),
  createdAt: z.number().int().positive(),
  events: z.array(FieldEvent),
  encounters: z.array(Encounter),
  participants: z.array(Participant),
  consents: z.array(ConsentRecord),
  memos: z.array(Memo),
  mediaRefs: z.array(MediaRef),
});
export type Bundle = z.infer<typeof BundleV1>;

export class BundleValidationError extends Error {
  constructor(readonly issues: unknown[]) {
    super(`bundle 校验失败：${issues.length} 个问题`);
  }
}

export function encodeBundle(bundle: Bundle): string {
  return JSON.stringify(BundleV1.parse(bundle), null, 2);
}

export function decodeBundle(text: string): Bundle {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BundleValidationError([{ message: '不是合法 JSON' }]);
  }
  const parsed = BundleV1.safeParse(raw);
  if (!parsed.success) throw new BundleValidationError(parsed.error.issues);
  return parsed.data;
}
