import type { IpcResult } from '../../shared/ipc';

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`缺元素 #${id}`);
  return el;
};

async function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  const res = (await window.openfield.invoke(channel, payload)) as IpcResult<T>;
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

interface PendingItem {
  id: string;
  sourcePath: string;
  status: string;
}

async function refreshPending(): Promise<void> {
  const items = await invoke<PendingItem[]>('inbox:list', {});
  const ul = $('pending');
  ul.textContent = '';
  for (const item of items.filter((i) => i.status === 'pending')) {
    const li = document.createElement('li');
    li.textContent = `${item.id} ${item.sourcePath}`;
    const btn = document.createElement('button');
    btn.textContent = '确认入库';
    btn.dataset.itemId = item.id;
    btn.addEventListener('click', async () => {
      const artifact = await invoke<{ id: string }>('inbox:confirm', {
        itemId: item.id,
        encounterId: ($('confirm-enc') as HTMLInputElement).value || undefined,
      });
      ($('cite-art') as HTMLInputElement).value = artifact.id;
      await refreshPending();
    });
    li.appendChild(btn);
    ul.appendChild(li);
  }
}

const statusEl = $('status') as HTMLPreElement;
const scanEl = $('scan') as HTMLPreElement;
const reportEl = $('report') as HTMLPreElement;
const citeOutEl = $('cite-out') as HTMLPreElement;

$('btn-create').addEventListener('click', async () => {
  statusEl.textContent = JSON.stringify(
    await invoke('vault:create', { passphrase: ($('pass') as HTMLInputElement).value }),
  );
});
$('btn-open').addEventListener('click', async () => {
  statusEl.textContent = JSON.stringify(
    await invoke('vault:open', { passphrase: ($('pass') as HTMLInputElement).value }),
  );
});
$('btn-status').addEventListener('click', async () => {
  statusEl.textContent = JSON.stringify(await invoke('vault:status'));
});
$('btn-event').addEventListener('click', async () => {
  await invoke('events:create', {
    id: ($('ev-id') as HTMLInputElement).value,
    date: ($('ev-date') as HTMLInputElement).value,
    cityCode: ($('ev-city') as HTMLInputElement).value,
    locationName: ($('ev-loc') as HTMLInputElement).value,
  });
  statusEl.textContent = '事件已登记';
});
$('btn-encounter').addEventListener('click', async () => {
  await invoke('encounters:create', {
    id: ($('enc-id') as HTMLInputElement).value,
    eventId: ($('enc-event') as HTMLInputElement).value,
    participantRef: ($('enc-participant') as HTMLInputElement).value,
    samplingReason: ($('enc-reason') as HTMLInputElement).value,
    startedAt: Date.now(),
  });
  statusEl.textContent = '访谈已登记';
});
$('btn-scan').addEventListener('click', async () => {
  scanEl.textContent = JSON.stringify(await invoke('inbox:scan'));
  await refreshPending();
});
$('btn-verify').addEventListener('click', async () => {
  reportEl.textContent = JSON.stringify(await invoke('verify:run'), null, 2);
});
$('btn-cite').addEventListener('click', async () => {
  const out = await invoke<{ refId: string }>('citation:make', {
    artifactId: ($('cite-art') as HTMLInputElement).value,
  });
  citeOutEl.textContent = out.refId;
});
window.openfield.onInboxChanged(() => void refreshPending());
