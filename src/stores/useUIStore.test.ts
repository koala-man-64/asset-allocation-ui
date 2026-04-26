import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { createDefaultNavOrderBySection } from '@/app/navigationModel';
import { UI_STORAGE_KEY, useUIStore } from '@/stores/useUIStore';

describe('useUIStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    act(() => {
      useUIStore.setState({
        isDarkMode: false,
        pinnedNavPaths: [],
        navOrderBySection: createDefaultNavOrderBySection()
      });
    });
  });

  it('migrates legacy persisted state without wiping nav customization', async () => {
    const defaultOrder = createDefaultNavOrderBySection();
    const customOrder = {
      ...defaultOrder,
      'live-operations': [
        '/strategies',
        ...defaultOrder['live-operations'].filter((path) => path !== '/strategies')
      ]
    };

    window.localStorage.setItem(
      UI_STORAGE_KEY,
      JSON.stringify({
        state: {
          isDarkMode: true,
          benchmark: 'SPY',
          costModel: 'Passive bps',
          dateRange: { start: '2020-01-01', end: '2025-01-01' },
          pinnedNavPaths: ['/strategies'],
          navOrderBySection: customOrder
        },
        version: 0
      })
    );

    await act(async () => {
      await useUIStore.persist.rehydrate();
    });

    const state = useUIStore.getState() as unknown as Record<string, unknown>;

    expect(state.isDarkMode).toBe(true);
    expect(state.pinnedNavPaths).toEqual(['/strategies']);
    expect(state.navOrderBySection).toEqual(customOrder);
    expect(state).not.toHaveProperty('benchmark');
    expect(state).not.toHaveProperty('costModel');
    expect(state).not.toHaveProperty('dateRange');
  });
});
