import { useEffect, useMemo, useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { useJobStatuses } from '@/hooks/useJobStatuses';

const DEBUG_STORAGE_KEY = 'aa.debug.jobs';

function hasDebugQueryFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('debug') === 'jobs';
  } catch {
    return false;
  }
}

function hasDebugStorageFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function isDebugEnabled(): boolean {
  return hasDebugQueryFlag() || hasDebugStorageFlag();
}

function JobStatusDebugPanel() {
  const jobStatuses = useJobStatuses({ autoRefresh: false });
  const rows = jobStatuses.list;
  const payload = useMemo(
    () =>
      rows.map((entry) => ({
        jobKey: entry.jobKey,
        jobName: entry.jobName,
        effectiveStatus: entry.status,
        source: entry.source,
        runStatus: entry.latestRun?.status ?? null,
        runningState: entry.runningState,
        startTime: entry.startTime,
        executionId: entry.latestRun?.executionId ?? entry.override?.executionId ?? null,
        executionName: entry.latestRun?.executionName ?? entry.override?.executionName ?? null,
        expiresAt: entry.override?.expiresAt ?? null
      })),
    [rows]
  );

  const copyJson = async () => {
    const text = JSON.stringify(payload, null, 2);
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
  };

  return (
    <aside className="fixed bottom-4 right-4 z-50 max-h-[70vh] w-[min(960px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-background shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <div>
          <div className="font-mono text-xs font-semibold uppercase tracking-[0.18em]">
            Job Status Debug
          </div>
          <div className="text-xs text-muted-foreground">{rows.length} rows</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => void copyJson()}>
            <Copy className="h-3.5 w-3.5" />
            Copy JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => void jobStatuses.refresh()}
            disabled={jobStatuses.isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${jobStatuses.isFetching ? 'animate-spin' : ''}`} />
            Force refresh
          </Button>
        </div>
      </div>
      <div className="max-h-[calc(70vh-3.5rem)] overflow-auto">
        <table className="w-full border-collapse text-left font-mono text-[11px]">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th className="whitespace-nowrap px-3 py-2">jobKey</th>
              <th className="whitespace-nowrap px-3 py-2">effectiveStatus</th>
              <th className="whitespace-nowrap px-3 py-2">source</th>
              <th className="whitespace-nowrap px-3 py-2">runStatus</th>
              <th className="whitespace-nowrap px-3 py-2">runningState</th>
              <th className="whitespace-nowrap px-3 py-2">startTime</th>
              <th className="whitespace-nowrap px-3 py-2">executionId</th>
              <th className="whitespace-nowrap px-3 py-2">expiresAt</th>
            </tr>
          </thead>
          <tbody>
            {payload.map((entry) => (
              <tr key={entry.jobKey} className="border-t border-border/60">
                <td className="whitespace-nowrap px-3 py-2">{entry.jobKey}</td>
                <td className="whitespace-nowrap px-3 py-2">{entry.effectiveStatus}</td>
                <td className="whitespace-nowrap px-3 py-2">{entry.source}</td>
                <td className="whitespace-nowrap px-3 py-2">{entry.runStatus ?? '-'}</td>
                <td className="whitespace-nowrap px-3 py-2">{entry.runningState ?? '-'}</td>
                <td className="whitespace-nowrap px-3 py-2">{entry.startTime ?? '-'}</td>
                <td className="whitespace-nowrap px-3 py-2">{entry.executionId ?? '-'}</td>
                <td className="whitespace-nowrap px-3 py-2">{entry.expiresAt ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </aside>
  );
}

function JobStatusDebugOverlayInner() {
  const [enabled, setEnabled] = useState(isDebugEnabled);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.shiftKey || event.key.toLowerCase() !== 'j') {
        return;
      }
      event.preventDefault();
      setEnabled((current) => {
        const next = !current;
        try {
          if (next) {
            window.localStorage.setItem(DEBUG_STORAGE_KEY, '1');
          } else {
            window.localStorage.removeItem(DEBUG_STORAGE_KEY);
          }
        } catch {
          // Ignore storage failures; the in-memory toggle still works for this session.
        }
        return next;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!enabled) {
    return null;
  }

  return <JobStatusDebugPanel />;
}

export function JobStatusDebugOverlay({ devOverride }: { devOverride?: boolean } = {}) {
  const isDev = devOverride ?? import.meta.env.DEV;
  if (!isDev) {
    return null;
  }
  return <JobStatusDebugOverlayInner />;
}
