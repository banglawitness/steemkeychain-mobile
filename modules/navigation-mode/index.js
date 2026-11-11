import {requireOptionalNativeModule} from 'expo';

const native = requireOptionalNativeModule('NavigationMode');

export function getNavigationMode() {
  if (!native) return -1;
  try {
    return native.getNavigationMode();
  } catch {
    return -1;
  }
}

export function getNavigationBarHeight() {
  if (!native) return 0;
  try {
    return native.getNavigationBarHeight();
  } catch {
    return 0;
  }
}
