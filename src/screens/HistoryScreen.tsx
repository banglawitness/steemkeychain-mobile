import {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {useVault} from '../auth/VaultContext';
import {failureMessage} from '../browser/requests';
import {loadHistory} from '../steem/client';
import {Palette, useColors, useThemedStyles} from '../theme';
import {HistoryRow} from '../types';

type Filter = 'all' | 'in' | 'out';
type Kind = 'all' | 'transfer' | 'vote' | 'power' | 'savings' | 'other';

const KINDS: {id: Kind; label: string}[] = [
  {id: 'all', label: 'All types'},
  {id: 'transfer', label: 'Transfer'},
  {id: 'vote', label: 'Vote'},
  {id: 'power', label: 'Power'},
  {id: 'savings', label: 'Savings'},
  {id: 'other', label: 'Other'},
];

export default function HistoryScreen() {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const {activeName} = useVault();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [oldest, setOldest] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [kind, setKind] = useState<Kind>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (from: number, replace: boolean) => {
    if (!activeName) return;
    setLoading(true);
    setError('');
    try {
      const page = await loadHistory(activeName, from, 100);
      setRows(current => replace ? page.rows : [...current, ...page.rows]);
      setOldest(page.oldest);
    } catch (cause) {
      setError(failureMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [activeName]);

  useEffect(() => {
    setRows([]);
    load(-1, true);
  }, [load]);

  const needle = query.trim().toLowerCase();
  const visible = rows.filter(row => {
    if (filter !== 'all' && row.direction !== filter) return false;
    if (!matchesKind(row.type, kind)) return false;
    if (!needle) return true;
    return `${row.type} ${row.text}`.toLowerCase().includes(needle);
  });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {!activeName ? <Text style={styles.note}>Choose an account on the wallet first.</Text> : null}
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        placeholder="Filter by text"
        placeholderTextColor={colors.muted}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kindRow}>
        {KINDS.map(item => (
          <Pressable key={item.id} style={[styles.chip, kind === item.id && styles.chipOn]} onPress={() => setKind(item.id)}>
            <Text style={styles.chipText}>{item.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.chips}>
        {(['all', 'in', 'out'] as const).map(item => (
          <Pressable key={item} style={[styles.chip, filter === item && styles.chipOn]} onPress={() => setFilter(item)}>
            <Text style={styles.chipText}>{item === 'all' ? 'All' : item === 'in' ? 'In' : 'Out'}</Text>
          </Pressable>
        ))}
      </View>
      {visible.map(row => (
        <View key={`${row.id}-${row.type}`} style={styles.card}>
          <Text style={styles.type}>{row.type.split('_').join(' ')}</Text>
          <Text style={styles.text}>{row.text}</Text>
          <Text style={styles.note}>{row.timestamp.replace('T', ' ').slice(0, 16)} · {row.direction}</Text>
        </View>
      ))}
      {visible.length === 0 && !loading ? <Text style={styles.note}>No matching history.</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={colors.accent} /> : null}
      {oldest > 0 ? (
        <Pressable style={styles.secondary} onPress={() => load(oldest - 1, false)} disabled={loading}>
          <Text style={styles.secondaryText}>Load older</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function matchesKind(type: string, kind: Kind) {
  if (kind === 'all') return true;
  if (kind === 'transfer') return type === 'transfer';
  if (kind === 'vote') return type === 'vote' || type === 'comment';
  if (kind === 'power') return type === 'transfer_to_vesting' || type === 'withdraw_vesting' || type === 'delegate_vesting_shares' || type === 'fill_vesting_withdraw';
  if (kind === 'savings') return type.includes('savings') || type === 'convert' || type === 'fill_convert_request';
  const known = ['transfer', 'vote', 'comment', 'transfer_to_vesting', 'withdraw_vesting', 'delegate_vesting_shares', 'fill_vesting_withdraw', 'transfer_to_savings', 'transfer_from_savings', 'cancel_transfer_from_savings', 'fill_transfer_from_savings', 'convert', 'fill_convert_request'];
  return !known.includes(type);
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
  screen: {flex: 1, backgroundColor: c.background},
  content: {padding: 14, paddingBottom: 24},
  input: {backgroundColor: c.card, color: c.text, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, fontSize: 15},
  kindRow: {gap: 8, paddingBottom: 10},
  chips: {flexDirection: 'row', gap: 8, marginBottom: 14},
  chip: {backgroundColor: c.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8},
  chipOn: {backgroundColor: c.accentSoft},
  chipText: {color: c.text, fontWeight: '600'},
  card: {backgroundColor: c.card, borderRadius: 16, padding: 14, marginBottom: 8},
  type: {color: c.text, fontWeight: '700', textTransform: 'capitalize'},
  text: {color: c.text, marginVertical: 4, lineHeight: 20},
  note: {color: c.muted, lineHeight: 20},
  error: {color: c.danger, marginVertical: 8},
  secondary: {backgroundColor: c.card, borderRadius: 12, paddingVertical: 10, alignItems: 'center', marginTop: 6},
  secondaryText: {color: c.text, fontWeight: '600'},
});
}
