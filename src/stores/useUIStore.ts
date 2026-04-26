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
const UI_STORE_VERSION = 1;

interface UIState {
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;
  pinnedNavPaths: string[];
  navOrderBySection: NavOrderBySection;
  togglePinnedNavItem: (path: string) => void;
  moveNavItemWithinSection: (sectionKey: NavSectionKey, fromIndex: number, toIndex: number) => void;
  movePinnedNavItem: (fromIndex: number, toIndex: number) => void;
  resetNavCustomization: () => void;
}

type PersistedUIState = Partial<
  Pick<UIState, 'isDarkMode' | 'pinnedNavPaths' | 'navOrderBySection'>
>;

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      isDarkMode: false,
      pinnedNavPaths: [],
      navOrderBySection: createDefaultNavOrderBySection(),

      setIsDarkMode: (dark) => set({ isDarkMode: dark }),

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
      version: UI_STORE_VERSION,
      migrate: (persistedState) => {
        const state = (persistedState as PersistedUIState | undefined) ?? {};

        return {
          isDarkMode: Boolean(state.isDarkMode),
          pinnedNavPaths: normalizePinnedNavPaths(state.pinnedNavPaths),
          navOrderBySection: normalizeNavOrderBySection(state.navOrderBySection)
        };
      },
      merge: (persistedState, currentState) => {
        const state = (persistedState as PersistedUIState | undefined) ?? {};
        const mergedState = {
          ...currentState,
          ...state
        };

        return {
          ...mergedState,
          pinnedNavPaths: normalizePinnedNavPaths(mergedState.pinnedNavPaths),
          navOrderBySection: normalizeNavOrderBySection(mergedState.navOrderBySection)
        };
      },
      partialize: (state) => ({
        isDarkMode: state.isDarkMode,
        pinnedNavPaths: state.pinnedNavPaths,
        navOrderBySection: state.navOrderBySection
      })
    }
  )
);
