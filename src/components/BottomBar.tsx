import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {Pressable, StyleSheet, View} from 'react-native';
import Svg, {Path, Rect} from 'react-native-svg';
import {RootStackParamList} from '../navigation/RootNavigator';
import {Palette, useColors, useThemedStyles} from '../theme';

type Tab = 'Wallet' | 'Browser';

export default function BottomBar({current}: {current: Tab}) {
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const items: {id: Tab; label: string}[] = [
    {id: 'Wallet', label: 'Wallet'},
    {id: 'Browser', label: 'dApps'},
  ];
  return (
    <View style={styles.bar} pointerEvents="auto">
      {items.map(item => {
        const selected = current === item.id;
        return (
          <Pressable
            key={item.id}
            style={[styles.item, selected && styles.itemOn]}
            onPress={() => navigation.navigate(item.id)}
            accessibilityLabel={item.label}>
            {item.id === 'Wallet' ? <WalletMark selected={selected} /> : <AppsMark selected={selected} />}
          </Pressable>
        );
      })}
    </View>
  );
}

function WalletMark({selected}: {selected: boolean}) {
  const colors = useColors();
  const color = selected ? colors.onAccent : colors.text;
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="6" width="18" height="13" rx="3" stroke={color} strokeWidth={2} />
      <Path d="M3 10h18" stroke={color} strokeWidth={2} />
      <Path d="M16 14h2" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function AppsMark({selected}: {selected: boolean}) {
  const colors = useColors();
  const color = selected ? colors.onAccent : colors.text;
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Rect x="4" y="4" width="6.5" height="6.5" rx="1.6" stroke={color} strokeWidth={2} />
      <Rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" stroke={color} strokeWidth={2} />
      <Rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" stroke={color} strokeWidth={2} />
      <Rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" stroke={color} strokeWidth={2} />
    </Svg>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    bar: {
      alignSelf: 'center',
      flexDirection: 'row',
      gap: 8,
      padding: 6,
      borderRadius: 28,
      backgroundColor: c.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
    },
    item: {width: 52, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center'},
    itemOn: {backgroundColor: c.accent},
  });
}
