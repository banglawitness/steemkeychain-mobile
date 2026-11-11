import {useEffect, useMemo, useState} from 'react';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {useVault} from '../../auth/VaultContext';
import {RootStackParamList} from '../../navigation/RootNavigator';
import {executeRequest, failureMessage} from '../../browser/requests';
import ConfirmSheet from '../../components/ConfirmSheet';
import {ProposalRow, loadGovernanceAccount, loadProposals} from '../../steem/governance';
import {Palette, useColors, useThemedStyles} from '../../theme';

const STATUS: Record<ProposalRow['status'], string> = {
  funded: 'Funded',
  partial: 'Partial',
  pending: 'Not funded',
  return: 'Return',
};

export default function ProposalList() {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const {accounts, activeName, importAccounts} = useVault();
  const account = accounts.find(item => item.name === activeName);
  const [rows, setRows] = useState<ProposalRow[]>([]);
  const [proxy, setProxy] = useState('');
  const [query, setQuery] = useState('');
  const [votedOnly, setVotedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<ProposalRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!activeName) return;
    setLoading(true);
    setError('');
    try {
      const mine = await loadGovernanceAccount(activeName);
      const voter = mine.proxy || activeName;
      setProxy(mine.proxy);
      setRows(await loadProposals(voter));
    } catch (cause) {
      setError(failureMessage(cause));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [activeName]);

  const visible = useMemo(() => rows.filter(row => {
    if (votedOnly && !row.voted) return false;
    const needle = query.trim().toLowerCase();
    return !needle || `${row.subject} ${row.creator}`.toLowerCase().includes(needle);
  }), [rows, votedOnly, query]);

  const submit = async () => {
    if (!account || !pending) return;
    setBusy(true);
    setError('');
    try {
      const approve = !pending.voted;
      await executeRequest({
        type: 'updateProposalVote',
        username: account.name,
        proposal_ids: [pending.id],
        approve,
      }, account, importAccounts);
      setRows(current => current.map(row => row.id === pending.id ? {...row, voted: approve} : row));
      setPending(null);
    } catch (cause) {
      setError(failureMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const ask = (row: ProposalRow) => {
    if (proxy) {
      setError(`Proposal votes follow @${proxy}. Clear the proxy before voting.`);
      return;
    }
    if (!account?.keys.active) {
      setError('This account has no active key.');
      return;
    }
    setError('');
    setPending(row);
  };

  return (
    <View style={styles.screen}>
      {loading ? <ActivityIndicator color={colors.accent} style={styles.loader} /> : (
        <FlatList
          data={visible}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View>
              <Text style={styles.note}>
                {proxy
                  ? `Following @${proxy}. Clear the proxy to vote yourself.`
                  : 'Ordered by votes. Funded ones fit the daily DAO budget.'}
              </Text>
              <TextInput
                style={styles.input}
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                placeholder="Find a proposal"
                placeholderTextColor={colors.muted}
              />
              <Pressable style={[styles.filter, votedOnly && styles.filterOn]} onPress={() => setVotedOnly(value => !value)}>
                <Text style={styles.filterText}>Voted</Text>
              </Pressable>
              {error && !pending ? <Text style={styles.error}>{error}</Text> : null}
            </View>
          }
          renderItem={({item}) => (
            <View style={styles.card}>
              <View style={styles.titleRow}>
                <Text style={styles.subject}>{item.subject}</Text>
                <Text style={[styles.badge, item.status === 'funded' && styles.funded]}>{STATUS[item.status]}</Text>
              </View>
              <Text style={styles.meta}>#{item.id} · @{item.creator} · {item.dailyPay}/day</Text>
              <Text style={styles.meta}>{item.votes} SP · {item.start} to {item.end}</Text>
              <View style={styles.actions}>
                {item.permlink ? (
                  <Pressable onPress={() => navigation.navigate('Browser', {url: `https://steemit.com/@${item.creator}/${item.permlink}`})}>
                    <Text style={styles.link}>Open post</Text>
                  </Pressable>
                ) : <View />}
                <Pressable style={[styles.vote, item.voted && styles.voteOn]} onPress={() => ask(item)}>
                  <Text style={styles.voteText}>{item.voted ? 'Voted' : 'Vote'}</Text>
                </Pressable>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.note}>No proposals match.</Text>}
        />
      )}
      {pending ? (
        <ConfirmSheet
          title={pending.voted ? 'Remove proposal vote' : 'Vote proposal'}
          lines={[`Account @${activeName}`, `#${pending.id} ${pending.subject}`]}
          busy={busy}
          error={error}
          onCancel={() => { setPending(null); setError(''); }}
          onConfirm={submit}
        />
      ) : null}
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
  screen: {flex: 1},
  loader: {marginTop: 32},
  list: {paddingHorizontal: 16, paddingBottom: 24},
  note: {color: c.muted, fontSize: 13, lineHeight: 18, marginBottom: 10},
  input: {backgroundColor: c.card, color: c.text, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 8, fontSize: 15},
  filter: {alignSelf: 'flex-start', backgroundColor: c.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 10},
  filterOn: {backgroundColor: c.accentSoft, borderColor: c.accentSoft},
  filterText: {color: c.text, fontWeight: '700', fontSize: 13},
  error: {color: c.danger, marginBottom: 10},
  card: {backgroundColor: c.card, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, padding: 14, marginBottom: 8},
  titleRow: {flexDirection: 'row', alignItems: 'flex-start', gap: 10},
  subject: {color: c.text, fontWeight: '700', flex: 1, lineHeight: 20},
  badge: {color: c.muted, fontSize: 12, fontWeight: '700'},
  funded: {color: c.accent},
  meta: {color: c.muted, marginTop: 6, lineHeight: 18},
  actions: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12},
  link: {color: c.accent, fontWeight: '700'},
  vote: {borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: c.background},
  voteOn: {backgroundColor: c.accentSoft},
  voteText: {color: c.text, fontWeight: '700'},
});
}
