import { describe, expect, it } from 'vitest';

import { backtestKeys } from '@/services/backtestHooks';

describe('backtestKeys', () => {
  it('builds summary keys without a source discriminator', () => {
    expect(backtestKeys.summary('run-1')).toEqual(['backtest', 'runs', 'run-1', 'summary']);
  });

  it('builds timeseries keys from run id and max points only', () => {
    expect(backtestKeys.timeseries('run-1', 5000)).toEqual([
      'backtest',
      'runs',
      'run-1',
      'timeseries',
      5000
    ]);
  });

  it('builds rolling keys from run id, window, and max points only', () => {
    expect(backtestKeys.rolling('run-1', 63, 5000)).toEqual([
      'backtest',
      'runs',
      'run-1',
      'rolling',
      63,
      5000
    ]);
  });

  it('builds trade keys from run id and paging only', () => {
    expect(backtestKeys.trades('run-1', 2000, 0)).toEqual([
      'backtest',
      'runs',
      'run-1',
      'trades',
      2000,
      0
    ]);
  });
});
