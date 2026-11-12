import {RouteProp, useFocusEffect, useNavigation, useRoute} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Alert,
  Animated,
  BackHandler,
  Easing,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Path} from 'react-native-svg';
import {WebView, WebViewMessageEvent, WebViewNavigation} from 'react-native-webview';
import {useVault} from '../auth/VaultContext';
import {steem_keychain} from '../browser/bridge';
import {
  AllowedOperation,
  BrowserLink,
  loadAllowed,
  loadDesktopSite,
  loadFavorites,
  loadHistory,
  loadSession,
  saveAllowed,
  saveDesktopSite,
  saveFavorites,
  saveHistory,
  saveSession,
} from '../browser/browserStore';
import {executeRequest, failureMessage, KeychainRequest, requiredRole} from '../browser/requests';
import BottomBar from '../components/BottomBar';
import RequestSheet from '../components/RequestSheet';
import {RootStackParamList} from '../navigation/RootNavigator';
import {Palette, useColors, useThemedStyles} from '../theme';
import {StoredAccount} from '../types';

type Tab = {id: number; url: string; title: string};
type Pending = {request: KeychainRequest; requestId: number};

const START = [
  {
    title: 'Community',
    sites: [
      {title: 'Steemit', url: 'https://steemit.com', line: 'Posts, replies, and communities'},
    ],
  },
  {
    title: 'Trade',
    sites: [
      {title: 'SteemDex', url: 'https://steemdex.com', line: 'Token markets and swaps'},
    ],
  },
  {
    title: 'Tools',
    sites: [
      {title: 'SteemWorld', url: 'https://steemworld.org', line: 'Accounts, witnesses, and stats'},
      {title: 'SteemPro', url: 'https://steempro.com', line: 'A full blogging front end'},
      {title: 'SteemX', url: 'https://steemx.org', line: 'Read and publish on Steem'},
    ],
  },
];

const EXPLORE = START.flatMap(group => group.sites);

const ADDRESS_BAR = 48;
const DESKTOP_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
let nextTabId = 1;

export default function BrowserScreen() {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<StackNavigationProp<RootStackParamList, 'Browser'>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Browser'>>();
  const insets = useSafeAreaInsets();
  const {accounts, activeName, importAccounts} = useVault();
  const chromeHidden = useRef(false);
  const barLock = useRef(false);
  const barHeight = useRef(new Animated.Value(ADDRESS_BAR)).current;
  const [barHidden, setBarHidden] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pageLoader, setPageLoader] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const loadTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadOpen = useRef(false);
  const finishing = useRef(false);
  const settledUrl = useRef('');
  const startedAt = useRef(0);
  const webRef = useRef<WebView<{}>>(null);
  const cacheRef = useRef<WebView<{}>>(null);
  const trails = useRef<Record<number, string[]>>({});
  const addressRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const searchFor = useRef('');
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([{id: nextTabId++, url: '', title: 'New tab'}]);
  const [activeId, setActiveId] = useState(tabs[0].id);
  const [webSource, setWebSource] = useState('');
  const [address, setAddress] = useState('');
  const [editingAddress, setEditingAddress] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [barOpen, setBarOpen] = useState(false);
  useFocusEffect(useCallback(() => {
    setBarOpen(false);
  }, []));
  const [history, setHistory] = useState<BrowserLink[]>([]);
  const [bookmarks, setBookmarks] = useState<BrowserLink[]>([]);
  const [home, setHome] = useState<'sites' | 'bookmarks' | 'settings'>('sites');
  const [desktop, setDesktop] = useState(false);
  const [settingNote, setSettingNote] = useState('');
  const [wiping, setWiping] = useState(false);
  const [allowed, setAllowed] = useState<AllowedOperation[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = tabs.find(tab => tab.id === activeId) || tabs[0];

  useEffect(() => {
    Promise.all([loadHistory(), loadFavorites(), loadAllowed(), loadSession(), loadDesktopSite()]).then(([hist, saved, allow, session, desktopOn]) => {
      setHistory(hist);
      setBookmarks(saved);
      setAllowed(allow);
      setDesktop(desktopOn);
      if (session?.tabs.length) {
        const restored = session.tabs.map(tab => ({id: nextTabId++, url: tab.url, title: tab.title || 'New tab'}));
        const index = Math.min(Math.max(session.active, 0), restored.length - 1);
        setTabs(restored);
        setActiveId(restored[index].id);
        setAddress(restored[index].url);
        setWebSource(restored[index].url);
      }
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    const activeIndex = Math.max(0, tabs.findIndex(tab => tab.id === activeId));
    saveSession({tabs: tabs.map(tab => ({url: tab.url, title: tab.title})), active: activeIndex});
  }, [ready, tabs, activeId]);

  useEffect(() => () => {
    if (loadTimer.current) clearInterval(loadTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  const stopCreep = () => {
    if (!loadTimer.current) return;
    clearInterval(loadTimer.current);
    loadTimer.current = null;
  };

  const beginLoad = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    finishing.current = false;
    loadOpen.current = true;
    startedAt.current = Date.now();
    stopCreep();
    progressRef.current = 0.08;
    setPageLoader(false);
    setLoading(true);
    setProgress(0.08);
    loadTimer.current = setInterval(() => {
      const current = progressRef.current;
      if (current >= 0.9) return;
      const step = current < 0.35 ? 0.07 : current < 0.7 ? 0.025 : 0.008;
      const next = Math.min(0.9, current + step);
      progressRef.current = next;
      setProgress(next);
    }, 160);
  };

  const finishLoad = (url?: string) => {
    if (!loadOpen.current && progressRef.current === 0) return;
    if (url && url !== 'about:blank') settledUrl.current = url;
    if (finishing.current) return;
    finishing.current = true;
    loadOpen.current = false;
    stopCreep();
    progressRef.current = 1;
    setProgress(1);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setLoading(false);
      setProgress(0);
      progressRef.current = 0;
      finishing.current = false;
    }, 180);
  };

  const noteProgress = (value: number) => {
    if (!loadOpen.current) return;
    if (value >= 1) {
      finishLoad();
      return;
    }
    const next = Math.max(progressRef.current, Math.min(0.9, value));
    if (next === progressRef.current) return;
    progressRef.current = next;
    setLoading(true);
    setProgress(next);
  };

  const slideAddressBar = (hide: boolean) => {
    if (!active.url || switcher || editingAddress) hide = false;
    if (chromeHidden.current === hide || barLock.current) return;
    chromeHidden.current = hide;
    barLock.current = true;
    if (!hide) setBarHidden(false);
    Animated.timing(barHeight, {
      toValue: hide ? 0 : ADDRESS_BAR,
      duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      barLock.current = false;
      if (hide) setBarHidden(true);
    });
  };
  const updateTab = (id: number, patch: Partial<Tab>) => {
    setTabs(current => current.map(tab => (tab.id === id ? {...tab, ...patch} : tab)));
  };

  const showUrl = (url: string) => {
    updateTab(active.id, {url, title: url});
    setAddress(url);
    settledUrl.current = '';
    if (url === webSource) webRef.current?.reload();
    else setWebSource(url);
    beginLoad();
  };

  const go = (url: string) => {
    const trail = trails.current[active.id] || [];
    trails.current[active.id] = trail[trail.length - 1] === url ? trail : [...trail, url];
    showUrl(url);
  };

  useEffect(() => {
    const url = route.params?.url;
    if (!ready || !url) return;
    go(url);
    navigation.setParams({url: undefined});
  }, [ready, route.params?.url]);

  const openUrl = (value: string) => {
    const url = destination(value);
    if (!url) return;
    searchFor.current = value.trim();
    go(url);
  };

  const chooseSuggestion = (url: string) => {
    Keyboard.dismiss();
    addressRef.current?.blur();
    setEditingAddress(false);
    openUrl(url);
  };

  const focusAddress = () => {
    const next = withScheme(address);
    setEditingAddress(true);
    if (next !== address) setAddress(next);
    setTimeout(() => {
      addressRef.current?.setNativeProps({selection: {start: next.length, end: next.length}});
    }, 30);
  };

  const editAddress = (value: string) => {
    if (/^https?:\/\//i.test(value)) {
      setAddress(value);
      return;
    }
    setAddress(`https://${value.replace(/^https?:?\/?\/?/i, '').replace(/^\/+/, '')}`);
  };

  const submitAddress = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    const next = destination(address);
    if (!next) return;
    openUrl(address);
    setEditingAddress(false);
    Keyboard.dismiss();
    addressRef.current?.setNativeProps({text: siteLabel(next)});
  };

  const bookmarked = bookmarks.some(item => item.url === active.url);
  const toggleBookmark = () => {
    if (!active.url.startsWith('http')) return;
    setBookmarks(current => {
      const next = bookmarked
        ? current.filter(item => item.url !== active.url)
        : [{url: active.url, title: active.title && active.title !== active.url ? active.title : siteLabel(active.url)}, ...current.filter(item => item.url !== active.url)].slice(0, 40);
      saveFavorites(next);
      return next;
    });
  };
  const removeBookmark = (url: string) => {
    setBookmarks(current => {
      const next = current.filter(item => item.url !== url);
      saveFavorites(next);
      return next;
    });
  };

  const toggleDesktop = () => {
    setDesktop(current => {
      const next = !current;
      saveDesktopSite(next);
      return next;
    });
    setSettingNote('');
  };

  const clearCache = () => {
    webRef.current?.clearCache(true);
    webRef.current?.clearFormData?.();
    setSettingNote('Cache cleared.');
    setWiping(true);
  };

  const clearBrowserHistory = () => {
    setHistory([]);
    saveHistory([]);
    setSettingNote('History cleared.');
  };

  const askClearCache = () => {
    Alert.alert('Clear cache', 'Saved page files and form data will be removed.', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'OK', onPress: clearCache},
    ]);
  };

  const askClearHistory = () => {
    Alert.alert('Clear history', 'The list of pages you opened in this browser will be removed.', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'OK', onPress: clearBrowserHistory},
    ]);
  };

  const rememberHistory = (url: string, title: string) => {
    if (!url.startsWith('http')) return;
    setHistory(current => {
      const next = [{url, title: title || url}, ...current.filter(item => item.url !== url)].slice(0, 40);
      saveHistory(next);
      return next;
    });
  };

  const respond = (payload: Record<string, unknown>) => {
    const script = `window.steem_keychain.onAnswerReceived("steem_keychain_response", ${JSON.stringify(payload)}); true;`;
    webRef.current?.injectJavaScript(script);
  };

  const reject = (request: KeychainRequest, requestId: number, message: string) => {
    respond({
      success: false,
      error: 'user_cancel',
      message,
      data: publicData(request),
      request_id: requestId,
    });
  };

  const runRequest = async (
    request: KeychainRequest,
    requestId: number,
    account: StoredAccount,
    remember: boolean,
    interactive: boolean,
  ) => {
    setBusy(true);
    setError('');
    await new Promise<void>(resolve => setTimeout(resolve, 32));
    try {
      const result = await executeRequest(request, account, importAccounts);
      if (remember && requiredRole(request) === 'posting') {
        const host = hostname(request.domain);
        const entry = {host, username: account.name, type: request.type};
        setAllowed(current => {
          const next = current.some(item => item.host === host && item.username === account.name && item.type === request.type)
            ? current
            : [...current, entry];
          saveAllowed(next);
          return next;
        });
      }
      respond({
        success: true,
        result: result && typeof result === 'object' && 'signature' in (result as object) ? (result as {signature: string}).signature : result,
        publicKey: result && typeof result === 'object' && 'publicKey' in (result as object) ? (result as {publicKey: string}).publicKey : undefined,
        data: publicData(request),
        request_id: requestId,
        message: 'Request broadcast successfully.',
      });
      setPending(null);
    } catch (cause) {
      const message = failureMessage(cause);
      setError(message);
      if (!interactive) {
        respond({
          success: false,
          error: 'failed',
          message,
          data: publicData(request),
          request_id: requestId,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const onMessage = (event: WebViewMessageEvent) => {
    let message: {name?: string; request_id?: number; data?: KeychainRequest};
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (message.name === 'swHandshake_steem') {
      webRef.current?.injectJavaScript('window.steem_keychain.onAnswerReceived("steem_keychain_handshake"); true;');
      return;
    }
    if (message.name === 'scroll') {
      const direction = (message.data as unknown as {direction?: string} | undefined)?.direction;
      if (direction === 'down') slideAddressBar(true);
      else if (direction === 'up') slideAddressBar(false);
      return;
    }
    if (message.name === 'pageLoader') {
      const visible = Boolean((message.data as unknown as {visible?: boolean} | undefined)?.visible);
      setPageLoader(visible);
      return;
    }
    if (message.name === 'pageInfo' && message.data) {
      const info = message.data as unknown as {title?: string; url?: string};
      if (info.title) updateTab(active.id, {title: info.title});
      if (info.url) rememberHistory(info.url, info.title || info.url);
      return;
    }
    if (message.name !== 'swRequest_steem' || !message.data || message.request_id == null) return;
    const request = {...message.data, domain: message.data.domain || active.url};
    const requestId = message.request_id;
    if (!accounts.length) {
      reject(request, requestId, 'Add a Steem account before approving a request.');
      return;
    }
    const username = String(request.username || '').toLowerCase();
    const host = hostname(request.domain);
    const trusted =
      requiredRole(request) === 'posting' &&
      allowed.some(item => item.host === host && item.username === username && item.type === request.type);
    const account = accounts.find(item => item.name === username);
    if (trusted && account) {
      runRequest(request, requestId, account, false, false);
      return;
    }
    setError('');
    setPending({request, requestId});
  };

  const onNavigation = (state: WebViewNavigation) => {
    setCanGoBack(state.canGoBack);
    setCanGoForward(state.canGoForward);
    if (state.url && state.url !== 'about:blank') {
      setAddress(state.url);
      updateTab(active.id, {url: state.url, title: state.title || active.title});
    }
    if (state.loading === false && state.url && state.url !== 'about:blank' && Date.now() - startedAt.current > 250) {
      finishLoad(state.url);
    }
  };

  const reloadPage = () => {
    if (!active.url) return;
    settledUrl.current = '';
    beginLoad();
    webRef.current?.reload();
  };
  const typing = editingAddress && address.trim() !== (active.url || '').trim();
  const query = typing ? address.trim().toLowerCase() : '';
  const showSuggestions = !switcher && editingAddress && (Boolean(query) || Boolean(active.url));
  const startPage = !switcher && !active.url && !query;
  const matchesSite = (item: {title: string; url: string}) => {
    if (!query) return true;
    return `${item.title} ${item.url}`.toLowerCase().includes(query);
  };
  const exploreHits = showSuggestions ? EXPLORE.filter(matchesSite) : [];
  const exploreUrls = new Set(exploreHits.map(item => item.url));
  const historyHits = showSuggestions
    ? history.filter(item => !exploreUrls.has(item.url) && matchesSite(item)).slice(0, 5)
    : [];
  const openTab = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    const tab = {id: nextTabId++, url: '', title: 'New tab'};
    setTabs(current => [...current, tab]);
    setActiveId(tab.id);
    setWebSource('');
    setAddress('');
    setSwitcher(false);
    setEditingAddress(false);
    Keyboard.dismiss();
  };
  const closeTab = (id: number) => {
    delete trails.current[id];
    setTabs(current => {
      const next = current.filter(item => item.id !== id);
      if (!next.length) {
        const fresh = {id: nextTabId++, url: '', title: 'New tab'};
        setActiveId(fresh.id);
        setAddress('');
        setWebSource('');
        return [fresh];
      }
      if (id === activeId) {
        setActiveId(next[0].id);
        setAddress(next[0].url);
        setWebSource(next[0].url);
      }
      return next;
    });
  };

  const showHome = () => {
    trails.current[active.id] = [];
    updateTab(active.id, {url: '', title: 'New tab'});
    setAddress('');
    setWebSource('');
    setCanGoBack(false);
    setCanGoForward(false);
    setEditingAddress(false);
    Keyboard.dismiss();
  };

  const backInBrowser = () => {
    if (switcher) {
      setSwitcher(false);
      return true;
    }
    if (editingAddress) {
      setEditingAddress(false);
      Keyboard.dismiss();
      setAddress(active.url);
      return true;
    }
    if (pending) {
      reject(pending.request, pending.requestId, 'Request was canceled by the user.');
      setPending(null);
      setError('');
      return true;
    }
    if (canGoBack) {
      webRef.current?.goBack();
      return true;
    }
    const trail = trails.current[active.id] || [];
    if (trail.length > 1) {
      const next = trail.slice(0, -1);
      trails.current[active.id] = next;
      showUrl(next[next.length - 1]);
      return true;
    }
    if (active.url) {
      showHome();
      return true;
    }
    return false;
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => backInBrowser());
    return () => sub.remove();
  });

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Animated.View style={[styles.barClip, {height: barHeight}]}>
          <View style={styles.toolbar}>
            {editingAddress ? null : <IconButton glyph="‹" disabled={!canGoBack && !active.url} onPress={backInBrowser} />}
            {editingAddress ? null : <IconButton glyph="›" disabled={!canGoForward} onPress={() => webRef.current?.goForward()} />}
            <View style={styles.addressWrap}>
              <TextInput
                ref={addressRef}
                style={[styles.address, editingAddress ? styles.addressGo : styles.addressIdle, !editingAddress && active.url.startsWith('http') && styles.addressStar]}
                value={editingAddress ? address : siteLabel(address)}
                onChangeText={editAddress}
                onFocus={focusAddress}
                onBlur={() => {
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                  blurTimer.current = setTimeout(() => {
                    setEditingAddress(false);
                    if (/^https?:\/\/$/i.test(address.trim())) {
                      setAddress(active.url);
                      addressRef.current?.setNativeProps({text: siteLabel(active.url)});
                      return;
                    }
                    addressRef.current?.setNativeProps({text: siteLabel(address)});
                  }, 160);
                }}
                onSubmitEditing={submitAddress}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                inputMode="url"
                returnKeyType="go"
                placeholder="Search or enter a site"
                placeholderTextColor={colors.muted}
              />
              {editingAddress ? (
                <Pressable style={styles.go} onPressIn={submitAddress} hitSlop={8} accessibilityLabel="Open address">
                  <Text style={[styles.goGlyph, !destination(address) && styles.dim]}>→</Text>
                </Pressable>
              ) : null}
              {!editingAddress && active.url.startsWith('http') ? (
                <Pressable style={styles.star} onPress={toggleBookmark} hitSlop={8} accessibilityLabel={bookmarked ? 'Remove bookmark' : 'Add bookmark'}>
                  <StarIcon filled={bookmarked} color={bookmarked ? colors.accent : colors.muted} />
                </Pressable>
              ) : null}
            </View>
            {editingAddress ? null : (
              <>
                <Pressable style={styles.addTab} onPressIn={openTab} hitSlop={6}>
                  <Text style={styles.addTabText}>+</Text>
                </Pressable>
                <Pressable style={styles.countButton} onPress={() => setSwitcher(value => !value)} hitSlop={6}>
                  <Text style={styles.countText}>{tabs.length}</Text>
                </Pressable>
                <IconButton glyph="↻" disabled={!active.url} onPress={reloadPage} />
              </>
            )}
          </View>
      </Animated.View>
      {barHidden && active.url && !switcher ? (
        <Pressable style={styles.peek} onPressIn={() => slideAddressBar(false)} />
      ) : null}
      {loading && !pageLoader ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, {width: `${Math.max(6, Math.round(progress * 100))}%`}]} />
        </View>
      ) : null}
      {showSuggestions && (exploreHits.length || historyHits.length) ? (
        <ScrollView style={styles.suggest} keyboardShouldPersistTaps="always" keyboardDismissMode="none">
          {exploreHits.length ? <Text style={styles.suggestHead}>Explore</Text> : null}
          {exploreHits.map(item => (
            <Pressable
              key={item.url}
              style={styles.suggestRow}
              onPress={() => chooseSuggestion(item.url)}>
              <Text style={styles.suggestTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.suggestUrl} numberOfLines={1}>{siteLabel(item.url)}</Text>
            </Pressable>
          ))}
          {historyHits.length ? <Text style={styles.suggestHead}>History</Text> : null}
          {historyHits.map(item => (
            <Pressable
              key={item.url}
              style={styles.suggestRow}
              onPress={() => chooseSuggestion(item.url)}>
              <Text style={styles.suggestTitle} numberOfLines={1}>{item.title || siteLabel(item.url)}</Text>
              <Text style={styles.suggestUrl} numberOfLines={1}>{siteLabel(item.url)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.stage}>
        {startPage ? (
          <ScrollView style={styles.web} contentContainerStyle={[styles.start, {paddingBottom: insets.bottom + 150}]} keyboardShouldPersistTaps="handled">
            <View style={styles.homeSwitch}>
              {([
                ['sites', 'Popular sites'],
                ['bookmarks', 'Bookmarks'],
                ['settings', 'Settings'],
              ] as const).map(([id, label]) => {
                const on = home === id;
                return (
                  <Pressable key={id} style={[styles.homeTab, on && styles.homeTabOn]} onPress={() => setHome(id)}>
                    <Text style={[styles.homeTabText, on && styles.homeTabTextOn]} numberOfLines={1}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {home === 'settings' ? (
              <View style={styles.startGroup}>
                <View style={styles.settingCard}>
                  <View style={styles.startCopy}>
                    <Text style={styles.settingTitle}>Desktop site</Text>
                    <Text style={styles.settingLine}>Open pages with a desktop browser layout.</Text>
                  </View>
                  <Pressable
                    style={[styles.settingToggle, desktop && styles.settingToggleOn]}
                    onPress={toggleDesktop}
                    accessibilityLabel="Desktop site">
                    <Text style={[styles.settingToggleText, desktop && styles.settingToggleTextOn]}>{desktop ? 'On' : 'Off'}</Text>
                  </Pressable>
                </View>
                <Pressable style={styles.settingCard} onPress={askClearCache}>
                  <View style={styles.startCopy}>
                    <Text style={styles.settingTitle}>Clear cache</Text>
                    <Text style={styles.settingLine}>Removes saved page files and form data so sites load fresh.</Text>
                  </View>
                </Pressable>
                <Pressable style={styles.settingCard} onPress={askClearHistory}>
                  <View style={styles.startCopy}>
                    <Text style={styles.settingTitle}>Clear history</Text>
                    <Text style={styles.settingLine}>Removes the list of pages you opened in this browser.</Text>
                  </View>
                </Pressable>
                {settingNote ? <Text style={styles.settingNote}>{settingNote}</Text> : null}
              </View>
            ) : home === 'sites' ? START.map(group => (
              <View key={group.title} style={styles.startGroup}>
                <Text style={styles.startKicker}>{group.title}</Text>
                {group.sites.map(site => (
                  <Pressable key={site.url} style={styles.startCard} onPress={() => chooseSuggestion(site.url)}>
                    <View style={styles.startMark}>
                      <Text style={styles.startMarkText}>{site.title.slice(0, 1)}</Text>
                    </View>
                    <View style={styles.startCopy}>
                      <Text style={styles.startTitle}>{site.title}</Text>
                      <Text style={styles.startLine}>{site.line}</Text>
                      <Text style={styles.startHost}>{siteLabel(site.url)}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )) : bookmarks.length ? bookmarks.map(item => (
              <View key={item.url} style={styles.startCard}>
                <Pressable style={styles.startCopy} onPress={() => chooseSuggestion(item.url)}>
                  <Text style={styles.startTitle} numberOfLines={1}>{item.title || siteLabel(item.url)}</Text>
                  <Text style={styles.startHost}>{siteLabel(item.url)}</Text>
                </Pressable>
                <Pressable hitSlop={8} onPress={() => removeBookmark(item.url)} accessibilityLabel={`Remove ${item.title}`}>
                  <Text style={styles.remove}>×</Text>
                </Pressable>
              </View>
            )) : (
              <Text style={styles.emptyLine}>No bookmarks yet. Open a page and tap the star.</Text>
            )}
            {home === 'settings' ? null : (
              <>
                <Text style={styles.startKicker}>History</Text>
                {history.length ? history.map(item => (
                  <Pressable key={item.url} style={styles.historyRow} onPress={() => chooseSuggestion(item.url)}>
                    <Text style={styles.historyTitle} numberOfLines={1}>{item.title || siteLabel(item.url)}</Text>
                    <Text style={styles.historyHost} numberOfLines={1}>{siteLabel(item.url)}</Text>
                  </Pressable>
                )) : (
                  <Text style={styles.emptyLine}>Pages you open will show up here.</Text>
                )}
              </>
            )}
          </ScrollView>
        ) : !ready || !webSource ? <View style={styles.web} /> : (
          <WebView<{}>
            key={`${active.id}-${desktop ? 'desktop' : 'mobile'}`}
            ref={webRef}
            source={{uri: webSource}}
            style={styles.web}
            userAgent={desktop ? DESKTOP_AGENT : undefined}
            injectedJavaScriptBeforeContentLoaded={steem_keychain}
            injectedJavaScript={PAGE_SCRIPT}
            onMessage={onMessage}
            onNavigationStateChange={onNavigation}
            onLoadStart={event => {
              const url = event.nativeEvent.url || '';
              if (!url || url === 'about:blank' || url === settledUrl.current) return;
              beginLoad();
            }}
            onLoadProgress={event => noteProgress(event.nativeEvent.progress)}
            onLoadEnd={event => {
              webRef.current?.injectJavaScript(PAGE_SCRIPT);
              finishLoad(event.nativeEvent.url);
            }}
            onError={() => {
              const query = searchFor.current.trim();
              if (!query || active.url.includes('google.com/search?')) {
                finishLoad();
                return;
              }
              searchFor.current = '';
              go(searchUrl(query));
            }}
            onShouldStartLoadWithRequest={event => {
              const url = event.url || '';
              return url.startsWith('http://') || url.startsWith('https://') || url === 'about:blank';
            }}
            onOpenWindow={event => {
              const url = event.nativeEvent.targetUrl;
              if (url && (url.startsWith('http://') || url.startsWith('https://'))) go(url);
            }}
            allowsBackForwardNavigationGestures
            setSupportMultipleWindows={false}
            originWhitelist={['http://*', 'https://*']}
          />
        )}
        {switcher ? (
          <ScrollView style={styles.switcher} contentContainerStyle={styles.homeContent}>
            <Text style={styles.heading}>{tabs.length} {tabs.length === 1 ? 'tab' : 'tabs'}</Text>
            {tabs.map(tab => (
              <Pressable
                key={tab.id}
                style={[styles.switchCard, tab.id === active.id && styles.tabOn]}
                onPress={() => {
                if (tab.id !== active.id) {
                  setActiveId(tab.id);
                  setAddress(tab.url);
                  setWebSource(tab.url);
                }
                  setSwitcher(false);
                }}>
                <View style={styles.switchCopy}>
                  <Text style={styles.linkTitle} numberOfLines={1}>{siteLabel(tab.url) || 'New tab'}</Text>
                  {tab.url ? <Text style={styles.linkUrl} numberOfLines={1}>{tab.url}</Text> : null}
                </View>
                <Pressable hitSlop={8} onPress={() => closeTab(tab.id)}>
                  <Text style={styles.close}>×</Text>
                </Pressable>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>
      {wiping ? (
        <View style={styles.cacheClip} pointerEvents="none">
          <WebView<{}>
            ref={cacheRef}
            source={{html: '<!DOCTYPE html><html><body></body></html>'}}
            style={styles.cacheWeb}
            onLoadEnd={() => {
              cacheRef.current?.clearCache(true);
              cacheRef.current?.clearFormData?.();
              setWiping(false);
            }}
          />
        </View>
      ) : null}
      {pending ? (
        <RequestSheet
          request={pending.request}
          accounts={accounts}
          activeName={activeName}
          busy={busy}
          error={error}
          onReject={() => {
            reject(pending.request, pending.requestId, 'Request was canceled by the user.');
            setPending(null);
            setError('');
          }}
          onApprove={(account, remember) => runRequest(pending.request, pending.requestId, account, remember, true)}
        />
      ) : null}
      {barOpen ? (
        <View style={[styles.bottomDock, {bottom: insets.bottom + 12}]} pointerEvents="box-none">
          <BottomBar current="Browser" />
        </View>
      ) : null}
      <View style={[styles.dock, {bottom: insets.bottom + (barOpen ? 126 : 64)}]} pointerEvents="box-none">
        <Pressable style={[styles.dockHandle, styles.dockHandleAlone]} onPress={() => setBarOpen(value => !value)}>
          <Text style={styles.dockGlyph}>{barOpen ? '›' : '‹'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function StarIcon({filled, color}: {filled: boolean; color: string}) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        d="M12 3.2l2.35 5.02 5.5.67-4.08 3.76 1.1 5.45L12 15.77 7.13 18.1l1.1-5.45L4.15 8.89l5.5-.67L12 3.2z"
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function IconButton({glyph, disabled, onPress}: {glyph: string; disabled?: boolean; onPress: () => void}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable style={[styles.barButton, disabled && styles.dim]} disabled={disabled} onPress={onPress}>
      <Text style={styles.barGlyph}>{glyph}</Text>
    </Pressable>
  );
}

function siteLabel(value: string) {
  if (!value) return '';
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return value;
  }
}

function searchUrl(query: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(query.trim())}`;
}

function withScheme(value: string) {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

function destination(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || /^https?:\/\/$/i.test(trimmed)) return null;
  const looksLikeSite = !/\s/.test(trimmed) && (/^https?:\/\//i.test(trimmed) || /[a-z0-9-]+\.[a-z]{2,}/i.test(trimmed));
  if (looksLikeSite) {
    const url = safeUrl(trimmed);
    if (url) return url;
  }
  return searchUrl(trimmed);
}

function safeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function hostname(domain: unknown) {
  try {
    return new URL(String(domain || '')).hostname;
  } catch {
    return '';
  }
}

function publicData(request: KeychainRequest) {
  if (request.type !== 'addAccount') return request;
  const copy = {...request};
  delete copy.keys;
  return copy;
}

const PAGE_SCRIPT = `
(function () {
  function send(payload) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  }
  send({name:'pageInfo', data:{title:document.title, url:location.href}});
  if (!window.__steemLoaderWatch) {
    window.__steemLoaderWatch = true;
    var loaderSeen = false;
    function topLoader() {
      var width = window.innerWidth || 1;
      var spots = [12, Math.floor(width * 0.3), Math.floor(width * 0.6), width - 12];
      for (var i = 0; i < spots.length; i++) {
        var stack = document.elementsFromPoint(spots[i], 2);
        if (!stack) continue;
        for (var j = 0; j < stack.length && j < 6; j++) {
          var el = stack[j];
          if (!el || el === document.documentElement || el === document.body) continue;
          var style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
          var pos = style.position;
          if (pos !== 'fixed' && pos !== 'absolute' && pos !== 'sticky') continue;
          var rect = el.getBoundingClientRect();
          if (rect.top <= 10 && rect.height >= 1 && rect.height <= 8 && rect.width >= 32) return true;
        }
      }
      return false;
    }
    setInterval(function () {
      var visible = false;
      try { visible = topLoader(); } catch (error) { visible = false; }
      if (visible === loaderSeen) return;
      loaderSeen = visible;
      send({name:'pageLoader', data:{visible:visible}});
    }, 350);
  }
  if (window.__steemScrollWatch) return true;
  window.__steemScrollWatch = true;
  var lastY = 0;
  var lastDir = '';
  document.addEventListener('touchstart', function (event) {
    if (event.touches && event.touches[0]) lastY = event.touches[0].clientY;
  }, {passive:true, capture:true});
  document.addEventListener('touchmove', function (event) {
    if (!event.touches || !event.touches[0]) return;
    var y = event.touches[0].clientY;
    var delta = lastY - y;
    if (Math.abs(delta) < 28) return;
    var dir = delta > 0 ? 'down' : 'up';
    lastY = y;
    if (dir === lastDir) return;
    var now = Date.now();
    if (now - (window.__steemScrollAt || 0) < 280) return;
    window.__steemScrollAt = now;
    lastDir = dir;
    send({name:'scroll', data:{direction:dir}});
  }, {passive:true, capture:true});
  return true;
})();
true;
`;

function makeStyles(c: Palette) {
  return StyleSheet.create({
  screen: {flex: 1, backgroundColor: c.background},
  peek: {position: 'absolute', top: 0, left: 0, right: 0, height: 28, zIndex: 6},
  barClip: {overflow: 'hidden', backgroundColor: c.background},
  toolbar: {height: ADDRESS_BAR, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, backgroundColor: c.background},
  barButton: {width: 40, height: 40, borderRadius: 8, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', marginHorizontal: 2},
  barGlyph: {color: c.text, fontSize: 22, fontWeight: '700', lineHeight: 24},
  dim: {opacity: 0.3},
  addressWrap: {flex: 1, justifyContent: 'center'},
  address: {height: 40, backgroundColor: c.card, color: c.text, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 0, fontSize: 15, textAlignVertical: 'center'},
  addressIdle: {textAlign: 'center', fontSize: 14, fontWeight: '600'},
  addressStar: {paddingRight: 36},
  addressGo: {paddingRight: 42, textAlign: 'left'},
  star: {position: 'absolute', right: 8, top: 0, bottom: 0, justifyContent: 'center'},
  go: {position: 'absolute', right: 2, top: 0, bottom: 0, width: 36, alignItems: 'center', justifyContent: 'center'},
  goGlyph: {color: c.accent, fontSize: 22, fontWeight: '800'},
  addTab: {width: 32, height: 32, alignItems: 'center', justifyContent: 'center'},
  addTabText: {color: c.text, fontSize: 22, fontWeight: '500', lineHeight: 24},
  countButton: {width: 26, height: 26, borderRadius: 6, borderWidth: 1.5, borderColor: c.text, alignItems: 'center', justifyContent: 'center', marginRight: 2},
  countText: {color: c.text, fontSize: 12, fontWeight: '700'},
  switchCard: {flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.card, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6},
  switchCopy: {flex: 1},
  tabOn: {borderWidth: 1, borderColor: c.accent},
  close: {color: c.muted, fontSize: 20, paddingHorizontal: 4},
  bottomDock: {position: 'absolute', left: 0, right: 0, alignItems: 'center'},
  dock: {position: 'absolute', left: 0, right: 0},
  dockHandle: {width: 28, height: 48, borderTopLeftRadius: 12, borderBottomLeftRadius: 12, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center'},
  dockHandleAlone: {alignSelf: 'flex-end'},
  dockGlyph: {color: c.text, fontSize: 18, fontWeight: '700'},
  suggest: {maxHeight: 470, backgroundColor: c.card, marginHorizontal: 8, marginTop: 4, borderRadius: 8, overflow: 'hidden'},
  suggestHead: {color: c.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4},
  suggestRow: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line},
  suggestTitle: {color: c.text, fontSize: 15, fontWeight: '700', flexShrink: 1},
  suggestUrl: {color: c.muted, fontSize: 13, flex: 1},
  progressTrack: {height: 3, backgroundColor: c.line},
  progressBar: {height: 3, backgroundColor: c.accent},
  start: {paddingHorizontal: 16, paddingTop: 8},
  homeSwitch: {
    flexDirection: 'row',
    marginTop: 4,
    marginBottom: 6,
    padding: 4,
    borderRadius: 16,
    backgroundColor: c.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.line,
  },
  homeTab: {flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: 'center'},
  homeTabOn: {backgroundColor: c.accentSoft},
  homeTabText: {color: c.muted, fontSize: 13, fontWeight: '700'},
  homeTabTextOn: {color: c.accentDeep},
  settingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: c.card,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.line,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 10,
  },
  settingTitle: {color: c.text, fontSize: 16, fontWeight: '800'},
  settingLine: {color: c.muted, fontSize: 13, lineHeight: 18, marginTop: 3},
  settingToggle: {borderRadius: 12, borderWidth: 1, borderColor: c.line, paddingHorizontal: 12, paddingVertical: 8},
  settingToggleOn: {backgroundColor: c.accent, borderColor: c.accent},
  settingToggleText: {color: c.muted, fontSize: 13, fontWeight: '800'},
  settingToggleTextOn: {color: c.onAccent},
  settingNote: {color: c.accentDeep, fontSize: 13, fontWeight: '700', marginTop: 12, marginLeft: 4},
  cacheClip: {position: 'absolute', width: 0, height: 0, overflow: 'hidden'},
  cacheWeb: {width: 1, height: 1},
  emptyLine: {color: c.muted, fontSize: 13, lineHeight: 18, marginTop: 4, marginBottom: 8, marginLeft: 4},
  remove: {color: c.muted, fontSize: 22, fontWeight: '500', paddingHorizontal: 4},
  historyRow: {
    backgroundColor: c.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  historyTitle: {color: c.text, fontSize: 15, fontWeight: '700'},
  historyHost: {color: c.muted, fontSize: 12, marginTop: 3},
  startGroup: {marginBottom: 8},
  startKicker: {color: c.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 12, marginBottom: 8, marginLeft: 4},
  startCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: c.card,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.line,
    paddingHorizontal: 14,
    paddingVertical: 16,
    marginBottom: 10,
  },
  startMark: {width: 56, height: 56, borderRadius: 18, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center'},
  startMarkText: {color: c.accentDeep, fontSize: 24, fontWeight: '800'},
  startCopy: {flex: 1},
  startTitle: {color: c.text, fontSize: 22, fontWeight: '800'},
  startLine: {color: c.muted, fontSize: 14, lineHeight: 18, marginTop: 3},
  startHost: {color: c.accent, fontSize: 12, fontWeight: '700', marginTop: 6},
  stage: {flex: 1},
  web: {flex: 1, backgroundColor: c.background},
  switcher: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: c.background},
  homeContent: {padding: 12, paddingBottom: 18},
  heading: {color: c.text, fontSize: 15, fontWeight: '700', marginTop: 6, marginBottom: 6},
  link: {backgroundColor: c.card, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 6},
  linkTitle: {color: c.text, fontWeight: '600'},
  linkUrl: {color: c.muted, marginTop: 2},
});
}
