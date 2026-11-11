import {useEffect, useState} from 'react';
import {AppState, Platform, Pressable, StyleSheet, Text, View} from 'react-native';
import {requireOptionalNativeModule} from 'expo';
import {useColors} from '../theme';

const IMMEDIATE = 1;
const FLEXIBLE = 0;

type UpdateInfo = {
  updateAvailable: boolean;
  updateInProgress?: boolean;
  immediateAllowed?: boolean;
  flexibleAllowed?: boolean;
};

type UpdatesModule = {
  checkForUpdate: () => Promise<UpdateInfo>;
  startUpdate: (updateType?: number) => Promise<boolean>;
  addListener: (event: 'updateCancelled', listener: () => void) => {remove: () => void};
};

function loadUpdates() {
  try {
    return requireOptionalNativeModule<UpdatesModule>('ExpoInAppUpdates');
  } catch {
    return null;
  }
}

async function beginUpdate(updates: UpdatesModule, info: UpdateInfo) {
  if (info.updateInProgress) {
    await updates.startUpdate();
    return;
  }
  if (info.immediateAllowed) {
    const started = await updates.startUpdate(IMMEDIATE);
    if (started) return;
  }
  if (info.flexibleAllowed) await updates.startUpdate(FLEXIBLE);
}

export default function StoreUpdate() {
  const colors = useColors();
  const [required, setRequired] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const updates = loadUpdates();
    if (!updates) return;

    let alive = true;
    let running = false;

    const run = async () => {
      if (running) return;
      running = true;
      try {
        const info = await updates.checkForUpdate();
        if (!alive) return;
        if (!info.updateAvailable) {
          setRequired(false);
          return;
        }
        setRequired(true);
        await beginUpdate(updates, info);
      } catch {
        // Sideloaded builds and offline launches have no Play update to apply.
      } finally {
        running = false;
      }
    };

    run();
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') run();
    });
    const cancel = updates.addListener('updateCancelled', () => {
      if (alive) setRequired(true);
    });
    return () => {
      alive = false;
      appState.remove();
      cancel.remove();
    };
  }, []);

  if (!required) return null;

  return (
    <View style={[styles.cover, {backgroundColor: colors.background}]}>
      <Text style={[styles.title, {color: colors.text}]}>Update required</Text>
      <Text style={[styles.body, {color: colors.muted}]}>
        A new version of Steem Keychain is on Google Play. Update to continue. Your keys stay on this phone.
      </Text>
      <Pressable
        style={[styles.button, {backgroundColor: colors.accent}]}
        onPress={() => {
          const updates = loadUpdates();
          if (!updates) return;
          updates.checkForUpdate().then(info => beginUpdate(updates, info)).catch(() => undefined);
        }}>
        <Text style={[styles.buttonText, {color: colors.onAccent}]}>Update</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFill,
    zIndex: 200,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  title: {fontSize: 22, fontWeight: '700', marginBottom: 10, textAlign: 'center'},
  body: {fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 22},
  button: {borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28},
  buttonText: {fontSize: 16, fontWeight: '700'},
});
