import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bug, RefreshCw, Save, ShieldAlert, Trash2 } from 'lucide-react';

import { PageHero } from '@/app/components/common/PageHero';
import { PageLoader } from '@/app/components/common/PageLoader';
import { StatePanel } from '@/app/components/common/StatePanel';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Textarea } from '@/app/components/ui/textarea';
import { formatTimeAgo } from '@/features/system-status/lib/SystemStatusHelpers';
import { queryKeys, useDebugSymbolsQuery } from '@/hooks/useDataQueries';
import { DataService } from '@/services/DataService';
import { formatSystemStatusText } from '@/utils/formatSystemStatusText';

const MAX_PREVIEW = 20;

function normalizeSymbols(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item).trim())
          .filter(Boolean)
          .map((item) => item.toUpperCase());
      }
    } catch {
      // Fall back to CSV parsing.
    }
  }

  return trimmed
    .replace(/[\n;]+/g, ',')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.toUpperCase());
}

export function DebugSymbolsPage() {
  const debugSymbolsQuery = useDebugSymbolsQuery();
  const queryClient = useQueryClient();

  const [symbolsInput, setSymbolsInput] = useState('');
  const [hasLocalChanges, setHasLocalChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!debugSymbolsQuery.data || hasLocalChanges) return;
    setSymbolsInput(String(debugSymbolsQuery.data.symbols || '').trim());
  }, [debugSymbolsQuery.data, hasLocalChanges]);

  const normalizedSymbols = useMemo(() => normalizeSymbols(symbolsInput), [symbolsInput]);
  const isInvalid = normalizedSymbols.length === 0;

  const currentSymbols = String(debugSymbolsQuery.data?.symbols || '').trim();
  const isConfigured = currentSymbols.length > 0;
  const isDirty = symbolsInput.trim() !== currentSymbols;
  const updatedAgo = formatTimeAgo(debugSymbolsQuery.data?.updatedAt || null);

  const hero = (
    <PageHero
      kicker="Live Operations"
      title={
        <span className="flex items-center gap-2">
          <Bug className="h-5 w-5 text-mcm-teal" />
          Debug Symbols
        </span>
      }
      subtitle="Control the symbol allowlist stored in Postgres runtime config and applied at ETL startup."
      metrics={[
        {
          label: 'Presence',
          value: isConfigured ? 'Configured' : 'Not Set',
          detail: isConfigured
            ? 'Stored symbols are active on job startup.'
            : 'No allowlist is currently stored.'
        },
        {
          label: 'Normalized Count',
          value: String(normalizedSymbols.length),
          detail: 'Symbols parsed from the current editor contents.'
        },
        {
          label: 'Updated',
          value: updatedAgo,
          detail: 'Age of the last persisted update.'
        }
      ]}
    />
  );

  const handleReset = () => {
    setHasLocalChanges(false);
    setSymbolsInput(currentSymbols);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await DataService.setDebugSymbols({
        symbols: symbolsInput
      });
      toast.success('Debug symbols updated.');
      setHasLocalChanges(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.debugSymbols() });
    } catch (error) {
      const message = formatSystemStatusText(error);
      toast.error(`Failed to update debug symbols: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await DataService.deleteDebugSymbols();
      toast.success('Debug symbols removed.');
      setHasLocalChanges(false);
      setSymbolsInput('');
      void queryClient.invalidateQueries({ queryKey: queryKeys.debugSymbols() });
    } catch (error) {
      const message = formatSystemStatusText(error);
      toast.error(`Failed to remove debug symbols: ${message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  if (debugSymbolsQuery.isLoading) {
    return (
      <div className="page-shell">
        {hero}
        <PageLoader text="Loading Debug Configuration..." variant="panel" />
      </div>
    );
  }

  if (debugSymbolsQuery.error) {
    return (
      <div className="page-shell">
        {hero}
        <StatePanel
          tone="error"
          title={
            <span className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />
              Debug Symbols Unavailable
            </span>
          }
          message={formatSystemStatusText(debugSymbolsQuery.error)}
          className="mcm-panel border-destructive/30 bg-destructive/10"
        />
      </div>
    );
  }

  return (
    <div className="page-shell">
      {hero}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="mcm-panel">
          <CardHeader className="space-y-2">
            <CardTitle className="flex items-center justify-between">
              <span>Configuration</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() =>
                    void queryClient.invalidateQueries({ queryKey: queryKeys.debugSymbols() })
                  }
                  disabled={debugSymbolsQuery.isFetching}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${debugSymbolsQuery.isFetching ? 'animate-spin' : ''}`}
                  />
                  Refresh
                </Button>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Updated</span>
                  <Badge
                    variant="outline"
                    className="font-mono text-[10px] uppercase tracking-widest"
                  >
                    {updatedAgo}
                  </Badge>
                </div>
              </div>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Symbols can be comma-separated or provided as a JSON array.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
              <div className="text-xs uppercase text-muted-foreground">Presence</div>
              <div className="text-sm">
                {isConfigured
                  ? 'Stored symbols are active on job startup.'
                  : 'No debug-symbol allowlist is currently stored.'}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase text-muted-foreground">Symbols</label>
              <Textarea
                value={symbolsInput}
                onChange={(event) => {
                  setSymbolsInput(event.target.value);
                  setHasLocalChanges(true);
                }}
                placeholder="AAPL, MSFT, NVDA"
                className="min-h-[160px] font-mono text-sm"
              />
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={handleSave}
                disabled={isSaving || !isDirty || isInvalid}
                className="gap-2"
              >
                {isSaving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save changes
              </Button>
              <Button variant="outline" onClick={handleReset} disabled={isSaving || !isDirty}>
                Reset
              </Button>
              <Button
                variant="outline"
                onClick={handleDelete}
                disabled={isDeleting || !isConfigured}
                className="gap-2"
              >
                {isDeleting ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Remove
              </Button>
            </div>
            {isInvalid && (
              <p className="text-xs text-destructive">
                Add at least one symbol before saving debug filtering.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="mcm-panel">
          <CardHeader>
            <CardTitle>Normalized Preview</CardTitle>
            <p className="text-xs text-muted-foreground">
              {normalizedSymbols.length
                ? `${normalizedSymbols.length} symbols detected`
                : 'No symbols configured'}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {normalizedSymbols.slice(0, MAX_PREVIEW).map((symbol) => (
                <Badge key={symbol} variant="secondary" className="font-mono text-[11px]">
                  {symbol}
                </Badge>
              ))}
              {normalizedSymbols.length > MAX_PREVIEW && (
                <Badge variant="outline" className="font-mono text-[11px]">
                  +{normalizedSymbols.length - MAX_PREVIEW}
                </Badge>
              )}
            </div>
            <StatePanel
              tone={normalizedSymbols.length ? 'info' : 'empty'}
              title={normalizedSymbols.length ? 'Startup Behavior' : 'No Symbols Configured'}
              message={
                normalizedSymbols.length
                  ? 'Jobs pull this list from Postgres runtime config on startup. Removing the row makes debug filtering disappear entirely.'
                  : 'Persist at least one symbol to activate startup-time debug filtering.'
              }
              className="rounded-xl p-4"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
