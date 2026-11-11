import {DarkTheme, DefaultTheme, NavigationContainer, useNavigation} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import {useLayoutEffect} from 'react';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import {initialWindowMetrics, useSafeAreaInsets} from 'react-native-safe-area-context';
import {useVault} from '../auth/VaultContext';
import AccountScreen from '../screens/AccountScreen';
import ActivityScreen from '../screens/ActivityScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AddKeyScreen from '../screens/AddKeyScreen';
import BrowserScreen from '../screens/BrowserScreen';
import GovernanceScreen from '../screens/governance/GovernanceScreen';
import ExportScreen from '../screens/ExportScreen';
import HistoryScreen from '../screens/HistoryScreen';
import ImportScreen from '../screens/ImportScreen';
import OperationScreen from '../screens/OperationScreen';
import ReceiveScreen from '../screens/ReceiveScreen';
import ScanScreen from '../screens/ScanScreen';
import SetupScreen from '../screens/SetupScreen';
import UnlockScreen from '../screens/UnlockScreen';
import WalletScreen from '../screens/WalletScreen';
import {Palette, useColors, useTheme, useThemedStyles} from '../theme';

export type RootStackParamList = {
  Wallet: undefined;
  Browser: {url?: string} | undefined;
  Import: undefined;
  Export: undefined;
  Scan: undefined;
  AddKey: {username?: string} | undefined;
  Operate: {
    kind: 'transfer' | 'powerUp' | 'powerDown' | 'delegate' | 'savings' | 'convert' | 'claim';
    currency?: 'STEEM' | 'SBD';
  };
  Receive: undefined;
  History: undefined;
  Account: undefined;
  Governance: undefined;
  Activity: undefined;
  Settings: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

function AddAccountScreen() {
  const {accounts} = useVault();
  const navigation = useNavigation();
  const required = accounts.length === 0;
  useLayoutEffect(() => {
    navigation.setOptions({headerShown: !required, title: 'Add account'});
  }, [navigation, required]);
  return <AddKeyScreen required={required} />;
}

export default function RootNavigator() {
  const colors = useColors();
  const {mode} = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const statusBarHeight = insets.top || initialWindowMetrics?.insets.top || 0;
  const {ready, pinReady, unlocked, accounts} = useVault();

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!pinReady) return <SetupScreen />;
  if (!unlocked) return <UnlockScreen />;

  return (
    <NavigationContainer
      theme={{
        ...(mode === 'light' ? DefaultTheme : DarkTheme),
        colors: {
          ...(mode === 'light' ? DefaultTheme.colors : DarkTheme.colors),
          background: colors.background,
          card: colors.card,
          text: colors.text,
          border: colors.line,
          primary: colors.accent,
        },
      }}>
      <Stack.Navigator
        initialRouteName={accounts.length === 0 ? 'AddKey' : 'Wallet'}
        screenOptions={{
          headerStatusBarHeight: statusBarHeight,
          headerStyle: {backgroundColor: colors.background},
          headerTintColor: colors.text,
          headerTitleStyle: {fontWeight: '700', fontSize: 17},
          headerShadowVisible: false,
          cardStyle: {backgroundColor: colors.background},
        }}>
        <Stack.Screen name="Wallet" component={WalletScreen} options={{headerShown: false}} />
        <Stack.Screen name="Browser" component={BrowserScreen} options={{headerShown: false}} />
        <Stack.Screen name="Import" component={ImportScreen} options={{title: 'Import accounts'}} />
        <Stack.Screen name="Export" component={ExportScreen} options={{title: 'Export accounts'}} />
        <Stack.Screen name="Scan" component={ScanScreen} options={{title: 'Scan QR code'}} />
        <Stack.Screen name="AddKey" component={AddAccountScreen} options={{title: 'Add account'}} />
        <Stack.Screen
          name="Operate"
          component={OperationScreen}
          options={({route}) => ({
            title: {
              transfer: 'Transfer',
              powerUp: 'Power up',
              powerDown: 'Power down',
              delegate: 'Delegate SP',
              savings: 'Savings',
              convert: 'Convert',
              claim: 'Claim rewards',
            }[route.params.kind],
          })}
        />
        <Stack.Screen name="Receive" component={ReceiveScreen} options={{title: 'Receive'}} />
        <Stack.Screen name="History" component={HistoryScreen} options={{title: 'History'}} />
        <Stack.Screen name="Account" component={AccountScreen} options={{title: 'Account'}} />
        <Stack.Screen name="Governance" component={GovernanceScreen} options={{title: 'Governance'}} />
        <Stack.Screen name="Activity" component={ActivityScreen} options={{title: 'Activity'}} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{title: 'Settings'}} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: c.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
}
