import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import {Palette, useColors, useThemedStyles} from '../theme';

type Props = {
  title: string;
  lines: string[];
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmSheet({title, lines, busy, error, onCancel, onConfirm}: Props) {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.backdrop}>
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>{title}</Text>
        {lines.map(line => (
          <Text key={line} style={styles.line}>
            {line}
          </Text>
        ))}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.row}>
          <Pressable style={styles.secondary} onPress={onCancel} disabled={busy}>
            <Text style={styles.secondaryText}>Cancel</Text>
          </Pressable>
          <Pressable style={styles.primary} onPress={onConfirm} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.primaryText}>Confirm</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
  backdrop: {...StyleSheet.absoluteFill, backgroundColor: 'rgba(5,8,14,0.72)', justifyContent: 'flex-end'},
  sheet: {backgroundColor: c.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 16},
  handle: {alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: c.line, marginBottom: 14},
  title: {color: c.text, fontSize: 18, fontWeight: '700', marginBottom: 8},
  line: {color: c.text, lineHeight: 22, marginBottom: 6},
  error: {color: c.danger, marginVertical: 8},
  row: {flexDirection: 'row', gap: 10, marginTop: 16},
  secondary: {flex: 1, backgroundColor: c.background, borderRadius: 12, paddingVertical: 11, alignItems: 'center'},
  secondaryText: {color: c.text, fontWeight: '600'},
  primary: {flex: 1, backgroundColor: c.accent, borderRadius: 12, paddingVertical: 11, alignItems: 'center'},
  primaryText: {color: c.onAccent, fontWeight: '700'},
});
}
