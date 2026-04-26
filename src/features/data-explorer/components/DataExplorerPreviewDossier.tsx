import { Badge } from '@/app/components/ui/badge';
import {
  formatPreviewTableCell,
  formatTwoDigitCount
} from '@/features/data-explorer/lib/dataExplorer';
import type { AdlsFilePreviewResponse } from '@/services/apiService';
import { formatPreviewContent } from '@/utils/formatPreviewContent';
import { FileText } from 'lucide-react';

interface DataExplorerPreviewDossierProps {
  selectedFilePath: string | null;
  preview: AdlsFilePreviewResponse | null;
  previewLoading: boolean;
  previewError: string | null;
  maxDeltaFiles: string;
}

export function DataExplorerPreviewDossier({
  selectedFilePath,
  preview,
  previewLoading,
  previewError,
  maxDeltaFiles
}: DataExplorerPreviewDossierProps) {
  const selectedFileLabel = selectedFilePath?.split('/').pop() || null;
  const formattedPreviewContent = formatPreviewContent(preview?.contentPreview, {
    path: selectedFilePath,
    contentType: preview?.contentType
  });
  const isTablePreview =
    preview?.previewMode === 'delta-table' || preview?.previewMode === 'parquet-table';
  const previewTableColumns = preview?.tableColumns ?? [];
  const previewTableRows = preview?.tableRows ?? [];
  const previewRowCount = preview?.tableRowCount ?? previewTableRows.length;
  const previewRowLimit = preview?.tablePreviewLimit ?? previewTableRows.length;
  const displayedPreviewRows = Math.min(previewRowCount, previewRowLimit);

  return (
    <section className="desk-pane">
      <div className="border-b border-border/40 px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
              Preview Dossier
            </p>
            <h2 className="font-display text-xl text-foreground">Asset Readout</h2>
            <p className="text-sm text-muted-foreground">
              Selected file identity, preview metadata, and the dominant read pane stay together on
              the right.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {preview?.previewMode ? (
              <Badge variant="secondary" className="font-mono">
                {preview.previewMode}
              </Badge>
            ) : null}
            {preview?.contentType ? (
              <Badge variant="outline" className="max-w-[12rem] truncate font-mono">
                {preview.contentType}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      <div className="border-b border-border/40 bg-mcm-paper/55 px-6 py-4">
        <p className="font-mono text-xs text-muted-foreground">Selected File</p>
        <p className="truncate font-mono text-sm">
          {selectedFilePath ? selectedFilePath : 'Select a file from the hierarchy'}
        </p>
      </div>

      <div className="desk-pane-scroll p-5">
        {!selectedFilePath ? (
          <div className="rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4 font-mono text-sm text-muted-foreground">
            Choose a file to preview plaintext content.
          </div>
        ) : previewLoading ? (
          <div className="rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4 font-mono text-sm text-muted-foreground">
            Loading preview for {selectedFileLabel}...
          </div>
        ) : previewError ? (
          <div className="rounded-[1.5rem] border border-destructive/30 bg-destructive/10 p-4 font-mono text-sm text-destructive">
            <strong>Error:</strong> {previewError}
          </div>
        ) : preview && isTablePreview ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  Preview Mode
                </div>
                <div className="mt-2 text-lg font-semibold text-foreground">
                  {preview.previewMode === 'delta-table' ? 'Delta Table' : 'Parquet Table'}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  Structured table preview rendered in the dossier.
                </div>
              </div>

              <div className="rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  Rows
                </div>
                <div className="mt-2 text-lg font-semibold text-foreground">
                  {displayedPreviewRows.toLocaleString()}
                  {previewRowCount > 0 ? ` / ${previewRowCount.toLocaleString()}` : ''}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  Preview rows returned from the selected asset.
                </div>
              </div>

              <div className="rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  Columns
                </div>
                <div className="mt-2 text-lg font-semibold text-foreground">
                  {previewTableColumns.length.toLocaleString()}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  Columns surfaced in the preview window.
                </div>
              </div>

              <div className="rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  Delta Files
                </div>
                <div className="mt-2 text-lg font-semibold text-foreground">
                  {formatTwoDigitCount(preview.processedDeltaFiles ?? Number(maxDeltaFiles))}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  Commit files processed for this preview.
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-paper/80 p-4 font-mono text-xs text-muted-foreground">
              <span>
                {preview.previewMode === 'delta-table' ? 'delta snapshot' : 'parquet preview'}
              </span>
              {preview.resolvedTablePath ? <span>table={preview.resolvedTablePath}</span> : null}
              {preview.tableVersion !== null && preview.tableVersion !== undefined ? (
                <span>version={preview.tableVersion}</span>
              ) : (
                <span>version=latest</span>
              )}
              {preview.processedDeltaFiles !== null && preview.processedDeltaFiles !== undefined ? (
                <span>commits={formatTwoDigitCount(preview.processedDeltaFiles)}</span>
              ) : null}
              <span>
                rows={displayedPreviewRows.toLocaleString()}
                {previewRowCount > 0 ? `/${previewRowCount.toLocaleString()}` : ''}
              </span>
              {preview.deltaLogPath ? <span>log={preview.deltaLogPath}</span> : null}
            </div>

            {previewTableColumns.length ? (
              <div className="max-h-[60vh] overflow-auto rounded-[1.6rem] border border-mcm-walnut/20 bg-background">
                <table className="min-w-full border-collapse font-mono text-xs">
                  <thead className="sticky top-0 z-10 bg-mcm-paper">
                    <tr className="border-b border-border/60">
                      <th className="w-12 border-r border-border/50 px-3 py-2 text-right text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        #
                      </th>
                      {previewTableColumns.map((column) => (
                        <th
                          key={column}
                          className="border-r border-border/50 px-3 py-2 text-left text-[10px] uppercase tracking-[0.2em] text-muted-foreground last:border-r-0"
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewTableRows.length ? (
                      previewTableRows.map((row, rowIndex) => (
                        <tr
                          key={`${selectedFilePath}-${rowIndex}`}
                          className="border-b border-border/40 align-top last:border-b-0"
                        >
                          <td className="border-r border-border/40 px-3 py-2 text-right text-muted-foreground">
                            {rowIndex + 1}
                          </td>
                          {previewTableColumns.map((column) => {
                            const displayValue = formatPreviewTableCell(row[column]);
                            return (
                              <td
                                key={`${selectedFilePath}-${rowIndex}-${column}`}
                                className="max-w-[18rem] border-r border-border/40 px-3 py-2 last:border-r-0"
                                title={displayValue}
                              >
                                <div className="truncate">{displayValue}</div>
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={previewTableColumns.length + 1}
                          className="px-3 py-6 text-center text-muted-foreground"
                        >
                          Delta preview returned no rows.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4 font-mono text-sm text-muted-foreground">
                Preview returned no table columns.
              </div>
            )}
          </div>
        ) : preview && !preview.isPlainText ? (
          <div className="space-y-3 rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4 font-mono text-sm text-muted-foreground">
            <div>
              This file does not appear to be plaintext and cannot be rendered as text preview.
            </div>
            {preview.contentType ? <div>contentType={preview.contentType}</div> : null}
            {preview.truncated ? (
              <div>Preview bytes truncated at {preview.maxBytes.toLocaleString()}.</div>
            ) : null}
          </div>
        ) : preview ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  Encoding
                </div>
                <div className="mt-2 text-lg font-semibold text-foreground">
                  {preview.encoding || 'unknown'}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  Detected encoding for the current preview.
                </div>
              </div>

              <div className="rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  Content Type
                </div>
                <div className="mt-2 break-all text-sm font-semibold text-foreground">
                  {preview.contentType || 'unknown'}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  MIME type reported by the backing preview response.
                </div>
              </div>

              <div className="rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  Truncation
                </div>
                <div className="mt-2 text-lg font-semibold text-foreground">
                  {preview.truncated ? 'Truncated' : 'Complete'}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {preview.truncated
                    ? `Preview capped at ${preview.maxBytes.toLocaleString()} bytes.`
                    : 'Preview is within the configured byte limit.'}
                </div>
              </div>
            </div>

            {preview.previewMode === 'delta-log' ? (
              <div className="rounded-[1.4rem] border border-mcm-olive/20 bg-mcm-olive/5 p-4 font-mono text-xs text-mcm-olive">
                delta-log preview from {preview.deltaLogPath || '_delta_log/'} | files=
                {formatTwoDigitCount(preview.processedDeltaFiles ?? Number(maxDeltaFiles))}
              </div>
            ) : null}

            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              Preview Body
            </div>

            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-[1.6rem] border border-mcm-walnut/20 bg-background p-4 font-mono text-xs leading-5">
              {formattedPreviewContent}
            </pre>
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4 font-mono text-sm text-muted-foreground">
            No preview is currently available for the selected file.
          </div>
        )}
      </div>
    </section>
  );
}
