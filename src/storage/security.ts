import AsyncStorage from '@react-native-async-storage/async-storage';

const ATTEMPTS_KEY = 'steem.pin.attempts';
const AUTO_KEY = 'steem.autolock';
const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60 * 1000;

type Attempts = {count: number; until: number};

async function readAttempts(): Promise<Attempts> {
  const raw = await AsyncStorage.getItem(ATTEMPTS_KEY);
  if (!raw) return {count: 0, until: 0};
  try {
    const parsed = JSON.parse(raw) as Partial<Attempts>;
    return {count: Number(parsed.count) || 0, until: Number(parsed.until) || 0};
  } catch {
    return {count: 0, until: 0};
  }
}

export async function lockoutRemaining(): Promise<number> {
  const state = await readAttempts();
  return Math.max(0, state.until - Date.now());
}

export async function registerFailure(): Promise<{locked: boolean; left: number}> {
  const state = await readAttempts();
  const count = state.count + 1;
  const locked = count >= MAX_ATTEMPTS;
  const next = locked ? {count: 0, until: Date.now() + LOCK_MS} : {count, until: 0};
  await AsyncStorage.setItem(ATTEMPTS_KEY, JSON.stringify(next));
  return {locked, left: Math.max(0, MAX_ATTEMPTS - count)};
}

export async function clearFailures(): Promise<void> {
  await AsyncStorage.removeItem(ATTEMPTS_KEY);
}

export function formatWait(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds >= 60) return `${Math.ceil(seconds / 60)} min`;
  return `${seconds}s`;
}

export async function readAutoLock(): Promise<number> {
  const raw = await AsyncStorage.getItem(AUTO_KEY);
  if (raw === null) return 60;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 60;
}

export async function writeAutoLock(seconds: number): Promise<void> {
  await AsyncStorage.setItem(AUTO_KEY, String(seconds));
}
