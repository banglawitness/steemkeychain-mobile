import {useEffect, useState} from 'react';
import {Image, StyleSheet, View} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {useColors} from '../theme';

function avatarUrl(name: string) {
  const user = name.trim().toLowerCase();
  if (!user) return '';
  return `https://steemitimages.com/u/${encodeURIComponent(user)}/avatar/small`;
}

export default function AccountAvatar({name, size = 28}: {name: string; size?: number}) {
  const colors = useColors();
  const uri = avatarUrl(name);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [uri]);
  if (!uri || failed) return <PersonMark size={size} color={colors.muted} background={colors.card} />;
  return (
    <Image
      source={{uri}}
      style={{width: size, height: size, borderRadius: size / 2, backgroundColor: colors.card}}
      onError={() => setFailed(true)}
    />
  );
}

function PersonMark({size, color, background}: {size: number; color: string; background: string}) {
  return (
    <View style={[styles.person, {width: size, height: size, borderRadius: size / 2, backgroundColor: background}]}>
      <Svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24">
        <Path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-3.3 0-8 1.7-8 4v1.2h16V18c0-2.3-4.7-4-8-4z" fill={color} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  person: {alignItems: 'center', justifyContent: 'center'},
});
