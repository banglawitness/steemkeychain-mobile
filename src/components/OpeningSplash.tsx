import {useEffect, useRef} from 'react';
import {Animated, Easing, StyleSheet} from 'react-native';
import {useColors} from '../theme';

const logo = require('../../assets/steem-keychain-logo.png');

export default function OpeningSplash({onDone}: {onDone: () => void}) {
  const colors = useColors();
  const mark = useRef(new Animated.Value(0)).current;
  const slogan = useRef(new Animated.Value(0)).current;
  const cover = useRef(new Animated.Value(1)).current;
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(mark, {toValue: 1, duration: 720, easing: Easing.out(Easing.cubic), useNativeDriver: true}),
        Animated.sequence([
          Animated.delay(260),
          Animated.timing(slogan, {toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true}),
        ]),
      ]),
      Animated.delay(700),
      Animated.timing(cover, {toValue: 0, duration: 380, easing: Easing.in(Easing.cubic), useNativeDriver: true}),
    ]);
    animation.start(({finished}) => {
      if (finished) done.current();
    });
    return () => animation.stop();
  }, [cover, mark, slogan]);

  return (
    <Animated.View style={[styles.cover, {backgroundColor: colors.background, opacity: cover}]}>
      <Animated.Image
        source={logo}
        resizeMode="contain"
        style={{
          width: 112,
          height: 112,
          opacity: mark,
          transform: [{scale: mark.interpolate({inputRange: [0, 1], outputRange: [0.84, 1]})}],
        }}
      />
      <Animated.Text
        style={{
          marginTop: 22,
          color: colors.muted,
          fontSize: 14,
          fontWeight: '600',
          letterSpacing: 0.3,
          opacity: slogan,
          transform: [{translateY: slogan.interpolate({inputRange: [0, 1], outputRange: [10, 0]})}],
        }}>
        Powered by Steem
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
