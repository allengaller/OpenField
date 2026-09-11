export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string };

export const IPC_CHANNELS = [
  'vault:create',
  'vault:open',
  'vault:status',
  'events:create',
  'encounters:create',
  'inbox:scan',
  'inbox:list',
  'inbox:confirm',
  'inbox:reject',
  'verify:run',
  'citation:make',
  'purge:subject',
  'backup:export',
] as const;

export type IpcChannel = (typeof IPC_CHANNELS)[number];
