import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PostgresColumnMetadata, PostgresTableMetadata } from '@/services/PostgresService';
import {
  buildEditState,
  coerceFieldValue,
  createQueryFilterDraft,
  isVisibleSchema,
  queryFilterOperatorNeedsValue,
  shouldUseTextarea
} from '@/features/postgres-explorer/lib/postgresExplorer';

function column(overrides: Partial<PostgresColumnMetadata>): PostgresColumnMetadata {
  return {
    name: 'value',
    data_type: 'TEXT',
    nullable: true,
    primary_key: false,
    editable: true,
    edit_reason: null,
    ...overrides
  };
}

function metadata(columns: PostgresColumnMetadata[]): PostgresTableMetadata {
  return {
    schema_name: 'core',
    table_name: 'symbols',
    primary_key: ['symbol'],
    can_edit: true,
    edit_reason: null,
    columns
  };
}

describe('postgresExplorer helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('filters hidden schemas and keeps application schemas visible', () => {
    expect(isVisibleSchema('public')).toBe(false);
    expect(isVisibleSchema('information_schema')).toBe(false);
    expect(isVisibleSchema('core')).toBe(true);
  });

  it('builds edit state from primary-key metadata and normalizes object fields', () => {
    const state = buildEditState(
      {
        symbol: 'AAPL',
        payload: { score: 1 }
      },
      metadata([
        column({ name: 'symbol', data_type: 'TEXT', primary_key: true }),
        column({ name: 'payload', data_type: 'JSONB' })
      ])
    );

    expect(state.match).toEqual({ symbol: 'AAPL' });
    expect(state.fields.payload.raw).toBe('{\n  "score": 1\n}');
  });

  it('coerces json, boolean, and numeric edit values', () => {
    expect(
      coerceFieldValue(column({ data_type: 'JSONB' }), { raw: '{"a":1}', isNull: false })
    ).toEqual({
      a: 1
    });
    expect(coerceFieldValue(column({ data_type: 'BOOLEAN' }), { raw: 'yes', isNull: false })).toBe(
      true
    );
    expect(coerceFieldValue(column({ data_type: 'NUMERIC' }), { raw: '12.5', isNull: false })).toBe(
      12.5
    );
    expect(coerceFieldValue(column({ data_type: 'TEXT' }), { raw: ' raw ', isNull: false })).toBe(
      ' raw '
    );
  });

  it('rejects invalid json, boolean, and numeric edit values', () => {
    expect(() =>
      coerceFieldValue(column({ data_type: 'JSONB' }), { raw: 'not-json', isNull: false })
    ).toThrow('must contain valid JSON');
    expect(() =>
      coerceFieldValue(column({ data_type: 'BOOLEAN' }), { raw: 'maybe', isNull: false })
    ).toThrow('must be a boolean value');
    expect(() =>
      coerceFieldValue(column({ data_type: 'NUMERIC' }), { raw: 'abc', isNull: false })
    ).toThrow('must be a numeric value');
  });

  it('uses textarea for structured or long field values', () => {
    expect(shouldUseTextarea(column({ data_type: 'JSONB' }), '{}')).toBe(true);
    expect(shouldUseTextarea(column({ data_type: 'TEXT' }), 'x'.repeat(73))).toBe(true);
    expect(shouldUseTextarea(column({ data_type: 'TEXT' }), 'short')).toBe(false);
  });

  it('creates filter drafts from the first metadata column', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    expect(
      createQueryFilterDraft(metadata([column({ name: 'symbol', data_type: 'TEXT' })]))
    ).toEqual({
      id: 'filter-1-i',
      columnName: 'symbol',
      operator: 'contains',
      value: ''
    });
  });

  it('knows null operators do not carry values', () => {
    expect(queryFilterOperatorNeedsValue('eq')).toBe(true);
    expect(queryFilterOperatorNeedsValue('is_null')).toBe(false);
    expect(queryFilterOperatorNeedsValue('is_not_null')).toBe(false);
  });
});
