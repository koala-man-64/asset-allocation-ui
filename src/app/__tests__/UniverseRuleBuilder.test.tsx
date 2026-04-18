import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';

import { UniverseRuleBuilder } from '@/features/universes/components/UniverseRuleBuilder';
import { buildEmptyUniverse } from '@/features/universes/lib/universeUtils';
import { universeApi } from '@/services/universeApi';
import { renderWithProviders } from '@/test/utils';
import type { UniverseDraftDefinition } from '@/types/strategy';

vi.mock('@/services/universeApi', () => ({
  universeApi: {
    getUniverseCatalog: vi.fn(),
    previewUniverse: vi.fn()
  }
}));

function BuilderHarness() {
  const [value, setValue] = useState<UniverseDraftDefinition>(buildEmptyUniverse());

  return (
    <>
      <UniverseRuleBuilder value={value} onChange={setValue} />
      <pre data-testid="universe-json">{JSON.stringify(value)}</pre>
    </>
  );
}

function getConditionField() {
  return screen.getByLabelText(/^Field$/i);
}

function getConditionOperator() {
  return screen.getByLabelText(/^Operator$/i);
}

describe('UniverseRuleBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(universeApi.getUniverseCatalog).mockResolvedValue({
      source: 'postgres_gold',
      fields: [
        {
          id: 'market.close',
          label: 'Close Price',
          valueKind: 'number',
          operators: ['eq', 'gt', 'in', 'is_null']
        },
        {
          id: 'security.sector',
          label: 'Security Sector',
          valueKind: 'string',
          operators: ['eq', 'in', 'is_null']
        },
        {
          id: 'security.is_active',
          label: 'Security Active Flag',
          valueKind: 'boolean',
          operators: ['eq', 'ne', 'in', 'is_null']
        },
        {
          id: 'market.trade_date',
          label: 'Trade Date',
          valueKind: 'date',
          operators: ['eq', 'gte', 'is_null']
        },
        {
          id: 'market.timestamp',
          label: 'Market Timestamp',
          valueKind: 'datetime',
          operators: ['eq', 'gte', 'is_null']
        },
        {
          id: 'quality.piotroski_f_score',
          label: 'Piotroski F-Score',
          valueKind: 'number',
          operators: ['gte', 'lte']
        }
      ]
    });

    vi.mocked(universeApi.previewUniverse).mockResolvedValue({
      source: 'postgres_gold',
      symbolCount: 2,
      sampleSymbols: ['AAPL', 'MSFT'],
      fieldsUsed: ['quality.piotroski_f_score'],
      warnings: ['Universe preview matched stale gold rows.']
    });
  });

  it('initializes the first condition from catalog ids and resets dependent fields on field change', async () => {
    renderWithProviders(<BuilderHarness />);

    await waitFor(() => {
      expect(getConditionField()).toHaveValue('market.close');
    });

    const fieldSelect = getConditionField();
    const operatorSelect = getConditionOperator();

    expect(fieldSelect).toHaveValue('market.close');
    expect(screen.getByRole('option', { name: 'Close Price' })).toBeInTheDocument();
    expect(operatorSelect).toHaveValue('eq');

    fireEvent.change(screen.getByLabelText(/value/i), {
      target: { value: '10' }
    });
    fireEvent.change(fieldSelect, {
      target: { value: 'quality.piotroski_f_score' }
    });

    await waitFor(() => {
      expect(getConditionOperator()).toHaveValue('gte');
    });

    expect(screen.getByLabelText(/value/i)).toHaveValue(null);
    expect(screen.getByTestId('universe-json').textContent).toContain(
      '"field":"quality.piotroski_f_score"'
    );
  });

  it('materializes multi-value and null operators with field ids only', async () => {
    renderWithProviders(<BuilderHarness />);

    await waitFor(() => {
      expect(getConditionField()).toHaveValue('market.close');
    });

    fireEvent.change(getConditionField(), {
      target: { value: 'security.sector' }
    });
    fireEvent.change(getConditionOperator(), {
      target: { value: 'in' }
    });
    fireEvent.change(screen.getByLabelText(/values/i), {
      target: { value: 'Technology\nHealth Care' }
    });
    fireEvent.click(screen.getByRole('button', { name: /preview universe/i }));

    await waitFor(() => {
      expect(universeApi.previewUniverse).toHaveBeenLastCalledWith({
        universe: {
          source: 'postgres_gold',
          root: {
            kind: 'group',
            operator: 'and',
            clauses: [
              {
                kind: 'condition',
                field: 'security.sector',
                operator: 'in',
                values: ['Technology', 'Health Care']
              }
            ]
          }
        },
        sampleLimit: 12
      });
    });

    fireEvent.change(getConditionOperator(), {
      target: { value: 'is_null' }
    });
    fireEvent.click(screen.getByRole('button', { name: /preview universe/i }));

    await waitFor(() => {
      expect(universeApi.previewUniverse).toHaveBeenLastCalledWith({
        universe: {
          source: 'postgres_gold',
          root: {
            kind: 'group',
            operator: 'and',
            clauses: [
              {
                kind: 'condition',
                field: 'security.sector',
                operator: 'is_null'
              }
            ]
          }
        },
        sampleLimit: 12
      });
    });

    expect(await screen.findByText(/stale gold rows/i)).toBeInTheDocument();
  });

  it('uses boolean, date, and datetime value editors that preserve contract-compatible values', async () => {
    renderWithProviders(<BuilderHarness />);

    await waitFor(() => {
      expect(getConditionField()).toHaveValue('market.close');
    });

    fireEvent.change(getConditionField(), {
      target: { value: 'security.is_active' }
    });
    fireEvent.change(screen.getByLabelText(/value/i), {
      target: { value: 'false' }
    });
    fireEvent.click(screen.getByRole('button', { name: /preview universe/i }));

    await waitFor(() => {
      expect(universeApi.previewUniverse).toHaveBeenLastCalledWith({
        universe: expect.objectContaining({
          root: expect.objectContaining({
            clauses: [
              expect.objectContaining({
                field: 'security.is_active',
                operator: 'eq',
                value: false
              })
            ]
          })
        }),
        sampleLimit: 12
      });
    });

    fireEvent.change(getConditionField(), {
      target: { value: 'market.trade_date' }
    });
    fireEvent.change(getConditionOperator(), {
      target: { value: 'gte' }
    });
    fireEvent.change(screen.getByLabelText(/value/i), {
      target: { value: '2026-03-08' }
    });
    fireEvent.click(screen.getByRole('button', { name: /preview universe/i }));

    await waitFor(() => {
      expect(universeApi.previewUniverse).toHaveBeenLastCalledWith({
        universe: expect.objectContaining({
          root: expect.objectContaining({
            clauses: [
              expect.objectContaining({
                field: 'market.trade_date',
                operator: 'gte',
                value: '2026-03-08'
              })
            ]
          })
        }),
        sampleLimit: 12
      });
    });

    fireEvent.change(getConditionField(), {
      target: { value: 'market.timestamp' }
    });
    fireEvent.change(getConditionOperator(), {
      target: { value: 'gte' }
    });
    fireEvent.change(screen.getByLabelText(/value/i), {
      target: { value: '2026-03-08T10:30' }
    });
    fireEvent.click(screen.getByRole('button', { name: /preview universe/i }));

    await waitFor(() => {
      expect(universeApi.previewUniverse).toHaveBeenLastCalledWith({
        universe: expect.objectContaining({
          root: expect.objectContaining({
            clauses: [
              expect.objectContaining({
                field: 'market.timestamp',
                operator: 'gte',
                value: '2026-03-08T10:30'
              })
            ]
          })
        }),
        sampleLimit: 12
      });
    });
  });

  it('shows validation and request failures instead of previewing incomplete rules', async () => {
    vi.mocked(universeApi.previewUniverse).mockRejectedValueOnce(new Error('preview failed'));

    renderWithProviders(<BuilderHarness />);

    await waitFor(() => {
      expect(getConditionField()).toHaveValue('market.close');
    });

    fireEvent.change(getConditionOperator(), {
      target: { value: '' }
    });
    fireEvent.click(screen.getByRole('button', { name: /preview universe/i }));

    await waitFor(() => {
      expect(universeApi.previewUniverse).not.toHaveBeenCalled();
    });

    expect(await screen.findByText(/require an operator/i)).toBeInTheDocument();

    fireEvent.change(getConditionOperator(), {
      target: { value: 'gt' }
    });
    fireEvent.change(screen.getByLabelText(/value/i), {
      target: { value: '10' }
    });
    fireEvent.click(screen.getByRole('button', { name: /preview universe/i }));

    expect(await screen.findByText(/preview failed/i)).toBeInTheDocument();
  });
});
