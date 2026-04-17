import type {
  RankingCatalogResponse,
  RankingFactor,
  RankingGroup,
  RankingSchemaDetail,
  RankingTransform,
  RankingTransformType
} from '@/types/strategy';

export const TRANSFORM_OPTIONS: Array<{ value: RankingTransformType; label: string }> = [
  { value: 'percentile_rank', label: 'Percentile Rank' },
  { value: 'zscore', label: 'Z-Score' },
  { value: 'minmax', label: 'Min/Max' },
  { value: 'clip', label: 'Clip' },
  { value: 'winsorize', label: 'Winsorize' },
  { value: 'coalesce', label: 'Coalesce' },
  { value: 'log1p', label: 'Log1p' },
  { value: 'negate', label: 'Negate' },
  { value: 'abs', label: 'Absolute' }
];

export const DIRECTION_OPTIONS = [
  { value: 'desc', label: 'Higher Is Better' },
  { value: 'asc', label: 'Lower Is Better' }
] as const;

export const MISSING_POLICY_OPTIONS = [
  { value: 'exclude', label: 'Exclude Missing' },
  { value: 'zero', label: 'Fill Missing With Zero' }
] as const;

const FALLBACK_TABLE = 'market_data';
const FALLBACK_COLUMN = 'return_20d';

export function buildEmptyTransform(type: RankingTransformType = 'percentile_rank'): RankingTransform {
  return { type, params: {} };
}

function getDefaultTableName(rankingCatalog?: RankingCatalogResponse | null): string {
  return rankingCatalog?.tables[0]?.name || FALLBACK_TABLE;
}

function getDefaultColumnName(
  rankingCatalog?: RankingCatalogResponse | null,
  tableName?: string
): string {
  if (!rankingCatalog?.tables.length) return FALLBACK_COLUMN;

  const matchingTable =
    rankingCatalog.tables.find((table) => table.name === tableName) || rankingCatalog.tables[0];

  return matchingTable?.columns[0]?.name || FALLBACK_COLUMN;
}

export function buildEmptyFactor(
  groupName: string,
  rankingCatalog?: RankingCatalogResponse | null
): RankingFactor {
  const table = getDefaultTableName(rankingCatalog);

  return {
    name: `${groupName}-factor-1`,
    table,
    column: getDefaultColumnName(rankingCatalog, table),
    weight: 1,
    direction: 'desc',
    missingValuePolicy: 'exclude',
    transforms: [buildEmptyTransform('zscore')]
  };
}

export function buildEmptyGroup(
  index: number,
  rankingCatalog?: RankingCatalogResponse | null,
  includeDefaultFactor = false
): RankingGroup {
  const name = index === 0 ? 'Composite' : `group-${index + 1}`;

  return {
    name,
    weight: 1,
    transforms: [buildEmptyTransform('percentile_rank')],
    factors: includeDefaultFactor ? [buildEmptyFactor(name, rankingCatalog)] : []
  };
}

export function buildEmptySchema(rankingCatalog?: RankingCatalogResponse | null): RankingSchemaDetail {
  return {
    name: '',
    description: '',
    version: 1,
    config: {
      universeConfigName: undefined,
      groups: [buildEmptyGroup(0, rankingCatalog, true)],
      overallTransforms: []
    }
  };
}

export function formatTimestamp(value?: string): string {
  if (!value) return 'Never updated';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(parsed);
}

export function parseParamValue(value: string): string | number | boolean | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : trimmed;
}

export function getTransformParamConfig(
  type: RankingTransformType
): Array<{ key: string; label: string }> {
  if (type === 'clip') {
    return [
      { key: 'lower', label: 'Lower Bound' },
      { key: 'upper', label: 'Upper Bound' }
    ];
  }

  if (type === 'winsorize') {
    return [
      { key: 'lowerQuantile', label: 'Lower Quantile' },
      { key: 'upperQuantile', label: 'Upper Quantile' }
    ];
  }

  if (type === 'coalesce') {
    return [{ key: 'value', label: 'Fallback Value' }];
  }

  return [];
}

export function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || toIndex < 0 || toIndex >= items.length) return items;

  const nextItems = items.slice();
  const [item] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, item);
  return nextItems;
}

function cloneTransform(transform: RankingTransform): RankingTransform {
  return {
    ...transform,
    params: { ...transform.params }
  };
}

function appendCopySuffix(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.toLowerCase().includes('copy') ? trimmed : `${trimmed}-copy`;
}

export function cloneFactor(factor: RankingFactor): RankingFactor {
  return {
    ...factor,
    name: appendCopySuffix(factor.name, 'factor-copy'),
    transforms: factor.transforms.map(cloneTransform)
  };
}

export function cloneGroup(group: RankingGroup): RankingGroup {
  return {
    ...group,
    name: appendCopySuffix(group.name, 'group-copy'),
    transforms: group.transforms.map(cloneTransform),
    factors: group.factors.map(cloneFactor)
  };
}

export function countFactors(groups: RankingGroup[]): number {
  return groups.reduce((sum, group) => sum + group.factors.length, 0);
}

export function serializeSchemaDetail(detail: RankingSchemaDetail): string {
  return JSON.stringify(detail);
}

export function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(index, length - 1);
}

export function formatTransformType(type: RankingTransformType): string {
  return TRANSFORM_OPTIONS.find((option) => option.value === type)?.label || type;
}

export function formatDirectionLabel(direction: 'asc' | 'desc'): string {
  return DIRECTION_OPTIONS.find((option) => option.value === direction)?.label || direction;
}

export function formatMissingPolicyLabel(policy: 'exclude' | 'zero'): string {
  return MISSING_POLICY_OPTIONS.find((option) => option.value === policy)?.label || policy;
}
