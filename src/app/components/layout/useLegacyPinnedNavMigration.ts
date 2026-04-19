import { useEffect } from 'react';
import Cookies from 'js-cookie';

import { normalizePinnedNavPaths } from '@/app/navigationModel';
import { UI_STORAGE_KEY, useUIStore } from '@/stores/useUIStore';

const LEGACY_PINNED_TABS_COOKIE = 'ag_pinned_tabs';

function hasPersistedNavCustomizationSnapshot(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const rawPersistedState = window.localStorage.getItem(UI_STORAGE_KEY);
  if (!rawPersistedState) {
    return false;
  }

  try {
    const parsedState = JSON.parse(rawPersistedState) as {
      state?: Record<string, unknown>;
    };

    return Boolean(
      parsedState.state &&
      ('pinnedNavPaths' in parsedState.state || 'navOrderBySection' in parsedState.state)
    );
  } catch {
    return false;
  }
}

export function useLegacyPinnedNavMigration() {
  useEffect(() => {
    if (hasPersistedNavCustomizationSnapshot()) {
      return;
    }

    const savedPinnedTabs = Cookies.get(LEGACY_PINNED_TABS_COOKIE);
    if (!savedPinnedTabs) {
      return;
    }

    try {
      useUIStore.setState({
        pinnedNavPaths: normalizePinnedNavPaths(JSON.parse(savedPinnedTabs))
      });
      Cookies.remove(LEGACY_PINNED_TABS_COOKIE);
    } catch (error) {
      console.error('Failed to parse pinned tabs cookie', error);
    }
  }, []);
}
