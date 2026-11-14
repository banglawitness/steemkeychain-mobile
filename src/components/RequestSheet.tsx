import {useEffect, useState} from 'react';
import {ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {describeRequest, KeychainRequest, requestCode, requestTitle, requiredRole} from '../browser/requests';
import {Palette, useColors, useThemedStyles} from '../theme';
import {StoredAccount} from '../types';
import AccountAvatar from './AccountAvatar';

type Props = {
  request: KeychainRequest;
  accounts: StoredAccount[];
  activeName: string | null;
  onApprove: (account: StoredAccount, remember: boolean) => void;
  onReject: () => void;
  busy: boolean;
  error: string;
};

export default function RequestSheet({request, accounts, activeName, onApprove, onReject, busy, error}: Props) {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const account = accounts.find(item => item.name === activeName) || accounts[0];
  const [remember, setRemember] = useState(false);
  const [acting, setActing] = useState<'confirm' | 'reject' | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const role = requiredRole(request);
  const host = hostOf(request.domain);
  const lines = describeRequest(request);
  const code = requestCode(request);
  const working = busy || acting !== null;
  useEffect(() => {
    if (error) setActing(null);
  }, [error]);

  return (
    <View style={styles.backdrop}>
      <View style={styles.sheet}>
        <View style={styles.head}>
          <View style={styles.headCopy}>
            <Text style={styles.kicker} numberOfLines={1}>{host}</Text>
            <Text style={styles.title} numberOfLines={1}>{requestTitle(request.type)}</Text>
          </View>
          <Text style={styles.role}>{role}</Text>
        </View>
        {account ? (
          <View style={styles.accountRow}>
            <AccountAvatar name={account.name} size={28} />
            <Text style={styles.account}>@{account.name}</Text>
          </View>
        ) : null}
        {lines.length ? (
          <View style={styles.details}>
            {lines.map(line => (
              <Text key={line} style={styles.line} numberOfLines={2}>{line}</Text>
            ))}
          </View>
        ) : null}
        {code ? (
          <View style={styles.codeCard}>
            <Pressable style={styles.codeHead} onPress={() => setCodeOpen(value => !value)}>
              <Text style={styles.codeTitle}>Operations</Text>
              <Text style={styles.chevron}>{codeOpen ? '▾' : '›'}</Text>
            </Pressable>
            {codeOpen ? (
              <ScrollView style={styles.codeScroll} nestedScrollEnabled>
                <Text style={styles.code} selectable>{code}</Text>
              </ScrollView>
            ) : null}
          </View>
        ) : null}
        {role === 'posting' ? (
          <Pressable style={styles.check} onPress={() => setRemember(value => !value)}>
            <View style={[styles.box, remember && styles.boxOn]}>{remember ? <Text style={styles.tick}>✓</Text> : null}</View>
            <Text style={styles.checkText}>Don’t ask again for this operation on {host}</Text>
          </Pressable>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.row}>
          <Pressable
            style={({pressed}) => [styles.secondary, (pressed || acting === 'reject') && styles.secondaryPressed, working && acting !== 'reject' && styles.disabled]}
            disabled={working}
            onPress={() => {
              setActing('reject');
              requestAnimationFrame(() => onReject());
            }}>
            {acting === 'reject' ? <ActivityIndicator color={colors.text} /> : <Text style={styles.secondaryText}>Reject</Text>}
          </Pressable>
          <Pressable
            style={({pressed}) => [styles.primary, (pressed || acting === 'confirm' || busy) && styles.primaryPressed, (!account || (working && acting === 'reject')) && styles.disabled]}
            disabled={!account || working}
            onPress={() => {
              if (!account) return;
              setActing('confirm');
              requestAnimationFrame(() => onApprove(account, remember));
            }}>
            {acting === 'confirm' || busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.primaryText}>Confirm</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function hostOf(domain: unknown) {
  try {
    return new URL(String(domain || '')).hostname || 'this site';
  } catch {
    return 'this site';
  }
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 40,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: c.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 14,
    maxHeight: '80%',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  headCopy: {
    flex: 1,
  },
  kicker: {
    color: c.muted,
    fontSize: 12,
  },
  title: {
    color: c.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 1,
  },
  role: {
    color: c.accentDeep,
    backgroundColor: c.accentSoft,
    overflow: 'hidden',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  details: {
    marginBottom: 10,
    gap: 4,
  },
  line: {
    color: c.text,
    fontSize: 13,
    lineHeight: 18,
  },
  accountRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10},
  account: {
    color: c.muted,
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  codeCard: {
    backgroundColor: c.background,
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
  },
  codeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  codeTitle: {
    color: c.text,
    fontSize: 13,
    fontWeight: '700',
  },
  chevron: {
    color: c.muted,
    fontSize: 16,
  },
  codeScroll: {
    maxHeight: 220,
    borderTopWidth: 1,
    borderTopColor: c.line,
  },
  code: {
    color: c.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    lineHeight: 16,
    padding: 12,
  },
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: c.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: {
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  tick: {
    color: c.onAccent,
    fontWeight: '700',
  },
  checkText: {
    color: c.text,
    flex: 1,
  },
  error: {
    color: c.danger,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  secondary: {
    flex: 1,
    minHeight: 46,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  secondaryPressed: {
    backgroundColor: c.line,
  },
  secondaryText: {
    color: c.text,
  },
  primary: {
    flex: 1,
    minHeight: 46,
    justifyContent: 'center',
    backgroundColor: c.accent,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  primaryPressed: {
    opacity: 0.75,
  },
  primaryText: {
    color: c.onAccent,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.45,
  },
});
}
