import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Palette, useThemedStyles} from '../theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

type Props = {
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  onConfirm?: () => void;
};

export default function PinPad({value, onChange, maxLength = 4, onConfirm}: Props) {
  const styles = useThemedStyles(makeStyles);
  const press = (key: string) => {
    if (key === 'del') {
      onChange(value.slice(0, -1));
      return;
    }
    if (!key || value.length >= maxLength) return;
    onChange(value + key);
  };

  return (
    <View>
      <View style={styles.dots}>
        {Array.from({length: maxLength}, (_, index) => (
          <View
            key={index}
            style={[styles.dot, index < value.length && styles.dotFilled]}
          />
        ))}
      </View>
      <View style={styles.grid}>
        {KEYS.map(key => (
          <Pressable
            key={key || 'tick'}
            style={styles.key}
            onPress={() => (key ? press(key) : value.length >= maxLength && onConfirm?.())}
            accessibilityLabel={key ? undefined : 'Confirm'}>
            {key === 'del' ? (
              <View style={styles.crossButton}>
                <Text style={styles.cross}>×</Text>
              </View>
            ) : !key ? (
              <Text style={styles.tick}>✓</Text>
            ) : (
              <Text style={styles.keyText}>{key}</Text>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    marginBottom: 28,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: c.muted,
  },
  dotFilled: {
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  key: {
    width: '30%',
    paddingVertical: 12,
    margin: 4,
    alignItems: 'center',
  },
  keyText: {
    color: c.text,
    fontSize: 20,
  },
  tick: {
    color: c.accent,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
  },
  crossButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cross: {
    color: c.onAccent,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 30,
  },
});
}
