import AsyncStorage from '@react-native-async-storage/async-storage';
import steem from 'steem';
import {STEEM_RPC_NODES} from '../config';

const RPC_KEY = 'steem.rpc';
const CUSTOM_KEY = 'steem.rpc.custom';
const RETIRED = new Set(['https://api.steem.house']);

let applied = '';

export function normalizeRpc(input: string): string {
  let url = input.trim();
  if (!url) return '';
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, '');
}

export async function savedRpc(): Promise<string> {
  const stored = normalizeRpc((await AsyncStorage.getItem(RPC_KEY)) || '');
  if (!stored || !validRpc(stored) || RETIRED.has(stored)) return STEEM_RPC_NODES[0];
  return stored;
}

export async function customRpcs(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(CUSTOM_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(item => typeof item === 'string' && validRpc(item) && !RETIRED.has(normalizeRpc(item))).map(item => normalizeRpc(item));
  } catch {
    return [];
  }
}

export function rpcChoices(custom: string[]): string[] {
  return [...STEEM_RPC_NODES, ...custom.filter(url => !STEEM_RPC_NODES.includes(url))];
}

export function validRpc(url: string): boolean {
  const next = normalizeRpc(url);
  if (!next.startsWith('https://') || next.includes('@') || /\s/.test(next)) return false;
  const host = next.slice('https://'.length).split('/')[0];
  return /^[a-z0-9.-]+(?::\d{2,5})?$/i.test(host) || /^\[[0-9a-f:]+\](?::\d+)?$/i.test(host);
}

export async function applySavedRpc(): Promise<string> {
  const url = await savedRpc();
  if (url !== applied) {
    steem.api.setOptions({url});
    applied = url;
  }
  return url;
}

export async function selectRpc(url: string): Promise<void> {
  const next = normalizeRpc(url);
  if (!validRpc(next) || RETIRED.has(next)) throw new Error('Use an https address, like https://api.example.com.');
  await AsyncStorage.setItem(RPC_KEY, next);
  applied = '';
  await applySavedRpc();
}

export async function addCustomRpc(url: string): Promise<string> {
  const next = normalizeRpc(url);
  if (RETIRED.has(next)) throw new Error('That node is no longer available.');
  if (!validRpc(next)) throw new Error('Use an https address, like https://api.example.com.');
  await measureRpc(next);
  const current = await customRpcs();
  if (!current.includes(next) && !STEEM_RPC_NODES.includes(next)) {
    await AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify([...current, next]));
  }
  await selectRpc(next);
  return next;
}

export async function measureRpc(url: string): Promise<number> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', method: 'condenser_api.get_dynamic_global_properties', params: [], id: 1}),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('The node did not answer.');
    const body = await response.json();
    if (!body || body.error || !body.result) throw new Error('The node did not return Steem data.');
    return Date.now() - started;
  } finally {
    clearTimeout(timer);
  }
}
