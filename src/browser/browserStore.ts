import AsyncStorage from '@react-native-async-storage/async-storage';

const FAVORITES_KEY = 'steem.browser.favorites';
const HISTORY_KEY = 'steem.browser.history';
const ALLOWED_KEY = 'steem.browser.allowed';
const SESSION_KEY = 'steem.browser.session';
const DESKTOP_KEY = 'steem.browser.desktop';

export type BrowserLink = {
  url: string;
  title: string;
};

export type BrowserSession = {
  tabs: BrowserLink[];
  active: number;
};

export type AllowedOperation = {
  host: string;
  username: string;
  type: string;
};

async function readList<T>(key: string): Promise<T[]> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadFavorites() {
  return readList<BrowserLink>(FAVORITES_KEY);
}

export function saveFavorites(links: BrowserLink[]) {
  return AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(links));
}

export function loadHistory() {
  return readList<BrowserLink>(HISTORY_KEY);
}

export function saveHistory(links: BrowserLink[]) {
  return AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(links.slice(0, 40)));
}

export function loadAllowed() {
  return readList<AllowedOperation>(ALLOWED_KEY);
}

export function saveAllowed(entries: AllowedOperation[]) {
  return AsyncStorage.setItem(ALLOWED_KEY, JSON.stringify(entries));
}

export async function loadSession(): Promise<BrowserSession | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as BrowserSession;
    if (!parsed || !Array.isArray(parsed.tabs)) return null;
    return {tabs: parsed.tabs.filter(tab => tab && typeof tab.url === 'string'), active: Number(parsed.active) || 0};
  } catch {
    return null;
  }
}

export async function loadDesktopSite() {
  return (await AsyncStorage.getItem(DESKTOP_KEY)) === '1';
}

export function saveDesktopSite(on: boolean) {
  return AsyncStorage.setItem(DESKTOP_KEY, on ? '1' : '0');
}

export function saveSession(session: BrowserSession) {
  return AsyncStorage.setItem(SESSION_KEY, JSON.stringify({
    tabs: session.tabs.slice(0, 12),
    active: session.active,
  }));
}
