import {useEffect} from 'react';
import {AppState} from 'react-native';
import {useVault} from '../auth/VaultContext';
import {refreshNotices} from '../storage/notices';

export default function ActivityWatcher() {
  const {unlocked, activeName} = useVault();

  useEffect(() => {
    if (!unlocked || !activeName) return;
    let alive = true;
    const run = () => {
      if (alive) refreshNotices(activeName).catch(() => undefined);
    };
    run();
    const timer = setInterval(run, 60000);
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') run();
    });
    return () => {
      alive = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [unlocked, activeName]);

  return null;
}
