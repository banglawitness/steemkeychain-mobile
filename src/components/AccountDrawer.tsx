import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import React, {useEffect, useRef, useState} from 'react';
import {Animated, Dimensions, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Path} from 'react-native-svg';
import {useVault} from '../auth/VaultContext';
import {APP_VERSION} from '../config';
import {RootStackParamList} from '../navigation/RootNavigator';
import {Palette, useThemedStyles} from '../theme';

type Props = {
  open: boolean;
  onClose: () => void;
};

const PANEL_WIDTH = Math.round(Dimensions.get('window').width * 0.7);
const DISCORD_URL = 'https://discord.gg/RpCUTjk5Yw';

export default function AccountDrawer({open, onClose}: Props) {
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const {accounts, activeName, lock} = useVault();
  const slide = useRef(new Animated.Value(-PANEL_WIDTH)).current;
  const shade = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(open);

  useEffect(() => {
    if (!open) return;
    slide.setValue(-PANEL_WIDTH);
    shade.setValue(0);
    setShown(true);
  }, [open, shade, slide]);

  useEffect(() => {
    if (!shown) return;
    Animated.parallel([
      Animated.timing(slide, {toValue: open ? 0 : -PANEL_WIDTH, duration: open ? 240 : 200, useNativeDriver: true}),
      Animated.timing(shade, {toValue: open ? 1 : 0, duration: open ? 240 : 200, useNativeDriver: true}),
    ]).start(({finished}) => {
      if (finished && !open) setShown(false);
    });
  }, [shown, open, shade, slide]);

  if (!shown) return null;

  const go = (route: 'Governance' | 'Settings' | 'About' | 'Privacy' | 'Account' | 'AddKey' | 'Import' | 'Export') => {
    onClose();
    navigation.navigate(route);
  };

  return (
    <View style={styles.overlay}>
      <Animated.View style={[styles.backdrop, {opacity: shade}]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.panel,
          {top: insets.top + 10, bottom: insets.bottom + 16, transform: [{translateX: slide}]},
        ]}>
        <View style={styles.head}>
          <View style={styles.brand}>
            <Image source={require('../../assets/steem-keychain-logo.png')} style={styles.logo} resizeMode="contain" />
            <Text style={styles.headTitle} numberOfLines={1}>Steem Keychain</Text>
          </View>
          <Pressable style={styles.close} onPress={onClose} accessibilityLabel="Close menu" hitSlop={8}>
            <Text style={styles.closeText}>‹</Text>
          </Pressable>
        </View>
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
          <Segment title="Account">
            <Row label="Manage keys" disabled={!activeName} onPress={() => go('Account')} />
            <Row label="Add account" onPress={() => go('AddKey')} />
            <Row label="Import" onPress={() => go('Import')} />
            <Row label="Export" last disabled={accounts.length === 0} onPress={() => go('Export')} />
          </Segment>
          <Segment title="App">
            <Row label="Governance" disabled={!activeName} onPress={() => go('Governance')} />
            <Row label="Settings" onPress={() => go('Settings')} />
            <Row label="About" onPress={() => go('About')} />
            <Row label="Privacy" last onPress={() => go('Privacy')} />
          </Segment>
          <Pressable style={styles.lock} onPress={() => { onClose(); lock(); }}>
            <Text style={styles.lockText}>Lock</Text>
          </Pressable>
        </ScrollView>
        <View style={styles.versionRow}>
          <Text style={styles.version}>Version {APP_VERSION}</Text>
          <Pressable
            style={styles.discord}
            onPress={() => Linking.openURL(DISCORD_URL)}
            accessibilityLabel="Open Discord">
            <Svg width={18} height={18} viewBox="0 0 24 24">
              <Path
                fill="#ffffff"
                d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.37-.44.86-.6 1.25-1.85-.28-3.68-.28-5.49 0-.16-.39-.41-.87-.62-1.25a.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.88 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.05c2.05 1.51 4.04 2.42 5.99 3.03a.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-1.99a.08.08 0 0 0-.04-.11 12.3 12.3 0 0 1-1.87-.89.08.08 0 0 1-.01-.13c.13-.09.25-.19.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01c.12.1.25.2.37.29a.08.08 0 0 1-.01.13 12.3 12.3 0 0 1-1.87.89.08.08 0 0 0-.04.11c.36.7.77 1.36 1.23 1.99a.08.08 0 0 0 .08.03c1.96-.61 3.95-1.52 6-3.03a.08.08 0 0 0 .03-.05c.5-5.18-.84-9.68-3.55-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42z"
              />
            </Svg>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

function Segment({title, children}: {title: string; children: React.ReactNode}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.block}>
      <Text style={styles.kicker}>{title}</Text>
      <View style={styles.segment}>{children}</View>
    </View>
  );
}

function Row({label, onPress, disabled, last}: {label: string; onPress: () => void; disabled?: boolean; last?: boolean}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable style={[styles.row, !last && styles.rowLine, disabled && styles.disabled]} disabled={disabled} onPress={onPress}>
      <Text style={styles.rowText} numberOfLines={1}>{label}</Text>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
  overlay: {...StyleSheet.absoluteFill, zIndex: 30},
  backdrop: {...StyleSheet.absoluteFill, backgroundColor: 'rgba(5,8,14,0.55)'},
  panel: {
    position: 'absolute',
    left: 0,
    width: PANEL_WIDTH,
    backgroundColor: c.card,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
  },
  head: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, gap: 8},
  brand: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8},
  logo: {width: 32, height: 32},
  headTitle: {color: '#00d3cc', fontSize: 16, fontWeight: '800', flexShrink: 1},
  close: {width: 36, height: 36, borderRadius: 8, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center'},
  closeText: {color: c.text, fontSize: 22, fontWeight: '600', lineHeight: 24},
  scroll: {flex: 1},
  list: {paddingHorizontal: 12, paddingBottom: 16, flexGrow: 1},
  versionRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 14, paddingTop: 8, paddingHorizontal: 12},
  version: {color: c.muted, fontSize: 12, fontWeight: '600'},
  discord: {width: 28, height: 28, borderRadius: 8, backgroundColor: '#5865F2', alignItems: 'center', justifyContent: 'center'},
  block: {marginTop: 14},
  kicker: {color: c.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4},
  segment: {backgroundColor: c.background, borderRadius: 10, overflow: 'hidden'},
  row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 14},
  rowLine: {borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line},
  rowText: {color: c.text, fontSize: 15, fontWeight: '600', flex: 1},
  chevron: {color: c.muted, fontSize: 18, lineHeight: 18, marginLeft: 8},
  lock: {marginTop: 18, marginHorizontal: 18, borderRadius: 8, backgroundColor: c.dangerSoft, paddingVertical: 12, alignItems: 'center'},
  lockText: {color: c.danger, fontWeight: '800'},
  disabled: {opacity: 0.4},
});
}
