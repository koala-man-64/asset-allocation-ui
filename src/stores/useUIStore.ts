import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  createDefaultNavOrderBySection,
  hasKnownNavPath,
  moveItem,
  moveNavItemWithinSectionOrder,
  normalizeNavOrderBySection,
  normalizePinnedNavPaths,
  type NavOrderBySection,
  type NavSectionKey
} from '@/app/navigationModel';

export const UI_STORAGE_KEY = 'ui-storage';

interface UIState {
  // Appearance
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  setIsDarkMode: (dark: boolean) => void;

  // Layout
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;

  // Global Filters
  dateRange: { start: string; end: string };
  setDateRange: (range: { start: string; end: string }) => void;
  benchmark: string;
  setBenchmark: (benchmark: string) => void;
  costModel: string;
  setCostModel: (model: string) => void;

  environment: 'DEV' | 'PROD';
  setEnvironment: (env: 'DEV' | 'PROD') => void;

  // Run Selection (Cart)
  selectedRuns: string[]; // Set is not serializable for persist, use array
  addToCart: (runId: string) => void;
  removeFromCart: (runId: string) => void;
  clearCart: () => void;

  // Sidebar personalization
  pinnedNavPaths: string[];
  navOrderBySection: NavOrderBySection;
  togglePinnedNavItem: (path: string) => void;
  moveNavItemWithinSection: (sectionKey: NavSectionKey, fromIndex: number, toIndex: number) => void;
  movePinnedNavItem: (fromIndex: number, toIndex: number) => void;
  resetNavCustomization: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Defaults
      isDarkMode: false,
      sidebarOpen: true,
      cartOpen: false,
      dateRange: { start: '2020-01-01', end: '2025-01-01' },
      benchmark: 'SPY',
      costModel: 'Passive bps',
      environment: 'DEV',
      selectedRuns: [],
      pinnedNavPaths: [],
      navOrderBySection: createDefaultNavOrderBySection(),

      // Actions
      toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode })),
      setIsDarkMode: (dark) => set({ isDarkMode: dark }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setCartOpen: (open) => set({ cartOpen: open }),
      setDateRange: (range) => set({ dateRange: range }),
      setBenchmark: (benchmark) => set({ benchmark }),
      setCostModel: (model) => set({ costModel: model }),
      setEnvironment: (env) => set({ environment: env }),

      addToCart: (runId) =>
        set((state) => ({
          selectedRuns: [...new Set([...state.selectedRuns, runId])]
        })),
      removeFromCart: (runId) =>
        set((state) => ({
          selectedRuns: state.selectedRuns.filter((id) => id !== runId)
        })),
      clearCart: () => set({ selectedRuns: [] }),

      togglePinnedNavItem: (path) =>
        set((state) => {
          if (!hasKnownNavPath(path)) {
            return {};
          }

          const pinnedNavPaths = normalizePinnedNavPaths(state.pinnedNavPaths);
          const isPinned = pinnedNavPaths.includes(path);

          return {
            pinnedNavPaths: isPinned
              ? pinnedNavPaths.filter((currentPath) => currentPath !== path)
              : [...pinnedNavPaths, path]
          };
        }),

      moveNavItemWithinSection: (sectionKey, fromIndex, toIndex) =>
        set((state) => {
          const navOrderBySection = normalizeNavOrderBySection(state.navOrderBySection);
          const currentSectionOrder = navOrderBySection[sectionKey];
          const nextSectionOrder = moveNavItemWithinSectionOrder(
            currentSectionOrder,
            state.pinnedNavPaths,
            fromIndex,
            toIndex
          );

          if (nextSectionOrder.every((path, index) => path === currentSectionOrder[index])) {
            return {};
          }

          return {
            navOrderBySection: {
              ...navOrderBySection,
              [sectionKey]: nextSectionOrder
            }
          };
        }),

      movePinnedNavItem: (fromIndex, toIndex) =>
        set((state) => {
          const pinnedNavPaths = normalizePinnedNavPaths(state.pinnedNavPaths);
          const nextPinnedNavPaths = moveItem(pinnedNavPaths, fromIndex, toIndex);

          if (nextPinnedNavPaths.every((path, index) => path === pinnedNavPaths[index])) {
            return {};
          }

          return {
            pinnedNavPaths: nextPinnedNavPaths
          };
        }),

      resetNavCustomization: () =>
        set({
          pinnedNavPaths: [],
          navOrderBySection: createDefaultNavOrderBySection()
        })
    }),
    {
      name: UI_STORAGE_KEY,
      merge: (persistedState, currentState) => {
        const mergedState = {
          ...currentState,
          ...(persistedState as Partial<UIState>)
        };

        return {
          ...mergedState,
          pinnedNavPaths: normalizePinnedNavPaths(mergedState.pinnedNavPaths),
          navOrderBySection: normalizeNavOrderBySection(mergedState.navOrderBySection)
        };
      },
      partialize: (state) => ({
        // Only persist settings the user would expect to stick
        isDarkMode: state.isDarkMode,
        benchmark: state.benchmark,
        costModel: state.costModel,
        dateRange: state.dateRange,
        pinnedNavPaths: state.pinnedNavPaths,
        navOrderBySection: state.navOrderBySection
      })
    }
  )
);
