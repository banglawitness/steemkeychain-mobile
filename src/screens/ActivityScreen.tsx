import {useFocusEffect} from '@react-navigation/native';
import {useCallback, useState} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {markNoticesSeen, Notice, readNotices} from '../storage/notices';
import {Palette, useThemedStyles} from '../theme';

export default function ActivityScreen() {
  const styles = useThemedStyles(makeStyles);
  const [rows, setRows] = useState<Notice[]>([]);

  useFocusEffect(useCallback(() => {
    let alive = true;
    readNotices().then(async notices => {
      if (!alive) return;
      setRows(notices);
      await markNoticesSeen();
    }).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.lead}>Votes, replies, mentions, follows, and incoming transfers for the active account.</Text>
      {rows.length === 0 ? <Text style={styles.empty}>No activity yet. New chain events show up while the app is open, and again when you come back.</Text> : null}
      {rows.map(row => (
        <View key={row.id} style={styles.card}>
          <Text style={styles.kind}>{row.kind}</Text>
          <Text style={styles.text}>{row.text}</Text>
          <Text style={styles.time}>{row.timestamp.replace('T', ' ').slice(0, 16)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
  screen: {flex: 1, backgroundColor: c.background},
  content: {padding: 14, paddingBottom: 20},
  lead: {color: c.muted, lineHeight: 20, marginBottom: 14},
  empty: {color: c.muted, lineHeight: 20},
  card: {backgroundColor: c.card, borderRadius: 12, padding: 10, marginBottom: 6},
  kind: {color: c.accent, fontSize: 12, fontWeight: '700', textTransform: 'uppercase'},
  text: {color: c.text, marginTop: 4, lineHeight: 20},
  time: {color: c.muted, marginTop: 6, fontSize: 12},
});
}
