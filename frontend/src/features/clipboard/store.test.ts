import { useClipboardHistoryStore } from './store';

export async function verifyClipboardStoreBehavior(): Promise<boolean> {
  const store = useClipboardHistoryStore.getState();
  for (let i = 1; i <= 22; i++) {
    await store.addItem('text', `snippet-${i}`);
  }
  const items = useClipboardHistoryStore.getState().items;
  return items.length <= 20;
}
