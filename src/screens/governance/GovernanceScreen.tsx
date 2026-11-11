import {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useVault} from '../../auth/VaultContext';
import {Palette, useThemedStyles} from '../../theme';
import ProposalList from './ProposalList';
import ProxyForm from './ProxyForm';
import WitnessList from './WitnessList';

type Tab = 'witnesses' | 'proxy' | 'proposals';

const TABS: {id: Tab; label: string; hint: string}[] = [
  {id: 'witnesses', label: 'Witnesses', hint: 'Block producers. You can support up to 30.'},
  {id: 'proxy', label: 'Proxy', hint: 'One account can cast these votes for you.'},
  {id: 'proposals', label: 'Proposals', hint: 'Steem DAO projects, ranked by votes.'},
];

export default function GovernanceScreen() {
  const styles = useThemedStyles(makeStyles);
  const {activeName} = useVault();
  const [tab, setTab] = useState<Tab>('witnesses');
  const [version, setVersion] = useState(0);
  const current = TABS.find(item => item.id === tab) || TABS[0];

  if (!activeName) {
    return (
      <View style={styles.empty}>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No account selected</Text>
          <Text style={styles.note}>Open the wallet and choose an account before voting.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.switcher}>
        {TABS.map(item => {
          const on = tab === item.id;
          return (
            <Pressable key={item.id} style={[styles.tab, on && styles.tabOn]} onPress={() => setTab(item.id)}>
              <Text style={[styles.tabText, on && styles.tabTextOn]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>{current.hint}</Text>
      {tab === 'witnesses' ? <WitnessList key={`witnesses-${version}`} /> : null}
      {tab === 'proxy' ? <ProxyForm onChanged={() => setVersion(value => value + 1)} /> : null}
      {tab === 'proposals' ? <ProposalList key={`proposals-${version}`} /> : null}
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    screen: {flex: 1, backgroundColor: c.background},
    empty: {flex: 1, backgroundColor: c.background, padding: 16, justifyContent: 'center'},
    emptyCard: {
      backgroundColor: c.card,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
      padding: 18,
    },
    emptyTitle: {color: c.text, fontSize: 17, fontWeight: '800', marginBottom: 6},
    note: {color: c.muted, fontSize: 13, lineHeight: 18},
    switcher: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginTop: 8,
      padding: 4,
      borderRadius: 16,
      backgroundColor: c.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
    },
    tab: {flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center'},
    tabOn: {backgroundColor: c.accentSoft},
    tabText: {color: c.muted, fontSize: 13, fontWeight: '700'},
    tabTextOn: {color: c.accentDeep},
    hint: {color: c.muted, fontSize: 12, lineHeight: 16, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8},
  });
}
