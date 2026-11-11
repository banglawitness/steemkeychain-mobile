import * as Clipboard from 'expo-clipboard';
import {File, Paths} from 'expo-file-system';
import {Asset, requestPermissionsAsync} from 'expo-media-library';
import {useRef, useState} from 'react';
import {Pressable, Share, StyleSheet, Text, View} from 'react-native';
import QRCode from 'react-qr-code';
import {useVault} from '../auth/VaultContext';
import {Palette, useThemedStyles} from '../theme';

type QrHandle = {
  toDataURL: (callback: (base64: string) => void, options?: {width?: number; height?: number}) => void;
};

export default function ReceiveScreen() {
  const styles = useThemedStyles(makeStyles);
  const {activeName} = useVault();
  const qrRef = useRef<QrHandle | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  if (!activeName) {
    return (
      <View style={styles.screen}>
        <Text style={styles.lead}>Choose an account on the wallet first.</Text>
      </View>
    );
  }

  const saveQr = async () => {
    if (!qrRef.current || saving) return;
    setNote('');
    const permission = await requestPermissionsAsync(true, ['photo']);
    if (!permission.granted) {
      setNote('Allow photos to save the QR code.');
      return;
    }
    setSaving(true);
    qrRef.current.toDataURL(async base64 => {
      try {
        const payload = base64.replace(/^data:image\/\w+;base64,/, '');
        const file = new File(Paths.cache, `steem-receive-${activeName}.png`);
        file.create({overwrite: true});
        await file.write(payload, {encoding: 'base64'});
        await Asset.create(file.uri);
        setNote('Saved to photos.');
      } catch {
        setNote('Could not save the QR code.');
      } finally {
        setSaving(false);
      }
    }, {width: 512, height: 512});
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.lead}>Show this code so someone can send STEEM or SBD to @{activeName}.</Text>
      <View style={styles.card}>
        <QRCode ref={qrRef as never} value={`@${activeName}`} size={168} bgColor="#ffffff" fgColor="#10141c" />
      </View>
      <Text style={styles.name}>@{activeName}</Text>
      <View style={styles.actions}>
        <Pressable style={styles.button} onPress={async () => { await Clipboard.setStringAsync(`@${activeName}`); setCopied(true); }}>
          <Text style={styles.buttonText}>{copied ? 'Copied' : 'Copy'}</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => Share.share({message: `@${activeName}`})}>
          <Text style={styles.buttonText}>Share</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={saveQr} disabled={saving}>
          <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save QR'}</Text>
        </Pressable>
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
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
  note: {color: c.muted, fontSize: 13, marginTop: 12, textAlign: 'center'},
});
}
