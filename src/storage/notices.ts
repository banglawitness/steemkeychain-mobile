import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import {steemCall} from '../steem/client';

const PREFS_KEY = 'steem.notice.prefs';
const NOTICES_KEY = 'steem.notices';
const SEEDED_KEY = 'steem.notices.seeded';

export type NoticeKind = 'vote' | 'reply' | 'mention' | 'follow' | 'transfer';

export type NoticePrefs = {
  vote: boolean;
  reply: boolean;
  mention: boolean;
  follow: boolean;
  transfer: boolean;
  push: boolean;
};

export type Notice = {
  id: string;
  kind: NoticeKind;
  text: string;
  timestamp: string;
  seen: boolean;
};

const DEFAULT_PREFS: NoticePrefs = {
  vote: true,
  reply: true,
  mention: true,
  follow: true,
  transfer: true,
  push: true,
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function readNoticePrefs(): Promise<NoticePrefs> {
  const raw = await AsyncStorage.getItem(PREFS_KEY);
  if (!raw) return DEFAULT_PREFS;
  try {
    return {...DEFAULT_PREFS, ...JSON.parse(raw)};
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function writeNoticePrefs(prefs: NoticePrefs): Promise<void> {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export async function readNotices(): Promise<Notice[]> {
  const raw = await AsyncStorage.getItem(NOTICES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function unseenCount(): Promise<number> {
  const notices = await readNotices();
  return notices.filter(item => !item.seen).length;
}

export async function markNoticesSeen(): Promise<void> {
  const notices = await readNotices();
  await AsyncStorage.setItem(NOTICES_KEY, JSON.stringify(notices.map(item => ({...item, seen: true}))));
}

export async function refreshNotices(username: string): Promise<Notice[]> {
  const prefs = await readNoticePrefs();
  const fresh = await collectNotices(username, prefs);
  const stored = await readNotices();
  const previous = new Map(stored.map(item => [item.id, item]));
  const seeded = (await AsyncStorage.getItem(SEEDED_KEY)) === '1';
  const next = fresh.map(item => ({
    ...item,
    seen: seeded ? Boolean(previous.get(item.id)?.seen) : true,
  }));
  if (!seeded) await AsyncStorage.setItem(SEEDED_KEY, '1');
  await AsyncStorage.setItem(NOTICES_KEY, JSON.stringify(next));
  const brandNew = seeded ? next.filter(item => !previous.has(item.id) && !item.seen) : [];
  if (brandNew.length && prefs.push) await presentLocal(brandNew[0].text);
  return next;
}

async function presentLocal(body: string) {
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return;
  await Notifications.scheduleNotificationAsync({
    content: {title: 'Steem Keychain', body},
    trigger: null,
  });
}

async function collectNotices(username: string, prefs: NoticePrefs): Promise<Notice[]> {
  const page = await steemCall<[number, {timestamp: string; op: [string, Record<string, unknown>]}][]>('getAccountHistory', [username, -1, 100]);
  const notices: Notice[] = [];
  for (const [index, entry] of page || []) {
    const [type, payload] = entry.op;
    const found = classify(username, type, payload, prefs);
    if (!found) continue;
    notices.push({id: `${index}:${found.kind}`, timestamp: entry.timestamp, seen: false, ...found});
  }
  return notices.reverse();
}

function classify(username: string, type: string, payload: Record<string, unknown>, prefs: NoticePrefs): {kind: NoticeKind; text: string} | null {
  if (type === 'vote' && prefs.vote && payload.author === username && payload.voter !== username) {
    return {kind: 'vote', text: `@${payload.voter} voted on your post`};
  }
  if (type === 'comment' && payload.author !== username) {
    const body = String(payload.body || '');
    if (prefs.reply && payload.parent_author === username) return {kind: 'reply', text: `@${payload.author} replied to you`};
    if (prefs.mention && body.toLowerCase().includes(`@${username}`)) return {kind: 'mention', text: `@${payload.author} mentioned you`};
  }
  if (type === 'custom_json' && prefs.follow && String(payload.id) === 'follow') {
    try {
      const parsed = JSON.parse(String(payload.json || '[]'));
      const data = Array.isArray(parsed) ? parsed[1] : parsed;
      if (data?.following === username && data?.follower && data.follower !== username) {
        return {kind: 'follow', text: `@${data.follower} followed you`};
      }
    } catch {
      return null;
    }
  }
  if (type === 'transfer' && prefs.transfer && payload.to === username && payload.from !== username) {
    return {kind: 'transfer', text: `@${payload.from} sent ${payload.amount}`};
  }
  return null;
}
