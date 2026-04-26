import React from 'react';
import {
  formatBytes,
  isLikelyTextFile,
  normalizeFilePath,
  normalizeFolderPath,
  type TreeMeta
} from '@/features/data-explorer/lib/dataExplorer';
import type { AdlsHierarchyEntry } from '@/services/apiService';
import { ChevronDown, ChevronRight, File, FileText, Folder } from 'lucide-react';

interface DataExplorerHierarchyNavigatorProps {
  rootPath: string;
  rootEntries: AdlsHierarchyEntry[];
  rootMeta?: TreeMeta;
  rootLoading: boolean;
  error: string | null;
  treeByPath: Record<string, AdlsHierarchyEntry[]>;
  expandedFolders: Record<string, boolean>;
  loadingPaths: Record<string, boolean>;
  selectedFilePath: string | null;
  onToggleFolder: (folderPath: string) => void;
  onSelectFile: (filePath: string) => void;
}

export function DataExplorerHierarchyNavigator({
  rootPath,
  rootEntries,
  rootMeta,
  rootLoading,
  error,
  treeByPath,
  expandedFolders,
  loadingPaths,
  selectedFilePath,
  onToggleFolder,
  onSelectFile
}: DataExplorerHierarchyNavigatorProps) {
  const renderEntries = (entries: AdlsHierarchyEntry[], depth: number): React.ReactNode => {
    return entries.map((entry) => {
      if (entry.type === 'folder') {
        const folderPath = normalizeFolderPath(entry.path);
        const isExpanded = Boolean(expandedFolders[folderPath]);
        const isLoading = Boolean(loadingPaths[folderPath]);
        const children = treeByPath[folderPath] || [];

        return (
          <div key={folderPath}>
            <button
              type="button"
              onClick={() => onToggleFolder(folderPath)}
              className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left font-mono text-sm transition-colors hover:bg-accent"
              style={{ paddingLeft: `${depth * 14 + 8}px` }}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <Folder className="h-4 w-4 shrink-0 text-mcm-teal" />
              <span className="truncate">{entry.name}</span>
            </button>

            {isExpanded ? (
              <div>
                {isLoading ? (
                  <div
                    className="py-1 font-mono text-xs text-muted-foreground"
                    style={{ paddingLeft: `${depth * 14 + 34}px` }}
                  >
                    Loading...
                  </div>
                ) : children.length ? (
                  renderEntries(children, depth + 1)
                ) : (
                  <div
                    className="py-1 font-mono text-xs text-muted-foreground"
                    style={{ paddingLeft: `${depth * 14 + 34}px` }}
                  >
                    Empty folder
                  </div>
                )}
              </div>
            ) : null}
          </div>
        );
      }

      const normalizedFilePath = normalizeFilePath(entry.path);
      const isSelected = selectedFilePath === normalizedFilePath;
      const textLike = isLikelyTextFile(entry.name);

      return (
        <button
          key={normalizedFilePath}
          type="button"
          onClick={() => onSelectFile(normalizedFilePath)}
          className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left font-mono text-sm transition-colors hover:bg-accent ${
            isSelected ? 'bg-accent/80' : ''
          }`}
          style={{ paddingLeft: `${depth * 14 + 26}px` }}
        >
          {textLike ? (
            <FileText className="h-4 w-4 shrink-0 text-mcm-copper" />
          ) : (
            <File className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1 truncate">{entry.name}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {formatBytes(entry.size)}
          </span>
        </button>
      );
    });
  };

  return (
    <section className="desk-pane">
      <div className="border-b border-border/40 px-6 py-5">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
          Hierarchy Navigator
        </p>
        <h2 className="mt-1 font-display text-xl text-foreground">ADLS Tree</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Browse the folder hierarchy in the center pane and keep tree loading states contained to
          the navigator.
        </p>
      </div>

      <div className="border-b border-border/40 bg-mcm-paper/55 px-6 py-4">
        <p className="font-mono text-xs text-muted-foreground">
          {rootMeta ? `container=${rootMeta.container}` : 'container=...'} | path={rootPath || '/'}
        </p>
        {rootMeta?.truncated ? (
          <p className="mt-1 font-mono text-xs text-amber-600">
            Listing truncated at {rootMeta.scanLimit.toLocaleString()} scanned blobs.
          </p>
        ) : null}
      </div>

      <div className="desk-pane-scroll p-4">
        {error ? (
          <div className="rounded-[1.5rem] border border-destructive/30 bg-destructive/10 p-4 font-mono text-sm text-destructive">
            <strong>Error:</strong> {error}
          </div>
        ) : rootLoading ? (
          <div className="rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4 font-mono text-sm text-muted-foreground">
            Loading tree...
          </div>
        ) : rootEntries.length ? (
          <div className="space-y-1 rounded-[1.8rem] border border-mcm-walnut/20 bg-mcm-paper/80 p-3">
            {renderEntries(rootEntries, 0)}
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4 font-mono text-sm text-muted-foreground">
            No folders or files found for this path.
          </div>
        )}
      </div>
    </section>
  );
}
