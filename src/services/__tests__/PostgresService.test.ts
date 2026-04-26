import { beforeEach, describe, expect, it, vi } from 'vitest';

import { request } from '@/services/apiService';
import { PostgresService } from '@/services/PostgresService';

vi.mock('@/services/apiService', () => ({
  request: vi.fn()
}));

describe('PostgresService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(request).mockResolvedValue({});
  });

  it('serializes gold column lookup filters into a query string', async () => {
    await PostgresService.listGoldColumnLookup({
      table: 'gold_rankings',
      q: 'alpha',
      status: 'approved',
      limit: 25,
      offset: 50
    });

    expect(request).toHaveBeenCalledWith(
      '/system/postgres/gold-column-lookup?table=gold_rankings&q=alpha&status=approved&limit=25&offset=50'
    );
  });

  it('posts queryTable requests as JSON bodies', async () => {
    await PostgresService.queryTable({
      schema_name: 'public',
      table_name: 'portfolio_runs',
      limit: 10,
      offset: 20,
      filters: [{ column_name: 'status', operator: 'eq', value: 'completed' }]
    });

    expect(request).toHaveBeenCalledWith('/system/postgres/query', {
      method: 'POST',
      body: JSON.stringify({
        schema_name: 'public',
        table_name: 'portfolio_runs',
        limit: 10,
        offset: 20,
        filters: [{ column_name: 'status', operator: 'eq', value: 'completed' }]
      })
    });
  });

  it('posts updateRow requests as JSON bodies', async () => {
    await PostgresService.updateRow({
      schema_name: 'public',
      table_name: 'portfolio_runs',
      match: { run_id: 'run-1' },
      values: { status: 'archived' }
    });

    expect(request).toHaveBeenCalledWith('/system/postgres/update', {
      method: 'POST',
      body: JSON.stringify({
        schema_name: 'public',
        table_name: 'portfolio_runs',
        match: { run_id: 'run-1' },
        values: { status: 'archived' }
      })
    });
  });

  it('posts purgeTable requests as JSON bodies', async () => {
    await PostgresService.purgeTable({
      schema_name: 'public',
      table_name: 'portfolio_runs'
    });

    expect(request).toHaveBeenCalledWith('/system/postgres/purge', {
      method: 'POST',
      body: JSON.stringify({
        schema_name: 'public',
        table_name: 'portfolio_runs'
      })
    });
  });
});
