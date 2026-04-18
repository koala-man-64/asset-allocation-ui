import type {
  UniverseCondition,
  UniverseConditionOperator,
  UniverseDefinition,
  UniverseDraftCondition,
  UniverseDraftDefinition,
  UniverseDraftGroup,
  UniverseDraftNode,
  UniverseFieldId,
  UniverseGroup,
  UniverseNode,
  UniverseValue,
  UniverseValueKind
} from '@/types/strategy';

type AnyUniverseNode = UniverseDraftNode | UniverseNode;

export function buildEmptyUniverseCondition(): UniverseDraftCondition {
  return {
    kind: 'condition',
    field: '',
    operator: ''
  };
}

export function buildEmptyUniverseGroup(operator: 'and' | 'or' = 'and'): UniverseDraftGroup {
  return {
    kind: 'group',
    operator,
    clauses: [buildEmptyUniverseCondition()]
  };
}

export function buildEmptyUniverse(): UniverseDraftDefinition {
  return {
    source: 'postgres_gold',
    root: buildEmptyUniverseGroup()
  };
}

export function cloneUniverse<T extends UniverseDraftDefinition | UniverseDefinition>(universe: T): T {
  return JSON.parse(JSON.stringify(universe)) as T;
}

export function isUniverseGroup(node: AnyUniverseNode): node is UniverseDraftGroup | UniverseGroup {
  return node.kind === 'group';
}

export function isMultiValueOperator(operator: string): boolean {
  return operator === 'in' || operator === 'not_in';
}

export function isNullOperator(operator: string): boolean {
  return operator === 'is_null' || operator === 'is_not_null';
}

export function countUniverseConditions(node: AnyUniverseNode): number {
  if (!isUniverseGroup(node)) return 1;
  return node.clauses.reduce(
    (sum: number, clause: UniverseDraftNode | UniverseNode) => sum + countUniverseConditions(clause),
    0
  );
}

export function collectUniverseFields(node: AnyUniverseNode): string[] {
  const fields = new Set<string>();
  collectUniverseFieldsInto(node, fields);
  return Array.from(fields).sort();
}

function collectUniverseFieldsInto(node: AnyUniverseNode, fields: Set<string>): void {
  if (!isUniverseGroup(node)) {
    if (node.field) fields.add(node.field);
    return;
  }
  node.clauses.forEach((clause: UniverseDraftNode | UniverseNode) =>
    collectUniverseFieldsInto(clause, fields)
  );
}

export function summarizeUniverse(
  universe: UniverseDraftDefinition | UniverseDefinition
): string {
  const conditionCount = countUniverseConditions(universe.root);
  const fieldCount = collectUniverseFields(universe.root).length;
  const conditionLabel = conditionCount === 1 ? 'condition' : 'conditions';
  const fieldLabel = fieldCount === 1 ? 'field' : 'fields';
  return `${conditionCount} ${conditionLabel} across ${fieldCount} ${fieldLabel}`;
}

export function formatUniverseOperator(operator: 'and' | 'or'): string {
  return operator === 'and' ? 'Match all' : 'Match any';
}

export function coerceDraftValue(raw: string, kind: UniverseValueKind): UniverseValue {
  const trimmed = raw.trim();
  if (kind === 'number') {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : raw;
  }
  if (kind === 'boolean') {
    const normalized = trimmed.toLowerCase();
    if (['true', '1', 'yes', 'y', 'on', 't'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off', 'f'].includes(normalized)) return false;
  }
  return raw;
}

export function toUniverseDraft(universe: UniverseDefinition): UniverseDraftDefinition {
  return {
    source: universe.source,
    root: toUniverseDraftGroup(universe.root)
  };
}

function toUniverseDraftGroup(group: UniverseGroup): UniverseDraftGroup {
  return {
    kind: 'group',
    operator: group.operator,
    clauses: group.clauses.map((clause: UniverseNode) =>
      isUniverseGroup(clause) ? toUniverseDraftGroup(clause) : toUniverseDraftCondition(clause)
    )
  };
}

function toUniverseDraftCondition(condition: UniverseCondition): UniverseDraftCondition {
  return {
    kind: 'condition',
    field: condition.field,
    operator: condition.operator,
    value: condition.value,
    values: condition.values
  };
}

export function materializeUniverseDefinition(
  universe: UniverseDraftDefinition
): UniverseDefinition {
  return {
    source: universe.source,
    root: materializeUniverseGroup(universe.root)
  };
}

function materializeUniverseGroup(group: UniverseDraftGroup): UniverseGroup {
  if (!group.clauses.length) {
    throw new Error('Universe groups must contain at least one clause.');
  }

  return {
    kind: 'group',
    operator: group.operator,
    clauses: group.clauses.map((clause: UniverseDraftNode) =>
      isUniverseGroup(clause) ? materializeUniverseGroup(clause) : materializeUniverseCondition(clause)
    )
  };
}

function materializeUniverseCondition(condition: UniverseDraftCondition): UniverseCondition {
  const field = normalizeDraftField(condition.field);
  const operator = normalizeDraftOperator(condition.operator);

  if (isNullOperator(operator)) {
    if (hasMaterialValue(condition.value) || sanitizeValues(condition.values).length > 0) {
      throw new Error(`${field} uses ${operator}, which does not accept values.`);
    }

    return {
      kind: 'condition',
      field,
      operator
    };
  }

  if (isMultiValueOperator(operator)) {
    if (hasMaterialValue(condition.value)) {
      throw new Error(`${field} uses ${operator}, which only accepts values.`);
    }
    const values = sanitizeValues(condition.values);
    if (!values.length) {
      throw new Error(`${field} uses ${operator}, which requires at least one value.`);
    }

    return {
      kind: 'condition',
      field,
      operator,
      values
    };
  }

  if (!hasMaterialValue(condition.value)) {
    throw new Error(`${field} uses ${operator}, which requires a value.`);
  }
  if (sanitizeValues(condition.values).length > 0) {
    throw new Error(`${field} uses ${operator}, which only accepts a single value.`);
  }

  return {
    kind: 'condition',
    field,
    operator,
    value: condition.value
  };
}

function normalizeDraftField(field: UniverseDraftCondition['field']): UniverseFieldId {
  if (!field) {
    throw new Error('Universe conditions require a field.');
  }
  return field;
}

function normalizeDraftOperator(
  operator: UniverseDraftCondition['operator']
): UniverseConditionOperator {
  if (!operator) {
    throw new Error('Universe conditions require an operator.');
  }
  return operator;
}

function sanitizeValues(values: UniverseValue[] | undefined): UniverseValue[] {
  return (values ?? []).filter((value) => hasMaterialValue(value));
}

function hasMaterialValue(value: UniverseValue | undefined): value is UniverseValue {
  return value !== undefined && !(typeof value === 'string' && value.trim() === '');
}
