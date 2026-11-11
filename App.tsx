import {StatusBar} from 'expo-status-bar';
import {useState} from 'react';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider, initialWindowMetrics} from 'react-native-safe-area-context';
import {VaultProvider} from './src/auth/VaultContext';
import ActivityWatcher from './src/components/ActivityWatcher';
import ButtonNavigationInset from './src/components/ButtonNavigationInset';
import OpeningSplash from './src/components/OpeningSplash';
import StoreUpdate from './src/components/StoreUpdate';
import RootNavigator from './src/navigation/RootNavigator';
import {ThemeProvider, useTheme} from './src/theme';

function Chrome() {
  const {mode} = useTheme();
  const [opening, setOpening] = useState(true);
  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <ActivityWatcher />
      <RootNavigator />
      {opening ? <OpeningSplash onDone={() => setOpening(false)} /> : null}
      <StoreUpdate />
    </>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <ButtonNavigationInset>
          <ThemeProvider>
            <VaultProvider>
              <Chrome />
            </VaultProvider>
          </ThemeProvider>
        </ButtonNavigationInset>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
