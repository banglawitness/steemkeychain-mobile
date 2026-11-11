import {useEffect, useMemo, useState} from 'react';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {useVault} from '../../auth/VaultContext';
import {RootStackParamList} from '../../navigation/RootNavigator';
import {executeRequest, failureMessage} from '../../browser/requests';
import ConfirmSheet from '../../components/ConfirmSheet';
import {GovernanceAccount, MAX_WITNESS_VOTES, WITNESS_PAGE, WitnessRow, loadGovernanceAccount, loadWitnesses} from '../../steem/governance';
import {Palette, useColors, useThemedStyles} from '../../theme';

export default function WitnessList() {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const {accounts, activeName, importAccounts} = useVault();
  const account = accounts.find(item => item.name === activeName);
  const [rows, setRows] = useState<(WitnessRow & {rank: number})[]>([]);
  const [governance, setGovernance] = useState<GovernanceAccount | null>(null);
  const [query, setQuery] = useState('');
  const [votedOnly, setVotedOnly] = useState(false);
  const [hideInactive, setHideInactive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<WitnessRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (from = '') => {
    if (!activeName) return;
    if (from) setMore(true);
    else setLoading(true);
    setError('');
    try {
      const [page, chain] = await Promise.all([
        loadWitnesses(from),
        from ? Promise.resolve(null) : loadGovernanceAccount(activeName).then(async mine => {
          if (!mine.proxy) return mine;
          const proxy = await loadGovernanceAccount(mine.proxy);
          return {proxy: mine.proxy, witnessVotes: proxy.witnessVotes};
        }),
      ]);
      setRows(current => {
        const base = from ? current : [];
        const next = (from ? page.filter(row => row.name !== from) : page).map((row, index) => ({
          ...row,
          rank: base.length + index + 1,
        }));
        return [...base, ...next];
      });
      setHasMore(page.length === WITNESS_PAGE);
      if (chain) setGovernance(chain);
    } catch (cause) {
      setError(failureMessage(cause));
    } finally {
      setLoading(false);
      setMore(false);
    }
  };

  useEffect(() => {
    load();
  }, [activeName]);

  const votes = governance?.witnessVotes || [];
  const visible = useMemo(() => rows.filter(row => {
    if (hideInactive && !row.active) return false;
    if (votedOnly && !votes.includes(row.name)) return false;
    const needle = query.trim().toLowerCase();
    return !needle || row.name.toLowerCase().includes(needle);
  }), [rows, hideInactive, votedOnly, votes, query]);

  const approve = pending ? !votes.includes(pending.name) : false;

  const submit = async () => {
    if (!account || !pending) return;
    setBusy(true);
    setError('');
    try {
      await executeRequest({
        type: 'witnessVote',
        username: account.name,
        witness: pending.name,
        vote: approve,
      }, account, importAccounts);
      setGovernance(current => current && {
        ...current,
        witnessVotes: approve
          ? [...current.witnessVotes, pending.name]
          : current.witnessVotes.filter(name => name !== pending.name),
      });
      setPending(null);
    } catch (cause) {
      setError(failureMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const ask = (row: WitnessRow) => {
    if (governance?.proxy) {
      setError(`Witness votes follow @${governance.proxy}. Clear the proxy before voting.`);
      return;
    }
    if (!account?.keys.active) {
      setError('This account has no active key.');
      return;
    }
    if (!votes.includes(row.name) && votes.length >= MAX_WITNESS_VOTES) {
      setError(`You can vote for ${MAX_WITNESS_VOTES} witnesses.`);
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
          keyExtractor={item => item.name}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View>
              <Text style={styles.note}>
                {governance?.proxy
                  ? `Following @${governance.proxy}. Clear the proxy to vote yourself.`
                  : `${votes.length} of ${MAX_WITNESS_VOTES} votes used.`}
              </Text>
              <TextInput
                style={styles.input}
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Find a witness"
                placeholderTextColor={colors.muted}
              />
              <View style={styles.filters}>
                <Filter label="Voted" on={votedOnly} onPress={() => setVotedOnly(value => !value)} />
                <Filter label="Hide inactive" on={hideInactive} onPress={() => setHideInactive(value => !value)} />
              </View>
              {error && !pending ? <Text style={styles.error}>{error}</Text> : null}
            </View>
          }
          renderItem={({item}) => (
            <View style={styles.row}>
              <Text style={styles.rank}>{item.rank}</Text>
              <View style={styles.nameBlock}>
                <Text style={[styles.name, !item.active && styles.inactive]}>@{item.name}</Text>
                <Text style={styles.meta}>{item.missed} missed{item.url.startsWith('http') ? ' · link' : ''}</Text>
              </View>
              {item.url.startsWith('http') ? (
                <Pressable onPress={() => navigation.navigate('Browser', {url: item.url})}>
                  <Text style={styles.link}>Open</Text>
                </Pressable>
              ) : null}
              <Pressable style={[styles.vote, votes.includes(item.name) && styles.voteOn]} onPress={() => ask(item)}>
                <Text style={styles.voteText}>{votes.includes(item.name) ? 'Voted' : 'Vote'}</Text>
              </Pressable>
            </View>
          )}
          ListFooterComponent={hasMore ? (
            <Pressable style={styles.more} onPress={() => load(rows[rows.length - 1].name)} disabled={more}>
              {more ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.moreText}>Load more</Text>}
            </Pressable>
          ) : undefined}
          ListEmptyComponent={<Text style={styles.note}>No witnesses match.</Text>}
        />
      )}
      {pending ? (
        <ConfirmSheet
          title={approve ? 'Vote witness' : 'Remove witness vote'}
          lines={[`Account @${activeName}`, `${approve ? 'Vote for' : 'Unvote'} @${pending.name}`]}
          busy={busy}
          error={error}
          onCancel={() => { setPending(null); setError(''); }}
          onConfirm={submit}
        />
      ) : null}
    </View>
  );
}

function Filter({label, on, onPress}: {label: string; on: boolean; onPress: () => void}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable style={[styles.filter, on && styles.filterOn]} onPress={onPress}>
      <Text style={styles.filterText}>{label}</Text>
    </Pressable>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
  screen: {flex: 1},
  loader: {marginTop: 32},
  list: {paddingHorizontal: 16, paddingBottom: 24},
  note: {color: c.muted, fontSize: 13, lineHeight: 18, marginBottom: 10},
  input: {backgroundColor: c.card, color: c.text, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 8, fontSize: 15},
  filters: {flexDirection: 'row', gap: 8, marginBottom: 10},
  filter: {backgroundColor: c.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, paddingHorizontal: 12, paddingVertical: 7},
  filterOn: {backgroundColor: c.accentSoft, borderColor: c.accentSoft},
  filterText: {color: c.text, fontWeight: '700', fontSize: 13},
  error: {color: c.danger, marginBottom: 10},
  row: {flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, gap: 8},
  rank: {width: 28, color: c.muted, fontWeight: '700'},
  nameBlock: {flex: 1},
  name: {color: c.text, fontWeight: '700'},
  inactive: {textDecorationLine: 'line-through', color: c.muted},
  meta: {color: c.muted, fontSize: 12, marginTop: 2},
  link: {color: c.accent, fontWeight: '700'},
  vote: {borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: c.background},
  voteOn: {backgroundColor: c.accentSoft},
  voteText: {color: c.text, fontWeight: '700'},
  more: {alignItems: 'center', paddingVertical: 14},
  moreText: {color: c.text, fontWeight: '700'},
});
}
