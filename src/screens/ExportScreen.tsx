import {useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View} from 'react-native';
import QRCode from 'react-qr-code';
import {useVault} from '../auth/VaultContext';
import {buildAccountQrPages, encodeAccountQrPage} from '../crypto/accountQr';
import {Palette, useThemedStyles} from '../theme';

export default function ExportScreen() {
  const styles = useThemedStyles(makeStyles);
  const {accounts} = useVault();
  const {width} = useWindowDimensions();
  const pages = useMemo(() => buildAccountQrPages(accounts), [accounts]);
  const [pageIndex, setPageIndex] = useState(0);
  const [notSharing, setNotSharing] = useState(false);
  const [understandsLoss, setUnderstandsLoss] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const hasKeys = pages.some(page => page.data.some(account => Object.keys(account.keys).length > 0));

  if (pages.length === 0) {
    return (
      <View style={styles.screen}>
        <Text style={styles.lead}>Import an account before exporting a QR code.</Text>
      </View>
    );
  }

  if (!hasKeys) {
    return (
      <View style={styles.screen}>
        <Text style={styles.lead}>These accounts have no private keys to put in a QR code.</Text>
      </View>
    );
  }

  const page = pages[Math.min(pageIndex, pages.length - 1)];
  const qrSize = Math.min(width - 120, 220);
  const confirmed = notSharing && understandsLoss;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.lead}>
        This QR code contains the private keys for these accounts. Use it only to import them into
        Steem Keychain.
      </Text>
      <Text style={styles.warning}>Do not share it with anyone.</Text>
      {revealed ? (
        <View>
          <Text style={styles.pageLabel}>
            {page.index}/{page.total} : {page.data.map(account => `@${account.name}`).join(', ')}
          </Text>
          <View style={styles.qrCard}>
            <QRCode
              value={encodeAccountQrPage(page)}
              size={qrSize}
              bgColor="#ffffff"
              fgColor="#10141c"
            />
          </View>
          {pages.length > 1 ? (
            <>
              <View style={styles.row}>
                <Pressable
                  style={[styles.secondary, pageIndex === 0 && styles.disabled]}
                  disabled={pageIndex === 0}
                  onPress={() => setPageIndex(index => Math.max(0, index - 1))}>
                  <Text style={styles.secondaryText}>Previous</Text>
                </Pressable>
                <Pressable
                  style={[styles.secondary, pageIndex >= pages.length - 1 && styles.disabled]}
                  disabled={pageIndex >= pages.length - 1}
                  onPress={() => setPageIndex(index => Math.min(pages.length - 1, index + 1))}>
                  <Text style={styles.secondaryText}>Next</Text>
                </Pressable>
              </View>
              <Text style={styles.hint}>Scan the pages in order. Each code holds up to two accounts.</Text>
            </>
          ) : null}
        </View>
      ) : (
        <View>
          <CheckRow
            checked={notSharing}
            label="I am not sharing my screen, and I will not send a screenshot of these QR codes to anyone."
            onPress={() => setNotSharing(value => !value)}
          />
          <CheckRow
            checked={understandsLoss}
            label="I understand that anyone who scans these QR codes can take the funds in these accounts."
            onPress={() => setUnderstandsLoss(value => !value)}
          />
          <Pressable
            style={[styles.primary, !confirmed && styles.disabled]}
            disabled={!confirmed}
            onPress={() => setRevealed(true)}>
            <Text style={styles.primaryText}>Show QR code</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

function CheckRow({
  checked,
  label,
  onPress,
}: {
  checked: boolean;
  label: string;
  onPress: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable style={styles.checkRow} onPress={onPress}>
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <Text style={styles.tick}>✓</Text> : null}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: c.background,
  },
  content: {
    padding: 14,
    paddingBottom: 20,
  },
  lead: {
    color: c.muted,
    lineHeight: 22,
    marginBottom: 12,
  },
  warning: {
    color: c.danger,
    fontWeight: '700',
    marginBottom: 20,
  },
  pageLabel: {
    color: c.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  qrCard: {
    alignSelf: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  hint: {
    color: c.muted,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: c.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  boxChecked: {
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  tick: {
    color: c.onAccent,
    fontSize: 14,
    fontWeight: '700',
  },
  checkLabel: {
    flex: 1,
    color: c.text,
    lineHeight: 22,
  },
  secondary: {
    flex: 1,
    borderColor: c.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryText: {
    color: c.text,
    fontSize: 16,
  },
  primary: {
    backgroundColor: c.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryText: {
    color: c.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.4,
  },
});
}
