import { describe, expect, it } from 'vitest';
import {
  createDefaultNavOrderBySection,
  moveNavItemWithinSectionOrder,
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
    expect(normalizedOrder['live-operations']).toContain('/rankings');
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

    expect(pinnedItems.map((item) => item.label)).toEqual(['Ranking Configurations', 'Strategies']);

    const liveOperationsSection = visibleSections.find(
      (section) => section.key === 'live-operations'
    );
    expect(liveOperationsSection?.items.map((item) => item.path)).not.toContain('/rankings');
    expect(liveOperationsSection?.items.map((item) => item.path)).not.toContain('/strategies');
    expect(liveOperationsSection?.items.map((item) => item.path)).toContain('/accounts');
    expect(liveOperationsSection?.items.map((item) => item.path)).toContain('/intraday-monitor');
    expect(liveOperationsSection?.items.map((item) => item.path)).toContain('/portfolios');
  });
});
