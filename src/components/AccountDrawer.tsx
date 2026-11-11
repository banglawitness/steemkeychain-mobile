import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import React, {useEffect, useRef, useState} from 'react';
import {Animated, Dimensions, Image, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useVault} from '../auth/VaultContext';
import {APP_VERSION} from '../config';
import {RootStackParamList} from '../navigation/RootNavigator';
import {Palette, useThemedStyles} from '../theme';

type Props = {
  open: boolean;
  onClose: () => void;
};

const PANEL_WIDTH = Math.round(Dimensions.get('window').width * 0.7);

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
            <Row label="Export QR" last disabled={accounts.length === 0} onPress={() => go('Export')} />
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
        <Text style={styles.version}>Version {APP_VERSION}</Text>
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
  version: {color: c.muted, fontSize: 12, fontWeight: '600', textAlign: 'center', paddingBottom: 14, paddingTop: 8},
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
