import { describe, expect, it } from 'vitest';
import {
  createDefaultNavOrderBySection,
  getNavSubgroupTitle,
  moveNavItemWithinSectionOrder,
  NAV_SECTIONS,
  normalizeNavOrderBySection,
  normalizePinnedNavPaths,
  resolveVisibleNavSections
} from './navigationModel';

describe('navigationModel', () => {
  it('normalizes pinned paths and section order against known navigation items', () => {
    expect(normalizePinnedNavPaths(['/strategies', '/missing', '/strategies'])).toEqual([
      '/strategies'
    ]);

    const normalizedOrder = normalizeNavOrderBySection({
      'market-intelligence': ['/stock-detail', '/missing', '/stock-detail'],
      'live-operations': ['/postgres-explorer', '/unknown', '/system-status']
    });
    const defaultLiveOperations = createDefaultNavOrderBySection()['live-operations'].filter(
      (path) => !['/postgres-explorer', '/system-status'].includes(path)
    );

    expect(normalizedOrder['market-intelligence']).toEqual(['/stock-detail', '/stock-explorer']);
    expect(normalizedOrder['live-operations'].slice(0, 4)).toEqual([
      '/postgres-explorer',
      '/system-status',
      ...defaultLiveOperations.slice(0, 2)
    ]);
    expect(normalizedOrder['live-operations']).toContain('/intraday-monitor');
    expect(normalizedOrder['live-operations']).toContain('/symbol-enrichment');
    expect(normalizedOrder['live-operations']).toContain('/accounts');
    expect(normalizedOrder['live-operations']).toContain('/portfolios');
    expect(normalizedOrder['live-operations']).not.toContain('/strategy-exploration');
    expect(normalizedOrder['live-operations']).not.toContain('/universes');
    expect(normalizedOrder['live-operations']).not.toContain('/rankings');
    expect(normalizedOrder.access).toEqual(['/login']);
  });

  it('preserves pinned slots when reordering visible section items', () => {
    const nextOrder = moveNavItemWithinSectionOrder(
      ['/data-explorer', '/data-quality', '/data-profiling', '/system-status'],
      ['/data-quality'],
      2,
      0
    );

    expect(nextOrder).toEqual([
      '/system-status',
      '/data-quality',
      '/data-explorer',
      '/data-profiling'
    ]);
  });

  it('builds pinned and visible sections without duplication', () => {
    const { pinnedItems, visibleSections } = resolveVisibleNavSections(
      ['/rankings', '/strategies'],
      createDefaultNavOrderBySection()
    );

    expect(pinnedItems.map((item) => item.label)).toEqual(['Strategies']);

    const liveOperationsSection = visibleSections.find(
      (section) => section.key === 'live-operations'
    );
    expect(liveOperationsSection?.items.map((item) => item.path)).not.toContain('/rankings');
    expect(liveOperationsSection?.items.map((item) => item.path)).not.toContain('/universes');
    expect(liveOperationsSection?.items.map((item) => item.path)).not.toContain('/strategy-exploration');
    expect(liveOperationsSection?.items.map((item) => item.path)).not.toContain('/strategies');
    expect(liveOperationsSection?.items.map((item) => item.path)).toContain('/accounts');
    expect(liveOperationsSection?.items.map((item) => item.path)).toContain('/intraday-monitor');
    expect(liveOperationsSection?.items.map((item) => item.path)).toContain('/portfolios');
  });

  it('orders live operations by subgroup metadata', () => {
    const liveOperationsSection = NAV_SECTIONS.find((section) => section.key === 'live-operations');
    const subgroupTransitions = liveOperationsSection?.items
      .filter((item, index, items) => item.subgroupKey !== items[index - 1]?.subgroupKey)
      .map((item) => getNavSubgroupTitle(item.subgroupKey));

    expect(liveOperationsSection?.items.slice(0, 2).map((item) => item.path)).toEqual([
      '/data-explorer',
      '/postgres-explorer'
    ]);
    expect(subgroupTransitions).toEqual([
      'DATA ACCESS',
      'MONITORING',
      'DATA HYGIENE',
      'STRATEGY SETUP',
      'PORTFOLIO & TRADING',
      'OPS TOOLS'
    ]);
  });
});
