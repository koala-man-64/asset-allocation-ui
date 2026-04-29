import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { PageLoader } from '@/app/components/common/PageLoader';
import { StatePanel } from '@/app/components/common/StatePanel';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Textarea } from '@/app/components/ui/textarea';
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatTimestamp
} from '@/features/accounts/lib/accountPresentation';
import { ApiError } from '@/services/apiService';
import type {
  BrokerAccountAllocationUpdateRequest,
  BrokerAccountConfiguration,
  BrokerAccountConfigurationAuditRecord,
  BrokerAccountSummary,
  BrokerAllocationMode,
  BrokerPolicyAssetClass,
  BrokerPolicySide,
  BrokerPositionSizeMode,
  BrokerTradingPolicyUpdateRequest
} from '@/types/brokerAccounts';

type PolicyDraft = {
  maxOpenPositions: string;
  exposureMode: BrokerPositionSizeMode;
  exposureValue: string;
  allowedSides: BrokerPolicySide[];
  allowedAssetClasses: BrokerPolicyAssetClass[];
  requireOrderConfirmation: boolean;
};

type AllocationRowDraft = {
  rowId: string;
  sleeveId: string;
  sleeveName: string;
  strategyName: string;
  strategyVersion: string;
  value: string;
  enabled: boolean;
  notes: string;
};

type AllocationDraft = {
  allocationMode: BrokerAllocationMode;
  allocatableCapital: number | null;
  effectiveFrom: string;
  notes: string;
  items: AllocationRowDraft[];
};

const POLICY_SIDE_OPTIONS: readonly BrokerPolicySide[] = ['long', 'short'];
const POLICY_ASSET_OPTIONS: readonly BrokerPolicyAssetClass[] = ['equity', 'option'];
const STALE_CONFIGURATION_MESSAGE =
  'Configuration changed on the server. Reload or discard local edits before retrying.';

function createRowId(): string {
  return `allocation-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeSleeveId(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized || `sleeve-${Date.now()}`;
}

function toInputDate(value?: string | null): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toISOString().slice(0, 10);
}

function normalizeStringArray<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort() as T[];
}

function createPolicyDraft(configuration: BrokerAccountConfiguration): PolicyDraft {
  const policy = configuration.requestedPolicy ?? configuration.effectivePolicy;
  return {
    maxOpenPositions:
      policy.maxOpenPositions === null || policy.maxOpenPositions === undefined
        ? ''
        : String(policy.maxOpenPositions),
    exposureMode: policy.maxSinglePositionExposure?.mode ?? 'pct_of_allocatable_capital',
    exposureValue:
      policy.maxSinglePositionExposure?.value === null ||
      policy.maxSinglePositionExposure?.value === undefined
        ? ''
        : String(policy.maxSinglePositionExposure.value),
    allowedSides: normalizeStringArray(policy.allowedSides),
    allowedAssetClasses: normalizeStringArray(policy.allowedAssetClasses),
    requireOrderConfirmation: policy.requireOrderConfirmation
  };
}

function createAllocationDraft(configuration: BrokerAccountConfiguration): AllocationDraft {
  return {
    allocationMode: configuration.allocation.allocationMode,
    allocatableCapital: configuration.allocation.allocatableCapital ?? null,
    effectiveFrom: toInputDate(configuration.allocation.effectiveFrom),
    notes: '',
    items: configuration.allocation.items.map((item) => ({
      rowId: createRowId(),
      sleeveId: item.sleeveId,
      sleeveName: item.sleeveName,
      strategyName: item.strategy.strategyName,
      strategyVersion: String(item.strategy.strategyVersion),
      value:
        item.allocationMode === 'notional_base_ccy'
          ? String(item.targetNotionalBaseCcy ?? '')
          : String(item.targetWeightPct ?? ''),
      enabled: item.enabled,
      notes: item.notes
    }))
  };
}

function createEmptyAllocationRow(mode: BrokerAllocationMode): AllocationRowDraft {
  return {
    rowId: createRowId(),
    sleeveId: '',
    sleeveName: '',
    strategyName: '',
    strategyVersion: '1',
    value: '',
    enabled: true,
    notes: mode === 'percent' ? 'Added from account configuration.' : 'Dollar allocation added from account configuration.'
  };
}

function parseOptionalInteger(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function buildPolicyPayload(
  draft: PolicyDraft,
  expectedConfigurationVersion: number
): BrokerTradingPolicyUpdateRequest {
  const exposureValue = parseOptionalNumber(draft.exposureValue);
  return {
    expectedConfigurationVersion,
    requestedPolicy: {
      maxOpenPositions: parseOptionalInteger(draft.maxOpenPositions),
      maxSinglePositionExposure:
        exposureValue === null
          ? null
          : {
              mode: draft.exposureMode,
              value: exposureValue
            },
      allowedSides: normalizeStringArray(draft.allowedSides),
      allowedAssetClasses: normalizeStringArray(draft.allowedAssetClasses),
      requireOrderConfirmation: draft.requireOrderConfirmation
    }
  };
}

function buildAllocationPayload(
  draft: AllocationDraft,
  expectedConfigurationVersion: number
): BrokerAccountAllocationUpdateRequest {
  return {
    expectedConfigurationVersion,
    allocationMode: draft.allocationMode,
    effectiveFrom: draft.effectiveFrom ? new Date(`${draft.effectiveFrom}T00:00:00.000Z`).toISOString() : null,
    notes: draft.notes.trim(),
    items: draft.items.map((item) => ({
      sleeveId: item.sleeveId.trim() || sanitizeSleeveId(item.sleeveName || item.strategyName),
      sleeveName: item.sleeveName.trim() || item.strategyName.trim(),
      strategy: {
        strategyName: item.strategyName.trim(),
        strategyVersion: Number.parseInt(item.strategyVersion || '1', 10)
      },
      allocationMode: draft.allocationMode,
      targetWeightPct:
        draft.allocationMode === 'percent' ? parseOptionalNumber(item.value) : null,
      targetNotionalBaseCcy:
        draft.allocationMode === 'notional_base_ccy' ? parseOptionalNumber(item.value) : null,
      enabled: item.enabled,
      notes: item.notes.trim()
    }))
  };
}

function policyErrors(draft: PolicyDraft): string[] {
  const errors: string[] = [];
  const maxOpenPositions = parseOptionalInteger(draft.maxOpenPositions);
  const exposureValue = parseOptionalNumber(draft.exposureValue);

  if (!draft.allowedSides.length) {
    errors.push('Select at least one allowed side.');
  }
  if (!draft.allowedAssetClasses.length) {
    errors.push('Select at least one allowed asset class.');
  }
  if (draft.maxOpenPositions.trim() && (maxOpenPositions === null || maxOpenPositions < 1)) {
    errors.push('Max open positions must be a whole number greater than zero.');
  }
  if (draft.exposureValue.trim()) {
    if (exposureValue === null || exposureValue <= 0) {
      errors.push('Single-position exposure must be greater than zero.');
    } else if (draft.exposureMode === 'pct_of_allocatable_capital' && exposureValue > 100) {
      errors.push('Percent exposure cannot exceed 100%.');
    }
  }

  return errors;
}

function allocationErrors(draft: AllocationDraft): string[] {
  const errors: string[] = [];
  const enabledRows = draft.items.filter((item) => item.enabled);
  const seenStrategies = new Set<string>();
  let total = 0;

  if (!enabledRows.length) {
    errors.push('At least one active strategy allocation is required.');
  }

  for (const item of draft.items) {
    const strategyVersion = Number.parseInt(item.strategyVersion || '', 10);
    const allocationValue = parseOptionalNumber(item.value);
    if (!item.sleeveName.trim()) {
      errors.push('Each allocation row needs a sleeve name.');
    }
    if (!item.strategyName.trim()) {
      errors.push('Each allocation row needs a strategy name.');
    }
    if (Number.isNaN(strategyVersion) || strategyVersion < 1) {
      errors.push('Strategy versions must be whole numbers greater than zero.');
    }
    if (allocationValue === null || allocationValue < 0) {
      errors.push('Each allocation row needs a non-negative target value.');
    }
    if (item.enabled) {
      total += allocationValue ?? 0;
      const key = `${item.strategyName.trim().toLowerCase()}::${strategyVersion}`;
      if (seenStrategies.has(key)) {
        errors.push('Duplicate strategy allocations are not allowed in the same account.');
      }
      seenStrategies.add(key);
    }
  }

  if (draft.allocationMode === 'percent' && Math.abs(total - 100) > 0.01) {
    errors.push('Percent allocations must total 100.00 +/- 0.01.');
  }
  if (
    draft.allocationMode === 'notional_base_ccy' &&
    draft.allocatableCapital !== null &&
    total - draft.allocatableCapital > 0.01
  ) {
    errors.push('Dollar allocations cannot exceed the account allocatable capital budget.');
  }

  return [...new Set(errors)];
}

function explainSaveError(error: unknown): string {
  if (isStaleConfigurationError(error)) {
    return STALE_CONFIGURATION_MESSAGE;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isStaleConfigurationError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 409 || error.status === 412);
}

function auditBadgeVariant(record: BrokerAccountConfigurationAuditRecord): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (record.outcome === 'denied') {
    return 'destructive';
  }
  if (record.outcome === 'warning') {
    return 'secondary';
  }
  return 'default';
}

interface AccountConfigurationPanelProps {
  account: BrokerAccountSummary | null;
  configuration: BrokerAccountConfiguration | null;
  loading: boolean;
  error: string | null;
  savingPolicy: boolean;
  savingAllocation: boolean;
  onReload: () => void;
  onSavePolicy: (
    payload: BrokerTradingPolicyUpdateRequest
  ) => Promise<BrokerAccountConfiguration>;
  onSaveAllocation: (
    payload: BrokerAccountAllocationUpdateRequest
  ) => Promise<BrokerAccountConfiguration>;
  onDirtyChange?: (dirty: boolean) => void;
}

export function AccountConfigurationPanel({
  account,
  configuration,
  loading,
  error,
  savingPolicy,
  savingAllocation,
  onReload,
  onSavePolicy,
  onSaveAllocation,
  onDirtyChange
}: AccountConfigurationPanelProps) {
  const [policyDraft, setPolicyDraft] = useState<PolicyDraft | null>(null);
  const [basePolicyDraft, setBasePolicyDraft] = useState<PolicyDraft | null>(null);
  const [allocationDraft, setAllocationDraft] = useState<AllocationDraft | null>(null);
  const [baseAllocationDraft, setBaseAllocationDraft] = useState<AllocationDraft | null>(null);
  const [baseConfigurationVersion, setBaseConfigurationVersion] = useState<number | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [pendingRemoteVersion, setPendingRemoteVersion] = useState<number | null>(null);
  const [staleVersionBlocked, setStaleVersionBlocked] = useState(false);

  const policyDirty =
    policyDraft !== null &&
    basePolicyDraft !== null &&
    JSON.stringify(policyDraft) !== JSON.stringify(basePolicyDraft);
  const allocationDirty =
    allocationDraft !== null &&
    baseAllocationDraft !== null &&
    JSON.stringify(allocationDraft) !== JSON.stringify(baseAllocationDraft);
  const dirty = policyDirty || allocationDirty;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!configuration) {
      return;
    }

    const nextPolicyDraft = createPolicyDraft(configuration);
    const nextAllocationDraft = createAllocationDraft(configuration);
    if (!dirty || baseConfigurationVersion === null) {
      setPolicyDraft(nextPolicyDraft);
      setBasePolicyDraft(nextPolicyDraft);
      setAllocationDraft(nextAllocationDraft);
      setBaseAllocationDraft(nextAllocationDraft);
      setBaseConfigurationVersion(configuration.configurationVersion);
      setServerMessage(null);
      setPendingRemoteVersion(null);
      setStaleVersionBlocked(false);
      return;
    }

    if (configuration.configurationVersion !== baseConfigurationVersion) {
      setPendingRemoteVersion(configuration.configurationVersion);
      setStaleVersionBlocked(true);
      setServerMessage(STALE_CONFIGURATION_MESSAGE);
    }
  }, [baseConfigurationVersion, configuration, dirty]);

  const activeConfiguration = configuration;
  const writeTradingPolicyEnabled = activeConfiguration?.capabilities.canWriteTradingPolicy !== false;
  const writeAllocationEnabled = activeConfiguration?.capabilities.canWriteAllocation !== false;
  const readOnlyReason = activeConfiguration?.capabilities.readOnlyReason;
  const busy = savingPolicy || savingAllocation;
  const saveBlockedByStaleVersion = staleVersionBlocked || pendingRemoteVersion !== null;

  const policyValidationErrors = useMemo(
    () => (policyDraft ? policyErrors(policyDraft) : []),
    [policyDraft]
  );
  const allocationValidationErrors = useMemo(
    () => (allocationDraft ? allocationErrors(allocationDraft) : []),
    [allocationDraft]
  );

  const allocationTotals = useMemo(() => {
    if (!allocationDraft) {
      return { total: 0, remaining: null as number | null };
    }

    const total = allocationDraft.items
      .filter((item) => item.enabled)
      .reduce((sum, item) => sum + (parseOptionalNumber(item.value) ?? 0), 0);
    const remaining =
      allocationDraft.allocatableCapital === null
        ? null
        : Number((allocationDraft.allocatableCapital - total).toFixed(2));
    return { total: Number(total.toFixed(2)), remaining };
  }, [allocationDraft]);

  const discardChanges = () => {
    if (!configuration) {
      return;
    }
    const nextPolicyDraft = createPolicyDraft(configuration);
    const nextAllocationDraft = createAllocationDraft(configuration);
    setPolicyDraft(nextPolicyDraft);
    setBasePolicyDraft(nextPolicyDraft);
    setAllocationDraft(nextAllocationDraft);
    setBaseAllocationDraft(nextAllocationDraft);
    setBaseConfigurationVersion(configuration.configurationVersion);
    setServerMessage(null);
    setPendingRemoteVersion(null);
    setStaleVersionBlocked(false);
    if (saveBlockedByStaleVersion) {
      onReload();
    }
  };

  const syncPolicyFromConfiguration = (nextConfiguration: BrokerAccountConfiguration) => {
    const nextPolicyDraft = createPolicyDraft(nextConfiguration);
    setPolicyDraft(nextPolicyDraft);
    setBasePolicyDraft(nextPolicyDraft);
  };

  const syncAllocationFromConfiguration = (
    nextConfiguration: BrokerAccountConfiguration
  ) => {
    const nextAllocationDraft = createAllocationDraft(nextConfiguration);
    setAllocationDraft(nextAllocationDraft);
    setBaseAllocationDraft(nextAllocationDraft);
  };

  const handleSave = async () => {
    if (!policyDraft || !allocationDraft || baseConfigurationVersion === null) {
      return;
    }
    if (saveBlockedByStaleVersion) {
      setServerMessage(STALE_CONFIGURATION_MESSAGE);
      return;
    }
    if (policyValidationErrors.length || allocationValidationErrors.length) {
      setServerMessage('Resolve the inline validation errors before saving.');
      return;
    }

    setServerMessage(null);

    let workingVersion = baseConfigurationVersion;
    let savedPolicyConfiguration: BrokerAccountConfiguration | null = null;

    try {
      if (policyDirty) {
        savedPolicyConfiguration = await onSavePolicy(
          buildPolicyPayload(policyDraft, workingVersion)
        );
        workingVersion = savedPolicyConfiguration.configurationVersion;
        setBaseConfigurationVersion(workingVersion);
        syncPolicyFromConfiguration(savedPolicyConfiguration);
        if (!allocationDirty) {
          syncAllocationFromConfiguration(savedPolicyConfiguration);
          setPendingRemoteVersion(null);
          setStaleVersionBlocked(false);
          toast.success('Trading policy saved.');
          return;
        }
      }

      if (allocationDirty) {
        const savedAllocationConfiguration = await onSaveAllocation(
          buildAllocationPayload(allocationDraft, workingVersion)
        );
        setBaseConfigurationVersion(savedAllocationConfiguration.configurationVersion);
        syncAllocationFromConfiguration(savedAllocationConfiguration);
        if (!policyDirty || savedPolicyConfiguration) {
          syncPolicyFromConfiguration(savedAllocationConfiguration);
        }
        setPendingRemoteVersion(null);
        setStaleVersionBlocked(false);
        toast.success(policyDirty ? 'Configuration saved.' : 'Allocation saved.');
      }
    } catch (saveError) {
      if (savedPolicyConfiguration) {
        syncPolicyFromConfiguration(savedPolicyConfiguration);
        setBaseConfigurationVersion(savedPolicyConfiguration.configurationVersion);
      }
      if (isStaleConfigurationError(saveError)) {
        setStaleVersionBlocked(true);
      }
      setPendingRemoteVersion(savedPolicyConfiguration?.configurationVersion ?? pendingRemoteVersion);
      setServerMessage(explainSaveError(saveError));
      toast.error('Configuration save failed.');
    }
  };

  if (loading) {
    return <PageLoader text="Loading account configuration..." variant="panel" className="min-h-[28rem]" />;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <StatePanel tone="error" title="Configuration Unavailable" message={error} />
        <Button type="button" variant="outline" onClick={onReload}>
          Retry Configuration Load
        </Button>
      </div>
    );
  }

  if (!account || !policyDraft || !allocationDraft || !activeConfiguration) {
    return (
      <StatePanel
        tone="empty"
        title="Configuration not loaded"
        message="Open an account and load its configuration before editing trading policy or allocation."
      />
    );
  }

  const saveLabel = policyDirty && allocationDirty
    ? 'Save Configuration'
    : policyDirty
      ? 'Save Trading Policy'
      : allocationDirty
        ? 'Save Allocation'
        : 'No Changes';

  return (
    <div className="space-y-4">
      {readOnlyReason ? (
        <div className="rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-cream/65 p-4 text-sm text-muted-foreground">
          {readOnlyReason}
        </div>
      ) : null}

      {pendingRemoteVersion !== null ? (
        <div className="rounded-[1.4rem] border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
          The server has a newer configuration version ({pendingRemoteVersion}) than the draft you are editing. Discard local changes to reload the latest state.
        </div>
      ) : null}

      {serverMessage ? (
        <div className="rounded-[1.4rem] border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
          {serverMessage}
        </div>
      ) : null}

      {activeConfiguration.warnings.length ? (
        <div className="rounded-[1.4rem] border border-mcm-mustard/30 bg-mcm-mustard/10 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Policy Warnings
          </p>
          <div className="mt-3 space-y-2 text-sm text-foreground">
            {activeConfiguration.warnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[1.2rem] border border-mcm-walnut/15 bg-mcm-paper/80 p-3">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Configuration Version
          </div>
          <div className="mt-2 font-display text-2xl text-foreground">
            {formatNumber(activeConfiguration.configurationVersion)}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            Updated {formatTimestamp(activeConfiguration.updatedAt)}
          </div>
        </div>
        <div className="rounded-[1.2rem] border border-mcm-walnut/15 bg-mcm-paper/80 p-3">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Active Portfolio
          </div>
          <div className="mt-2 font-medium text-foreground">
            {activeConfiguration.allocation.portfolioName || account.activePortfolioName || 'No active portfolio'}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {activeConfiguration.allocation.sharedActivePortfolio
              ? 'Shared portfolio; backend clone-on-edit is active.'
              : 'Dedicated active portfolio.'}
          </div>
        </div>
        <div className="rounded-[1.2rem] border border-mcm-walnut/15 bg-mcm-paper/80 p-3">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Allocation Mode
          </div>
          <div className="mt-2 font-medium text-foreground">
            {allocationDraft.allocationMode === 'percent' ? 'Percent' : 'Dollar'}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {allocationDraft.allocationMode === 'percent'
              ? `${formatPercent(activeConfiguration.allocation.allocatedPercent)} allocated`
              : `${formatCurrency(activeConfiguration.allocation.allocatedNotionalBaseCcy, account.baseCurrency)} allocated`}
          </div>
        </div>
        <div className="rounded-[1.2rem] border border-mcm-walnut/15 bg-mcm-paper/80 p-3">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Last Operator
          </div>
          <div className="mt-2 font-medium text-foreground">
            {activeConfiguration.updatedBy || 'Unknown'}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            Confirmation {activeConfiguration.effectivePolicy.requireOrderConfirmation ? 'required' : 'not required'}
          </div>
        </div>
      </div>

      <section className="space-y-4 rounded-[1.6rem] border border-mcm-walnut/20 bg-mcm-paper/85 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Trading Policy
            </p>
            <h3 className="mt-1 font-display text-xl text-foreground">Execution Guardrails</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Account hard limits override downstream strategy soft limits in the control plane.
            </p>
          </div>
          <div className="flex max-w-full flex-wrap gap-2" aria-label="Effective trading policy">
            <Badge variant="secondary">Effective</Badge>
            <Badge variant="outline">
              {activeConfiguration.effectivePolicy.maxOpenPositions === null ||
              activeConfiguration.effectivePolicy.maxOpenPositions === undefined
                ? 'No position cap'
                : `Max ${formatNumber(activeConfiguration.effectivePolicy.maxOpenPositions)} positions`}
            </Badge>
            <Badge variant="outline">
              {activeConfiguration.effectivePolicy.maxSinglePositionExposure
                ? activeConfiguration.effectivePolicy.maxSinglePositionExposure.mode ===
                  'pct_of_allocatable_capital'
                  ? `${formatPercent(activeConfiguration.effectivePolicy.maxSinglePositionExposure.value)} max exposure`
                  : `${formatCurrency(
                      activeConfiguration.effectivePolicy.maxSinglePositionExposure.value,
                      account.baseCurrency
                    )} max exposure`
                : 'No exposure cap'}
            </Badge>
            {activeConfiguration.effectivePolicy.allowedSides.map((side) => (
              <Badge key={side} variant="outline">
                Side: {side}
              </Badge>
            ))}
            {activeConfiguration.effectivePolicy.allowedAssetClasses.map((assetClass) => (
              <Badge key={assetClass} variant="outline">
                Instrument: {assetClass}
              </Badge>
            ))}
            <Badge variant="outline">
              {activeConfiguration.effectivePolicy.requireOrderConfirmation
                ? 'Confirmation required'
                : 'Confirmation not required'}
            </Badge>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="max-open-positions">Max open positions</label>
            <Input
              id="max-open-positions"
              type="number"
              min="1"
              value={policyDraft.maxOpenPositions}
              disabled={!writeTradingPolicyEnabled || busy}
              onChange={(event) =>
                setPolicyDraft((current) =>
                  current ? { ...current, maxOpenPositions: event.target.value } : current
                )
              }
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="position-exposure">Max single-position exposure</label>
            <Input
              id="position-exposure"
              type="number"
              min="0"
              step={policyDraft.exposureMode === 'pct_of_allocatable_capital' ? '0.01' : '1'}
              value={policyDraft.exposureValue}
              disabled={!writeTradingPolicyEnabled || busy}
              onChange={(event) =>
                setPolicyDraft((current) =>
                  current ? { ...current, exposureValue: event.target.value } : current
                )
              }
            />
            <div className="flex flex-wrap gap-2">
              {([
                ['pct_of_allocatable_capital', 'Percent of allocatable capital'],
                ['notional_base_ccy', 'Base-currency notional']
              ] as const).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={policyDraft.exposureMode === value ? 'default' : 'outline'}
                  aria-pressed={policyDraft.exposureMode === value}
                  disabled={!writeTradingPolicyEnabled || busy}
                  onClick={() =>
                    setPolicyDraft((current) =>
                      current ? { ...current, exposureMode: value } : current
                    )
                  }
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label>Allowed sides</label>
            <div className="flex flex-wrap gap-2">
              {POLICY_SIDE_OPTIONS.map((side) => {
                const selected = policyDraft.allowedSides.includes(side);
                return (
                  <Button
                    key={side}
                    type="button"
                    size="sm"
                    variant={selected ? 'default' : 'outline'}
                    aria-pressed={selected}
                    disabled={!writeTradingPolicyEnabled || busy}
                    onClick={() =>
                      setPolicyDraft((current) => {
                        if (!current) {
                          return current;
                        }
                        const nextSides = selected
                          ? current.allowedSides.filter((value) => value !== side)
                          : normalizeStringArray([...current.allowedSides, side]);
                        return { ...current, allowedSides: nextSides };
                      })
                    }
                  >
                    {side}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label>Allowed instruments</label>
            <div className="flex flex-wrap gap-2">
              {POLICY_ASSET_OPTIONS.map((assetClass) => {
                const selected = policyDraft.allowedAssetClasses.includes(assetClass);
                return (
                  <Button
                    key={assetClass}
                    type="button"
                    size="sm"
                    variant={selected ? 'default' : 'outline'}
                    aria-pressed={selected}
                    disabled={!writeTradingPolicyEnabled || busy}
                    onClick={() =>
                      setPolicyDraft((current) => {
                        if (!current) {
                          return current;
                        }
                        const nextAssetClasses = selected
                          ? current.allowedAssetClasses.filter((value) => value !== assetClass)
                          : normalizeStringArray([...current.allowedAssetClasses, assetClass]);
                        return { ...current, allowedAssetClasses: nextAssetClasses };
                      })
                    }
                  >
                    {assetClass}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-[1.2rem] border border-mcm-walnut/15 bg-mcm-cream/55 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium text-foreground">Order confirmation</div>
              <div className="text-sm text-muted-foreground">
                Applies to live manual submits and rebalance basket release.
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant={policyDraft.requireOrderConfirmation ? 'default' : 'outline'}
              aria-pressed={policyDraft.requireOrderConfirmation}
              disabled={!writeTradingPolicyEnabled || busy}
              onClick={() =>
                setPolicyDraft((current) =>
                  current
                    ? {
                        ...current,
                        requireOrderConfirmation: !current.requireOrderConfirmation
                      }
                    : current
                )
              }
            >
              {policyDraft.requireOrderConfirmation ? 'Enabled' : 'Disabled'}
            </Button>
          </div>
        </div>

        {policyValidationErrors.length ? (
          <div className="space-y-2 rounded-[1.2rem] border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground">
            {policyValidationErrors.map((validationError) => (
              <div key={validationError}>{validationError}</div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-4 rounded-[1.6rem] border border-mcm-walnut/20 bg-mcm-paper/85 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Allocation
            </p>
            <h3 className="mt-1 font-display text-xl text-foreground">Strategy Capital Tie-Out</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This editor updates the account&apos;s active portfolio allocation. Use the portfolio workspace for advanced construction and version management.
            </p>
          </div>
          <Button asChild type="button" variant="outline" size="sm">
            <Link to="/portfolios">Open Portfolio Workspace</Link>
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {([
            ['percent', 'Percent'],
            ['notional_base_ccy', 'Dollar']
          ] as const).map(([mode, label]) => (
            <Button
              key={mode}
              type="button"
              size="sm"
              variant={allocationDraft.allocationMode === mode ? 'default' : 'outline'}
              disabled={!writeAllocationEnabled || busy}
              onClick={() =>
                setAllocationDraft((current) =>
                  current
                    ? {
                        ...current,
                        allocationMode: mode,
                        items: current.items.map((item) => ({
                          ...item,
                          value:
                            mode === current.allocationMode
                              ? item.value
                              : ''
                        }))
                      }
                    : current
                )
              }
            >
              {label}
            </Button>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-[1.2rem] border border-mcm-walnut/15 bg-mcm-paper/80 p-3">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Total Allocated
            </div>
            <div className="mt-2 font-display text-2xl text-foreground">
              {allocationDraft.allocationMode === 'percent'
                ? formatPercent(allocationTotals.total)
                : formatCurrency(allocationTotals.total, account.baseCurrency)}
            </div>
          </div>
          <div className="rounded-[1.2rem] border border-mcm-walnut/15 bg-mcm-paper/80 p-3">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Allocatable Capital
            </div>
            <div className="mt-2 font-display text-2xl text-foreground">
              {formatCurrency(allocationDraft.allocatableCapital, account.baseCurrency)}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Backend-computed capital budget basis.
            </div>
          </div>
          <div className="rounded-[1.2rem] border border-mcm-walnut/15 bg-mcm-paper/80 p-3">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Remaining
            </div>
            <div className="mt-2 font-display text-2xl text-foreground">
              {allocationDraft.allocationMode === 'percent'
                ? formatPercent(Math.max(0, 100 - allocationTotals.total))
                : formatCurrency(allocationTotals.remaining, account.baseCurrency)}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {allocationDraft.items.map((item, index) => (
            <div
              key={item.rowId}
              className="rounded-[1.3rem] border border-mcm-walnut/15 bg-mcm-cream/55 p-4"
            >
              <div className="grid gap-3 lg:grid-cols-[1.2fr_1.2fr_0.55fr_0.7fr_auto]">
                <div className="space-y-2">
                  <label htmlFor={`allocation-sleeve-${item.rowId}`}>Sleeve name</label>
                  <Input
                    id={`allocation-sleeve-${item.rowId}`}
                    value={item.sleeveName}
                    disabled={!writeAllocationEnabled || busy}
                    onChange={(event) =>
                      setAllocationDraft((current) =>
                        current
                          ? {
                              ...current,
                              items: current.items.map((entry) =>
                                entry.rowId === item.rowId
                                  ? { ...entry, sleeveName: event.target.value }
                                  : entry
                              )
                            }
                          : current
                      )
                    }
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor={`allocation-strategy-${item.rowId}`}>Strategy</label>
                  <Input
                    id={`allocation-strategy-${item.rowId}`}
                    value={item.strategyName}
                    disabled={!writeAllocationEnabled || busy}
                    onChange={(event) =>
                      setAllocationDraft((current) =>
                        current
                          ? {
                              ...current,
                              items: current.items.map((entry) =>
                                entry.rowId === item.rowId
                                  ? { ...entry, strategyName: event.target.value }
                                  : entry
                              )
                            }
                          : current
                      )
                    }
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor={`allocation-version-${item.rowId}`}>Version</label>
                  <Input
                    id={`allocation-version-${item.rowId}`}
                    type="number"
                    min="1"
                    value={item.strategyVersion}
                    disabled={!writeAllocationEnabled || busy}
                    onChange={(event) =>
                      setAllocationDraft((current) =>
                        current
                          ? {
                              ...current,
                              items: current.items.map((entry) =>
                                entry.rowId === item.rowId
                                  ? { ...entry, strategyVersion: event.target.value }
                                  : entry
                              )
                            }
                          : current
                      )
                    }
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor={`allocation-target-${item.rowId}`}>
                    {allocationDraft.allocationMode === 'percent' ? 'Target %' : 'Target $'}
                  </label>
                  <Input
                    id={`allocation-target-${item.rowId}`}
                    type="number"
                    min="0"
                    step={allocationDraft.allocationMode === 'percent' ? '0.01' : '1'}
                    value={item.value}
                    disabled={!writeAllocationEnabled || busy}
                    onChange={(event) =>
                      setAllocationDraft((current) =>
                        current
                          ? {
                              ...current,
                              items: current.items.map((entry) =>
                                entry.rowId === item.rowId
                                  ? { ...entry, value: event.target.value }
                                  : entry
                              )
                            }
                          : current
                      )
                    }
                  />
                </div>

                <div className="flex items-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={item.enabled ? 'default' : 'outline'}
                    disabled={!writeAllocationEnabled || busy}
                    onClick={() =>
                      setAllocationDraft((current) =>
                        current
                          ? {
                              ...current,
                              items: current.items.map((entry) =>
                                entry.rowId === item.rowId
                                  ? { ...entry, enabled: !entry.enabled }
                                  : entry
                              )
                            }
                          : current
                      )
                    }
                  >
                    {item.enabled ? 'Active' : 'Paused'}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={!writeAllocationEnabled || busy || allocationDraft.items.length <= 1}
                    onClick={() =>
                      setAllocationDraft((current) =>
                        current
                          ? {
                              ...current,
                              items: current.items.filter((entry) => entry.rowId !== item.rowId)
                            }
                          : current
                      )
                    }
                    aria-label={`Remove allocation row ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-2">
                  <label htmlFor={`allocation-sleeve-id-${item.rowId}`}>Sleeve ID override</label>
                  <Input
                    id={`allocation-sleeve-id-${item.rowId}`}
                    value={item.sleeveId}
                    placeholder="Optional explicit sleeve id"
                    disabled={!writeAllocationEnabled || busy}
                    onChange={(event) =>
                      setAllocationDraft((current) =>
                        current
                          ? {
                              ...current,
                              items: current.items.map((entry) =>
                                entry.rowId === item.rowId
                                  ? { ...entry, sleeveId: event.target.value }
                                  : entry
                              )
                            }
                          : current
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor={`allocation-note-${item.rowId}`}>Row notes</label>
                  <Input
                    id={`allocation-note-${item.rowId}`}
                    value={item.notes}
                    disabled={!writeAllocationEnabled || busy}
                    onChange={(event) =>
                      setAllocationDraft((current) =>
                        current
                          ? {
                              ...current,
                              items: current.items.map((entry) =>
                                entry.rowId === item.rowId
                                  ? { ...entry, notes: event.target.value }
                                  : entry
                              )
                            }
                          : current
                      )
                    }
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={!writeAllocationEnabled || busy}
            onClick={() =>
              setAllocationDraft((current) =>
                current
                  ? {
                      ...current,
                      items: [...current.items, createEmptyAllocationRow(current.allocationMode)]
                    }
                  : current
              )
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Strategy
          </Button>

          <div className="flex-1 space-y-2">
            <label htmlFor="allocation-effective-from">Effective from</label>
            <Input
              id="allocation-effective-from"
              type="date"
              value={allocationDraft.effectiveFrom}
              disabled={!writeAllocationEnabled || busy}
              onChange={(event) =>
                setAllocationDraft((current) =>
                  current ? { ...current, effectiveFrom: event.target.value } : current
                )
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="allocation-notes">Allocation notes</label>
          <Textarea
            id="allocation-notes"
            value={allocationDraft.notes}
            disabled={!writeAllocationEnabled || busy}
            onChange={(event) =>
              setAllocationDraft((current) =>
                current ? { ...current, notes: event.target.value } : current
              )
            }
          />
        </div>

        {allocationValidationErrors.length ? (
          <div className="space-y-2 rounded-[1.2rem] border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground">
            {allocationValidationErrors.map((validationError) => (
              <div key={validationError}>{validationError}</div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-[1.6rem] border border-mcm-walnut/20 bg-mcm-paper/85 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Audit Activity
            </p>
            <h3 className="mt-1 font-display text-xl text-foreground">Configuration History</h3>
          </div>
          <Badge variant="outline">{activeConfiguration.audit.length} entries</Badge>
        </div>

        {activeConfiguration.audit.length ? (
          activeConfiguration.audit.map((record) => (
            <div
              key={record.auditId}
              className="rounded-[1.2rem] border border-mcm-walnut/15 bg-mcm-cream/55 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-foreground">{record.summary}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {record.actor || 'system'} · {formatTimestamp(record.requestedAt)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={auditBadgeVariant(record)}>{record.outcome}</Badge>
                  <Badge variant="outline">{record.category}</Badge>
                </div>
              </div>
              {record.denialReason ? (
                <div className="mt-2 text-sm text-muted-foreground">{record.denialReason}</div>
              ) : null}
            </div>
          ))
        ) : (
          <StatePanel
            tone="empty"
            title="No configuration audit yet"
            message="Policy and allocation changes will appear here after the first save."
          />
        )}
      </section>

      <div className="sticky bottom-0 z-10 -mx-5 border-t border-border/40 bg-mcm-paper/95 px-5 py-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {dirty
              ? 'Draft changes are local until saved.'
              : `Configuration is current as of ${formatTimestamp(activeConfiguration.updatedAt)}.`}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" disabled={!dirty || busy} onClick={discardChanges}>
              Discard Changes
            </Button>
            <Button
              type="button"
              disabled={
                !dirty ||
                busy ||
                saveBlockedByStaleVersion ||
                (policyDirty && !writeTradingPolicyEnabled) ||
                (allocationDirty && !writeAllocationEnabled)
              }
              onClick={() => void handleSave()}
            >
              {busy ? 'Saving...' : saveLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
