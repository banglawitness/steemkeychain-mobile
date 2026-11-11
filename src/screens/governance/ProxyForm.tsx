import {useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {useVault} from '../../auth/VaultContext';
import {executeRequest, failureMessage} from '../../browser/requests';
import ConfirmSheet from '../../components/ConfirmSheet';
import {loadGovernanceAccount} from '../../steem/governance';
import {Palette, useColors, useThemedStyles} from '../../theme';

export default function ProxyForm({onChanged}: {onChanged: () => void}) {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const {accounts, activeName, importAccounts} = useVault();
  const account = accounts.find(item => item.name === activeName);
  const [proxy, setProxy] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!activeName) return;
    setLoading(true);
    loadGovernanceAccount(activeName)
      .then(chain => setProxy(chain.proxy))
      .catch(cause => setError(failureMessage(cause)))
      .finally(() => setLoading(false));
  }, [activeName]);

  const nextProxy = clearing ? '' : draft.trim().replace(/^@/, '');

  const submit = async () => {
    if (!account) return;
    if (!clearing && !/^[a-z0-9.-]{3,16}$/.test(nextProxy)) {
      setError('Enter a Steem account name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await executeRequest({
        type: 'proxy',
        username: account.name,
        proxy: nextProxy,
      }, account, importAccounts);
      setProxy(nextProxy);
      setDraft('');
      setConfirming(false);
      setClearing(false);
      onChanged();
    } catch (cause) {
      setError(failureMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <ActivityIndicator color={colors.accent} style={styles.loader} />;

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.kicker}>{proxy ? 'Voting as' : 'No proxy'}</Text>
        <Text style={styles.name}>{proxy ? `@${proxy}` : 'You vote yourself'}</Text>
        <Text style={styles.lead}>
          {proxy
            ? 'Witness and proposal votes follow this account. Clear it to vote on your own.'
            : 'Set an account you trust. It votes for witnesses and proposals in your place.'}
        </Text>
      </View>
      {proxy ? (
        <Pressable
          style={styles.danger}
          onPress={() => {
            if (!account?.keys.active) {
              setError('This account has no active key.');
              return;
            }
            setClearing(true);
            setConfirming(true);
          }}>
          <Text style={styles.dangerText}>Clear proxy</Text>
        </Pressable>
      ) : (
        <>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Account name"
            placeholderTextColor={colors.muted}
          />
          <Pressable
            style={styles.primary}
            onPress={() => {
              if (!account?.keys.active) {
                setError('This account has no active key.');
                return;
              }
              setClearing(false);
              setError('');
              setConfirming(true);
            }}>
            <Text style={styles.buttonText}>Set proxy</Text>
          </Pressable>
        </>
      )}
      {error && !confirming ? <Text style={styles.error}>{error}</Text> : null}
      {confirming ? (
        <ConfirmSheet
          title={clearing ? 'Clear proxy' : 'Set proxy'}
          lines={[
            `Account @${activeName}`,
            clearing ? 'This account will vote for itself again.' : `Proxy @${nextProxy}`,
          ]}
          busy={busy}
          error={error}
          onCancel={() => { setConfirming(false); setClearing(false); setError(''); }}
          onConfirm={submit}
        />
      ) : null}
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
  screen: {flex: 1, paddingHorizontal: 16, paddingTop: 4},
  loader: {marginTop: 32},
  card: {
    backgroundColor: c.card,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.line,
    padding: 16,
    marginBottom: 14,
  },
  kicker: {color: c.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase'},
  name: {color: c.text, fontSize: 20, fontWeight: '800', marginTop: 6},
  lead: {color: c.muted, lineHeight: 20, marginTop: 8},
  input: {backgroundColor: c.card, color: c.text, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10, fontSize: 15},
  primary: {backgroundColor: c.accent, borderRadius: 14, paddingVertical: 13, alignItems: 'center'},
  danger: {backgroundColor: c.danger, borderRadius: 14, paddingVertical: 13, alignItems: 'center'},
  buttonText: {color: c.onAccent, fontWeight: '800', fontSize: 15},
  dangerText: {color: '#ffffff', fontWeight: '800', fontSize: 15},
  error: {color: c.danger, marginTop: 12},
});
}
