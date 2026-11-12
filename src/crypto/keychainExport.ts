import CryptoJS from 'crypto-js';
import {QR_ACCOUNTS_PREFIX, readAccountQrPage} from './accountQr';
import {AccountKeys, StoredAccount} from '../types';

const KEY_SIZE = 256;
const ITERATIONS = 100;

const KEY_FIELDS = [
  'posting',
  'postingPubkey',
  'active',
  'activePubkey',
  'memo',
  'memoPubkey',
] as const;

function decryptTransit(transitMessage: string, password: string): string {
  const salt = CryptoJS.enc.Hex.parse(transitMessage.substring(0, 32));
  const iv = CryptoJS.enc.Hex.parse(transitMessage.substring(32, 64));
  const encrypted = transitMessage.substring(64);
  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: KEY_SIZE / 32,
    iterations: ITERATIONS,
    hasher: CryptoJS.algo.SHA1,
  });
  const decrypted = CryptoJS.AES.decrypt(encrypted, key, {
    iv,
    padding: CryptoJS.pad.Pkcs7,
    mode: CryptoJS.mode.CBC,
  });
  return decrypted.toString(CryptoJS.enc.Utf8);
}

function asAccounts(value: unknown): StoredAccount[] {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as {list?: unknown}).list)
      ? (value as {list: unknown[]}).list
      : value && typeof value === 'object' && 'name' in (value as object)
        ? [value]
        : [];

  return list.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as {name?: unknown; keys?: unknown};
    const name = typeof record.name === 'string' ? record.name.trim().toLowerCase() : '';
    if (!/^[a-z0-9.-]{3,16}$/.test(name)) return [];
    const keys: AccountKeys = {};
    if (record.keys && typeof record.keys === 'object') {
      for (const field of KEY_FIELDS) {
        const raw = (record.keys as Record<string, unknown>)[field];
        if (typeof raw === 'string' && raw.length > 0) keys[field] = raw;
      }
    }
    return [{name, keys}];
  });
}

export function parseAccountQr(raw: string): {accounts: StoredAccount[]; index: number; total: number} {
  const text = raw.trim();
  if (text.startsWith(QR_ACCOUNTS_PREFIX)) {
    const page = readAccountQrPage(text);
    return {
      accounts: requireAccounts(asAccounts(page.data)),
      index: page.index,
      total: page.total,
    };
  }
  if (text.startsWith('keychain://add_account=')) {
    const payload = text.slice('keychain://add_account='.length);
    let parsed: unknown;
    try {
      parsed = JSON.parse(decodeURIComponent(payload));
    } catch {
      try {
        parsed = JSON.parse(payload);
      } catch {
        throw new Error('That QR code is not a Steem Keychain account export.');
      }
    }
    return {accounts: requireAccounts(asAccounts(parsed)), index: 1, total: 1};
  }
  throw new Error('That QR code is not a Steem Keychain account export.');
}

export function parseKeychainExport(raw: string, password: string): StoredAccount[] {
  const text = raw.trim().replace(/^\uFEFF/, '');
  if (!text) throw new Error('The export file is empty.');

  if (text.startsWith(QR_ACCOUNTS_PREFIX) || text.startsWith('keychain://add_account=')) {
    return parseAccountQr(text).accounts;
  }

  if (text.startsWith('{') || text.startsWith('[')) {
    return requireAccounts(asAccounts(JSON.parse(text)));
  }

  if (!password) throw new Error('Enter the Steem Keychain master password.');

  const decrypted = text.startsWith('U2FsdGVkX1')
    ? CryptoJS.AES.decrypt(text, password).toString(CryptoJS.enc.Utf8)
    : decryptTransit(text, password);

  if (!decrypted) throw new Error('Could not decrypt that file. Check the master password.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(decrypted);
  } catch {
    throw new Error('Could not decrypt that file. Check the master password.');
  }
  return requireAccounts(asAccounts(parsed));
}

export function encryptKeychainExport(accounts: StoredAccount[], password: string): string {
  return CryptoJS.AES.encrypt(JSON.stringify(accounts), password).toString();
}

function requireAccounts(accounts: StoredAccount[]): StoredAccount[] {
  if (accounts.length === 0) {
    throw new Error('No Steem accounts were found in that export.');
  }
  return accounts;
}

export function sealVault(accounts: StoredAccount[], pin: string): string {
  const content = {list: accounts};
  const salt = CryptoJS.lib.WordArray.random(128 / 8);
  const iv = CryptoJS.lib.WordArray.random(128 / 8);
  const key = CryptoJS.PBKDF2(pin, salt, {
    keySize: KEY_SIZE / 32,
    iterations: ITERATIONS,
    hasher: CryptoJS.algo.SHA1,
  });
  const encrypted = CryptoJS.AES.encrypt(JSON.stringify(content), key, {
    iv,
    padding: CryptoJS.pad.Pkcs7,
    mode: CryptoJS.mode.CBC,
  });
  return salt.toString() + iv.toString() + encrypted.toString();
}

export function openVault(message: string, pin: string): StoredAccount[] {
  const decrypted = decryptTransit(message, pin);
  if (!decrypted) throw new Error('Wrong PIN.');
  try {
    return asAccounts(JSON.parse(decrypted));
  } catch {
    throw new Error('Wrong PIN.');
  }
}
