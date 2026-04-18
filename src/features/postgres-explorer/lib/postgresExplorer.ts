import type {
  PostgresColumnMetadata,
  PostgresTableMetadata,
  QueryFilterOperator
} from '@/services/PostgresService';

const HIDDEN_SCHEMAS = new Set(['public', 'information_schema']);
const BOOLEAN_TRUE_VALUES = new Set(['1', 'true', 't', 'yes', 'y', 'on']);
const BOOLEAN_FALSE_VALUES = new Set(['0', 'false', 'f', 'no', 'n', 'off']);

export type RowData = Record<string, unknown>;

export type EditableFieldState = {
  raw: string;
  isNull: boolean;
};

export type EditState = {
  match: Record<string, unknown>;
  fields: Record<string, EditableFieldState>;
};

export type QueryFilterDraft = {
  id: string;
  columnName: string;
  operator: QueryFilterOperator;
  value: string;
};

export const TEXT_FILTER_OPERATORS: Array<{ value: QueryFilterOperator; label: string }> = [
  { value: 'contains', label: 'contains' },
  { value: 'eq', label: 'equals' },
  { value: 'neq', label: 'does not equal' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'is_null', label: 'is null' },
  { value: 'is_not_null', label: 'is not null' }
];

export const COMPARISON_FILTER_OPERATORS: Array<{
  value: QueryFilterOperator;
  label: string;
}> = [
  { value: 'eq', label: 'equals' },
  { value: 'neq', label: 'does not equal' },
  { value: 'gt', label: 'greater than' },
  { value: 'gte', label: 'greater than or equal' },
  { value: 'lt', label: 'less than' },
  { value: 'lte', label: 'less than or equal' },
  { value: 'is_null', label: 'is null' },
  { value: 'is_not_null', label: 'is not null' }
];

export const BOOLEAN_FILTER_OPERATORS: Array<{ value: QueryFilterOperator; label: string }> = [
  { value: 'eq', label: 'equals' },
  { value: 'neq', label: 'does not equal' },
  { value: 'is_null', label: 'is null' },
  { value: 'is_not_null', label: 'is not null' }
];

export function isVisibleSchema(schema: string): boolean {
  return !HIDDEN_SCHEMAS.has(
    String(schema || '')
      .trim()
      .toLowerCase()
  );
}

export function normalizeFieldValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
}

export function buildEditState(row: RowData, metadata: PostgresTableMetadata): EditState {
  const match = metadata.primary_key.reduce<Record<string, unknown>>((acc, columnName) => {
    acc[columnName] = row[columnName];
    return acc;
  }, {});

  const fields = metadata.columns.reduce<Record<string, EditableFieldState>>((acc, column) => {
    const value = row[column.name];
    acc[column.name] = {
      raw: normalizeFieldValue(value),
      isNull: value === null || value === undefined
    };
    return acc;
  }, {});

  return { match, fields };
}

export function isJsonType(dataType: string): boolean {
  return String(dataType || '').toLowerCase().includes('json');
}

export function isArrayType(dataType: string): boolean {
  const normalized = String(dataType || '').toLowerCase();
  return normalized.includes('array') || normalized.endsWith('[]');
}

export function isBooleanType(dataType: string): boolean {
  return String(dataType || '').toLowerCase().includes('bool');
}

export function isNumericType(dataType: string): boolean {
  const normalized = String(dataType || '').toLowerCase();
  return ['int', 'numeric', 'decimal', 'real', 'double', 'float', 'serial', 'money'].some(
    (token) => normalized.includes(token)
  );
}

export function isDateType(dataType: string): boolean {
  const normalized = String(dataType || '').toLowerCase();
  return normalized.includes('date') && !normalized.includes('time') && !normalized.includes('stamp');
}

export function isDateTimeType(dataType: string): boolean {
  const normalized = String(dataType || '').toLowerCase();
  return normalized.includes('timestamp') || normalized.includes('datetime');
}

export function isTimeType(dataType: string): boolean {
  const normalized = String(dataType || '').toLowerCase();
  return normalized.includes('time') && !normalized.includes('stamp');
}

export function isTextType(dataType: string): boolean {
  const normalized = String(dataType || '').toLowerCase();
  return ['char', 'text', 'uuid', 'citext'].some((token) => normalized.includes(token));
}

export function getFilterOperatorOptions(
  dataType: string
): Array<{ value: QueryFilterOperator; label: string }> {
  if (isBooleanType(dataType)) {
    return BOOLEAN_FILTER_OPERATORS;
  }
  if (
    isNumericType(dataType) ||
    isDateType(dataType) ||
    isDateTimeType(dataType) ||
    isTimeType(dataType)
  ) {
    return COMPARISON_FILTER_OPERATORS;
  }
  if (isTextType(dataType)) {
    return TEXT_FILTER_OPERATORS;
  }
  return BOOLEAN_FILTER_OPERATORS;
}

export function getDefaultFilterOperator(dataType: string): QueryFilterOperator {
  return getFilterOperatorOptions(dataType)[0]?.value ?? 'eq';
}

export function queryFilterOperatorNeedsValue(operator: QueryFilterOperator): boolean {
  return operator !== 'is_null' && operator !== 'is_not_null';
}

export function createQueryFilterId(): string {
  return `filter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createQueryFilterDraft(metadata: PostgresTableMetadata | null): QueryFilterDraft | null {
  const firstColumn = metadata?.columns?.[0];
  if (!firstColumn) {
    return null;
  }

  return {
    id: createQueryFilterId(),
    columnName: firstColumn.name,
    operator: getDefaultFilterOperator(firstColumn.data_type),
    value: ''
  };
}

export function shouldUseTextarea(column: PostgresColumnMetadata, rawValue: string): boolean {
  return (
    isJsonType(column.data_type) ||
    isArrayType(column.data_type) ||
    rawValue.includes('\n') ||
    rawValue.length > 72
  );
}

export function coerceFieldValue(
  column: PostgresColumnMetadata,
  field: EditableFieldState
): unknown {
  if (field.isNull) {
    return null;
  }

  const dataType = String(column.data_type || '').toLowerCase();
  const raw = field.raw;
  const trimmed = raw.trim();

  if (isJsonType(dataType) || isArrayType(dataType)) {
    if (!trimmed) {
      throw new Error(`Field "${column.name}" requires valid JSON.`);
    }
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(`Field "${column.name}" must contain valid JSON.`);
    }
  }

  if (isBooleanType(dataType)) {
    const normalized = trimmed.toLowerCase();
    if (BOOLEAN_TRUE_VALUES.has(normalized)) {
      return true;
    }
    if (BOOLEAN_FALSE_VALUES.has(normalized)) {
      return false;
    }
    throw new Error(`Field "${column.name}" must be a boolean value.`);
  }

  if (isNumericType(dataType)) {
    if (!trimmed) {
      throw new Error(`Field "${column.name}" must be a numeric value.`);
    }
    const numeric = Number(trimmed);
    if (Number.isNaN(numeric)) {
      throw new Error(`Field "${column.name}" must be a numeric value.`);
    }
    return numeric;
  }

  return raw;
}
