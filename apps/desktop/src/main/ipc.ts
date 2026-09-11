import { z } from 'zod';
import { Encounter, FieldEvent, type InboxStatus } from '@openfield/core';
import { join } from 'node:path';
import type { IpcChannel, IpcResult } from '../shared/ipc';
import type { AppState } from './state';
import { createEventWithEntry, createEncounterWithEntry } from './services/registry';
import { confirmInboxItem, rejectInboxItem } from './services/ingest';
import { scanOnce } from './services/inbox';
import { listInboxItems } from './services/repos';
import { runVerify } from './services/verify';
import { purgeSubject } from './services/purge';
import { exportBackup, makeCitation } from './services/export';

const PassphraseInput = z.object({ passphrase: z.string() });
const ConfirmInput = z.object({
  itemId: z.string().min(1),
  encounterId: z.string().min(1).optional(),
  eventId: z.string().min(1).optional(),
});
const PurgeInput = z.object({ pseudonym: z.string().min(1), confirmToken: z.string() });
const BackupInput = z.object({ passphrase: z.string().min(8) });
const ListInput = z.object({ status: z.string().optional() });
const ItemInput = z.object({ itemId: z.string().min(1) });
const CitationInput = z.object({ artifactId: z.string().min(1) });

export function createIpcHandlers(
  state: AppState,
): Record<IpcChannel, (payload: unknown) => Promise<IpcResult<unknown>>> {
  async function wrap(fn: () => unknown): Promise<IpcResult<unknown>> {
    try {
      return { ok: true, data: await fn() };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return {
    'vault:create': (p) =>
      wrap(() => {
        state.createVault(PassphraseInput.parse(p).passphrase);
        return state.status();
      }),
    'vault:open': (p) =>
      wrap(() => {
        state.openVault(PassphraseInput.parse(p).passphrase);
        return state.status();
      }),
    'vault:status': () => wrap(() => state.status()),
    'events:create': (p) => wrap(() => createEventWithEntry(state.getDb(), FieldEvent.parse(p))),
    'encounters:create': (p) => wrap(() => createEncounterWithEntry(state.getDb(), Encounter.parse(p))),
    'inbox:scan': () =>
      wrap(() => scanOnce(state.getDb(), { inboxDir: state.paths.inboxDir, quarantineDir: state.paths.quarantineDir })),
    'inbox:list': (p) =>
      wrap(() => listInboxItems(state.getDb(), ListInput.parse(p).status as InboxStatus | undefined)),
    'inbox:confirm': (p) =>
      wrap(async () => {
        const input = ConfirmInput.parse(p);
        return confirmInboxItem(state.getDb(), state.paths.originalsRoot, input.itemId, {
          deviceId: state.deviceId,
          ...(input.encounterId !== undefined ? { encounterId: input.encounterId } : {}),
          ...(input.eventId !== undefined ? { eventId: input.eventId } : {}),
        });
      }),
    'inbox:reject': (p) => wrap(() => rejectInboxItem(state.getDb(), ItemInput.parse(p).itemId)),
    'verify:run': () => wrap(() => runVerify(state.getDb(), state.paths.originalsRoot)),
    'citation:make': (p) =>
      wrap(() => makeCitation(state.getDb(), { artifactId: CitationInput.parse(p).artifactId, actor: state.deviceId })),
    'purge:subject': (p) =>
      wrap(() => {
        const input = PurgeInput.parse(p);
        return purgeSubject(state.getDb(), state.paths.originalsRoot, {
          pseudonym: input.pseudonym,
          confirmToken: input.confirmToken,
          actor: state.deviceId,
        });
      }),
    'backup:export': (p) =>
      wrap(() => {
        const { passphrase } = BackupInput.parse(p);
        const stamp = new Date().toISOString().replaceAll(':', '-');
        const outPath = join(state.paths.backupsDir, `backup-${stamp}.ofbackup`);
        exportBackup(state.getDb(), state.paths, passphrase, outPath);
        return { outPath };
      }),
  };
}
