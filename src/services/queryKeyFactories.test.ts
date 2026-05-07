import { describe, expect, it } from 'vitest';

import {
  dataQualityKeys,
  portfolioKeys,
  rankingKeys,
  regimeKeys,
  strategyKeys,
  universeKeys
} from './queryKeyFactories';

describe('query key factories', () => {
  it('keeps portfolio invalidation roots stable', () => {
    expect(portfolioKeys.all()).toEqual(['portfolios']);
    expect(portfolioKeys.detail('core')).toEqual(['portfolios', 'detail', 'core']);
    expect(portfolioKeys.monitor(null)).toEqual(['portfolios', 'monitor', 'none']);
  });

  it('keeps shared configuration roots stable', () => {
    expect(rankingKeys.detail('quality')).toEqual(['ranking-schemas', 'detail', 'quality']);
    expect(strategyKeys.detail('momentum')).toEqual(['strategies', 'detail', 'momentum']);
    expect(universeKeys.detail(null)).toEqual(['universe-configs', 'detail', 'none']);
    expect(regimeKeys.current('default')).toEqual(['regimes', 'current', 'default']);
    expect(dataQualityKeys.validation('silver', 'market')).toEqual([
      'data-quality',
      'validation',
      'silver',
      'market'
    ]);
  });
});
