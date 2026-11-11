import {ReactNode, useEffect, useMemo, useState} from 'react';
import {AppState, Platform, View} from 'react-native';
import {EdgeInsets, SafeAreaInsetsContext, useSafeAreaInsets} from 'react-native-safe-area-context';
import {getNavigationBarHeight, getNavigationMode} from 'navigation-mode';

function buttonBarHeight(): number {
  if (Platform.OS !== 'android') return 0;
  const mode = getNavigationMode();
  if (mode !== 0 && mode !== 1) return 0;
  return getNavigationBarHeight();
}

export default function ButtonNavigationInset({children}: {children: ReactNode}) {
  const insets = useSafeAreaInsets();
  const [barHeight, setBarHeight] = useState(buttonBarHeight);

  useEffect(() => {
    const read = () => setBarHeight(buttonBarHeight());
    read();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') read();
    });
    return () => sub.remove();
  }, []);

  const value = useMemo<EdgeInsets>(
    () => (barHeight > 0 ? {...insets, bottom: 0} : insets),
    [barHeight, insets],
  );

  return (
    <View style={{flex: 1, paddingBottom: barHeight}}>
      <SafeAreaInsetsContext.Provider value={value}>{children}</SafeAreaInsetsContext.Provider>
    </View>
  );
}
