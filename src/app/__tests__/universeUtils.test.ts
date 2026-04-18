import { describe, expect, it } from 'vitest';

import {
  buildEmptyUniverse,
  materializeUniverseDefinition,
  toUniverseDraft
} from '@/features/universes/lib/universeUtils';

describe('universeUtils', () => {
  it('materializes a valid draft definition into the shared contract shape', () => {
    const draft = buildEmptyUniverse();
    draft.root.clauses = [
      {
        kind: 'condition',
        field: 'security.is_active',
        operator: 'eq',
        value: true
      }
    ];

    expect(materializeUniverseDefinition(draft)).toEqual({
      source: 'postgres_gold',
      root: {
        kind: 'group',
        operator: 'and',
        clauses: [
          {
            kind: 'condition',
            field: 'security.is_active',
            operator: 'eq',
            value: true
          }
        ]
      }
    });
  });

  it('rejects incomplete draft conditions before they reach the API', () => {
    const missingField = buildEmptyUniverse();
    expect(() => materializeUniverseDefinition(missingField)).toThrow(/require a field/i);

    const missingValues = buildEmptyUniverse();
    missingValues.root.clauses = [
      {
        kind: 'condition',
        field: 'security.sector',
        operator: 'in',
        values: []
      }
    ];

    expect(() => materializeUniverseDefinition(missingValues)).toThrow(/requires at least one value/i);
  });

  it('converts persisted universe definitions back into editable draft state', () => {
    const draft = toUniverseDraft({
      source: 'postgres_gold',
      root: {
        kind: 'group',
        operator: 'or',
        clauses: [
          {
            kind: 'condition',
            field: 'market.trade_date',
            operator: 'gte',
            value: '2026-03-08'
          }
        ]
      }
    });

    expect(draft.root.operator).toBe('or');
    expect(draft.root.clauses[0]).toEqual({
      kind: 'condition',
      field: 'market.trade_date',
      operator: 'gte',
      value: '2026-03-08'
    });
  });
});
