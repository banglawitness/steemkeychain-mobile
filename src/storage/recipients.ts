import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'steem.saved.recipients';
const LIMIT = 40;

export async function loadRecipients() {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(name => typeof name === 'string') : [];
  } catch {
    return [];
  }
}

async function write(names: string[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(names));
  return names;
}

export async function saveRecipient(name: string) {
  const current = await loadRecipients();
  return write([name, ...current.filter(item => item !== name)].slice(0, LIMIT));
}

export async function removeRecipient(name: string) {
  const current = await loadRecipients();
  return write(current.filter(item => item !== name));
}
