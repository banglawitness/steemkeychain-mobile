import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'steem.saved.recipients';
const LIMIT = 40;

export type SavedWallet = {
  name: string;
  memo: string;
};

export async function loadRecipients(): Promise<SavedWallet[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(entry).filter((item): item is SavedWallet => item !== null);
  } catch {
    return [];
  }
}

function entry(item: unknown): SavedWallet | null {
  if (typeof item === 'string' && item) return {name: item, memo: ''};
  if (!item || typeof item !== 'object') return null;
  const record = item as {name?: unknown; memo?: unknown};
  if (typeof record.name !== 'string' || !record.name) return null;
  return {name: record.name, memo: typeof record.memo === 'string' ? record.memo : ''};
}

async function write(items: SavedWallet[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
  return items;
}

export async function saveRecipient(name: string, memo: string) {
  const current = await loadRecipients();
  return write([{name, memo}, ...current.filter(item => item.name !== name)].slice(0, LIMIT));
}

export async function removeRecipient(name: string) {
  const current = await loadRecipients();
  return write(current.filter(item => item.name !== name));
}
