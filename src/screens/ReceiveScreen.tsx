import * as Clipboard from 'expo-clipboard';
import {useState} from 'react';
import {Pressable, Share, StyleSheet, Text, View} from 'react-native';
import QRCode from 'react-qr-code';
import {useVault} from '../auth/VaultContext';
import {Palette, useThemedStyles} from '../theme';

export default function ReceiveScreen() {
  const styles = useThemedStyles(makeStyles);
  const {activeName} = useVault();
  const [copied, setCopied] = useState(false);
  if (!activeName) {
    return (
      <View style={styles.screen}>
        <Text style={styles.lead}>Choose an account on the wallet first.</Text>
      </View>
    );
  }
  return (
    <View style={styles.screen}>
      <Text style={styles.lead}>Show this code so someone can send STEEM or SBD to @{activeName}.</Text>
      <View style={styles.card}>
        <QRCode value={`@${activeName}`} size={168} bgColor="#ffffff" fgColor="#10141c" />
      </View>
      <Text style={styles.name}>@{activeName}</Text>
      <View style={styles.actions}>
        <Pressable style={styles.button} onPress={async () => { await Clipboard.setStringAsync(`@${activeName}`); setCopied(true); }}>
          <Text style={styles.buttonText}>{copied ? 'Copied' : 'Copy'}</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => Share.share({message: `@${activeName}`})}>
          <Text style={styles.buttonText}>Share</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
  screen: {flex: 1, backgroundColor: c.background, padding: 16, alignItems: 'center', justifyContent: 'center'},
  lead: {color: c.muted, fontSize: 13, lineHeight: 18, marginBottom: 14, textAlign: 'center'},
  card: {backgroundColor: '#ffffff', borderRadius: 14, padding: 12},
  name: {color: c.text, fontSize: 18, fontWeight: '700', marginTop: 12},
  actions: {flexDirection: 'row', gap: 8, marginTop: 12},
  button: {backgroundColor: c.card, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 9},
  buttonText: {color: c.text, fontWeight: '700'},
});
}
