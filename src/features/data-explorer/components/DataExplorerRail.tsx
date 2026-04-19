import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Label } from '@/app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/app/components/ui/select';
import {
  CONTAINER_OPTIONS,
  DELTA_PREVIEW_FILE_OPTIONS,
  countExplorerEntries,
  type DomainKey,
  type LayerKey,
  type TreeMeta
} from '@/features/data-explorer/lib/dataExplorer';
import type { AdlsHierarchyEntry, AdlsFilePreviewResponse } from '@/services/apiService';
import { Database, RefreshCw } from 'lucide-react';

interface DataExplorerRailProps {
  layer: LayerKey;
  domain: DomainKey;
  domainOptions: Array<{ value: DomainKey; label: string }>;
  maxDeltaFiles: string;
  rootPath: string;
  rootEntries: AdlsHierarchyEntry[];
  rootMeta?: TreeMeta;
  selectedFilePath: string | null;
  preview: AdlsFilePreviewResponse | null;
  refreshing: boolean;
  onLayerChange: (value: LayerKey) => void;
  onDomainChange: (value: DomainKey) => void;
  onMaxDeltaFilesChange: (value: string) => void;
  onRefresh: () => void;
}

function RailMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-cream/65 p-4">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 font-display text-2xl text-foreground">{value}</div>
      <div className="mt-2 text-sm text-muted-foreground">{detail}</div>
    </div>
  );
}

export function DataExplorerRail({
  layer,
  domain,
  domainOptions,
  maxDeltaFiles,
  rootPath,
  rootEntries,
  rootMeta,
  selectedFilePath,
  preview,
  refreshing,
  onLayerChange,
  onDomainChange,
  onMaxDeltaFilesChange,
  onRefresh
}: DataExplorerRailProps) {
  const entrySummary = countExplorerEntries(rootEntries);
  const previewModeLabel =
    preview?.previewMode === 'delta-table'
      ? 'Delta Table'
      : preview?.previewMode === 'parquet-table'
        ? 'Parquet Table'
        : preview?.previewMode === 'delta-log'
          ? 'Delta Log'
          : preview?.previewMode === 'blob'
            ? 'Text Blob'
            : 'Awaiting file';
  const selectedAsset = selectedFilePath?.split('/').pop() || 'No file selected';

  return (
    <aside className="desk-pane">
      <div className="border-b border-border/40 px-5 py-5">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
          Explorer Rail
        </p>
        <h2 className="mt-1 font-display text-xl text-foreground">Scope And Refresh</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Keep storage scope, delta depth, and metadata refresh controls on the rail instead of in
          the browsing surface.
        </p>
      </div>

      <div className="desk-pane-scroll space-y-5 p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
          <RailMetric
            label="Folders"
            value={String(entrySummary.folders).padStart(2, '0')}
            detail="Immediate folders in the current root listing."
          />
          <RailMetric
            label="Files"
            value={String(entrySummary.files).padStart(2, '0')}
            detail="Immediate files available for preview from the root listing."
          />
        </div>

        <section className="space-y-4 rounded-[1.8rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Scope
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Set the container, business domain, and delta file depth before browsing.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="data-explorer-container">Container</Label>
            <Select value={layer} onValueChange={(value) => onLayerChange(value as LayerKey)}>
              <SelectTrigger id="data-explorer-container" className="font-mono uppercase">
                <SelectValue placeholder="Select container" />
              </SelectTrigger>
              <SelectContent>
                {CONTAINER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="data-explorer-domain">Domain</Label>
            <Select value={domain} onValueChange={(value) => onDomainChange(value as DomainKey)}>
              <SelectTrigger id="data-explorer-domain" className="font-mono uppercase">
                <SelectValue placeholder="Select domain" />
              </SelectTrigger>
              <SelectContent>
                {domainOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="data-explorer-delta-files">Delta Files</Label>
            <Select value={maxDeltaFiles} onValueChange={onMaxDeltaFilesChange}>
              <SelectTrigger id="data-explorer-delta-files" className="font-mono">
                <SelectValue placeholder="0" />
              </SelectTrigger>
              <SelectContent>
                {DELTA_PREVIEW_FILE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={onRefresh}
            disabled={refreshing}
            className="w-full justify-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh Metadata'}
          </Button>
        </section>

        <section className="space-y-4 rounded-[1.8rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Root Scope
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Current container and domain resolve into a normalized root path.
              </p>
            </div>
            <Badge variant="outline" className="font-mono uppercase">
              {rootMeta?.container || layer}
            </Badge>
          </div>

          <div className="rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4 font-mono text-sm text-muted-foreground">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Root Path
            </div>
            <div className="mt-2 break-all text-foreground">{rootPath || '/'}</div>
            <div className="mt-3 text-xs">
              scan-limit={(rootMeta?.scanLimit || 0).toLocaleString()}
              {rootMeta?.truncated ? ' | listing truncated' : ' | full listing'}
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-[1.8rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-4">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            <Database className="h-3.5 w-3.5" />
            Operations Brief
          </div>

          <div className="grid gap-3">
            <div className="rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Preview Mode
              </div>
              <div className="mt-2 text-lg font-semibold text-foreground">{previewModeLabel}</div>
              <div className="mt-2 text-sm text-muted-foreground">
                Preview type for the currently selected asset.
              </div>
            </div>

            <div className="rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Selected Asset
              </div>
              <div className="mt-2 break-all text-sm font-semibold text-foreground">
                {selectedAsset}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                Single-click preview remains the active navigation model.
              </div>
            </div>
          </div>
        </section>
      </div>
    </aside>
  );
}
