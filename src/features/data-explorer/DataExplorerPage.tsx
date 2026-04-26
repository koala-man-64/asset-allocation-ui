import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHero } from '@/app/components/common/PageHero';
import { DataExplorerHierarchyNavigator } from '@/features/data-explorer/components/DataExplorerHierarchyNavigator';
import { DataExplorerPreviewDossier } from '@/features/data-explorer/components/DataExplorerPreviewDossier';
import { DataExplorerRail } from '@/features/data-explorer/components/DataExplorerRail';
import {
  DOMAIN_OPTIONS_BY_LAYER,
  EXPLORER_ROOT_PATHS,
  normalizeFilePath,
  normalizeFolderPath,
  type DomainKey,
  type LayerKey,
  type TreeMeta
} from '@/features/data-explorer/lib/dataExplorer';
import { DataService } from '@/services/DataService';
import type { AdlsFilePreviewResponse, AdlsHierarchyEntry } from '@/services/apiService';
import { formatSystemStatusText } from '@/utils/formatSystemStatusText';
import { Database } from 'lucide-react';

function getPreviewStatusLabel(preview: AdlsFilePreviewResponse | null): string {
  if (!preview?.previewMode) {
    return 'Awaiting File';
  }
  switch (preview.previewMode) {
    case 'delta-table':
      return 'Delta Table';
    case 'parquet-table':
      return 'Parquet Table';
    case 'delta-log':
      return 'Delta Log';
    case 'blob':
      return 'Blob';
    default:
      return preview.previewMode;
  }
}

export const DataExplorerPage: React.FC = () => {
  const [layer, setLayer] = useState<LayerKey>('gold');
  const [domain, setDomain] = useState<DomainKey>('market');
  const domainOptions = useMemo(() => DOMAIN_OPTIONS_BY_LAYER[layer], [layer]);
  const [maxDeltaFiles, setMaxDeltaFiles] = useState<string>('0');
  const rootPath = useMemo(
    () => normalizeFolderPath(EXPLORER_ROOT_PATHS[layer][domain]),
    [domain, layer]
  );
  const scanLimit = 5000;
  const previewMaxBytes = 262144;

  const [treeByPath, setTreeByPath] = useState<Record<string, AdlsHierarchyEntry[]>>({});
  const [treeMetaByPath, setTreeMetaByPath] = useState<Record<string, TreeMeta>>({});
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [loadingPaths, setLoadingPaths] = useState<Record<string, boolean>>({});

  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [preview, setPreview] = useState<AdlsFilePreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const loadFolder = useCallback(
    async (folderPath: string) => {
      const normalizedPath = normalizeFolderPath(folderPath);

      setLoadingPaths((prev) => ({ ...prev, [normalizedPath]: true }));
      setError(null);
      try {
        const result = await DataService.getAdlsTree({
          layer,
          path: normalizedPath || undefined,
          maxEntries: scanLimit
        });
        setTreeByPath((prev) => ({ ...prev, [normalizedPath]: result.entries }));
        setTreeMetaByPath((prev) => ({
          ...prev,
          [normalizedPath]: {
            container: result.container,
            scanLimit: result.scanLimit,
            truncated: result.truncated
          }
        }));
      } catch (err) {
        setError(formatSystemStatusText(err));
      } finally {
        setLoadingPaths((prev) => ({ ...prev, [normalizedPath]: false }));
      }
    },
    [layer, scanLimit]
  );

  const loadPreview = useCallback(
    async (filePath: string, options?: { maxDeltaFiles?: number }) => {
      const normalized = normalizeFilePath(filePath);
      if (!normalized) {
        return;
      }

      setSelectedFilePath(normalized);
      setPreviewLoading(true);
      setPreviewError(null);
      setPreview(null);

      try {
        const result = await DataService.getAdlsFilePreview({
          layer,
          path: normalized,
          maxBytes: previewMaxBytes,
          maxDeltaFiles: options?.maxDeltaFiles ?? Number(maxDeltaFiles)
        });
        setPreview(result);
      } catch (err) {
        setPreviewError(formatSystemStatusText(err));
      } finally {
        setPreviewLoading(false);
      }
    },
    [layer, maxDeltaFiles, previewMaxBytes]
  );

  useEffect(() => {
    if (domainOptions.some((option) => option.value === domain)) {
      return;
    }
    setDomain(domainOptions[0]?.value ?? 'market');
  }, [domain, domainOptions]);

  useEffect(() => {
    setTreeByPath({});
    setTreeMetaByPath({});
    setExpandedFolders({});
    setSelectedFilePath(null);
    setPreview(null);
    setPreviewError(null);
    void loadFolder(rootPath);
  }, [layer, loadFolder, rootPath]);

  const rootEntries = treeByPath[rootPath] || [];
  const rootMeta = treeMetaByPath[rootPath];
  const rootLoading = Boolean(loadingPaths[rootPath]);

  const handleToggleFolder = useCallback(
    (folderPath: string) => {
      const normalized = normalizeFolderPath(folderPath);
      const shouldExpand = !expandedFolders[normalized];
      setExpandedFolders((prev) => ({ ...prev, [normalized]: shouldExpand }));
      if (shouldExpand && !treeByPath[normalized]) {
        void loadFolder(normalized);
      }
    },
    [expandedFolders, loadFolder, treeByPath]
  );

  const handleSelectFile = useCallback(
    (filePath: string) => {
      void loadPreview(filePath);
    },
    [loadPreview]
  );

  const handleDeltaFilesChange = useCallback(
    (value: string) => {
      setMaxDeltaFiles(value);
      if (selectedFilePath) {
        void loadPreview(selectedFilePath, { maxDeltaFiles: Number(value) });
      }
    },
    [loadPreview, selectedFilePath]
  );

  const refreshExplorer = useCallback(async () => {
    if (refreshing) {
      return;
    }

    setRefreshing(true);

    const expandedPaths = Object.entries(expandedFolders)
      .filter(([path, isExpanded]) => isExpanded && path !== rootPath && path.startsWith(rootPath))
      .map(([path]) => normalizeFolderPath(path))
      .sort((left, right) => left.length - right.length);

    try {
      await loadFolder(rootPath);
      if (expandedPaths.length) {
        await Promise.allSettled(expandedPaths.map((folderPath) => loadFolder(folderPath)));
      }
      if (selectedFilePath) {
        await loadPreview(selectedFilePath, { maxDeltaFiles: Number(maxDeltaFiles) });
      }
    } finally {
      setRefreshing(false);
    }
  }, [
    expandedFolders,
    loadFolder,
    loadPreview,
    maxDeltaFiles,
    refreshing,
    rootPath,
    selectedFilePath
  ]);

  const previewStatusLabel = useMemo(() => getPreviewStatusLabel(preview), [preview]);
  const selectedAssetLabel = selectedFilePath?.split('/').pop() || 'No file selected';

  return (
    <div className="page-shell">
      <PageHero
        kicker="Live Operations"
        title={
          <span className="flex items-center gap-2">
            <Database className="h-5 w-5 text-mcm-teal" />
            Data Explorer
          </span>
        }
        subtitle="Browse ADLS hierarchies with a dedicated navigation pane, then inspect text, parquet, and delta-backed assets in a structured preview dossier."
        metrics={[
          {
            label: 'Desk Scope',
            value: `${layer} / ${domain}`,
            detail: 'Current container and domain selection.'
          },
          {
            label: 'Root Path',
            value: rootPath || '/',
            detail: rootMeta?.truncated
              ? 'Listing is truncated at the current scan limit.'
              : 'Listing is currently within the scan limit.',
            valueClassName: 'break-all'
          },
          {
            label: 'Preview Status',
            value: previewStatusLabel,
            detail: selectedFilePath
              ? `Focused on ${selectedAssetLabel}.`
              : 'No asset selected yet.'
          }
        ]}
      />

      <div className="desk-grid-explorer flex-1">
        <DataExplorerRail
          layer={layer}
          domain={domain}
          domainOptions={domainOptions}
          maxDeltaFiles={maxDeltaFiles}
          rootPath={rootPath}
          rootEntries={rootEntries}
          rootMeta={rootMeta}
          selectedFilePath={selectedFilePath}
          preview={preview}
          refreshing={refreshing}
          onLayerChange={setLayer}
          onDomainChange={setDomain}
          onMaxDeltaFilesChange={handleDeltaFilesChange}
          onRefresh={() => void refreshExplorer()}
        />

        <DataExplorerHierarchyNavigator
          rootPath={rootPath}
          rootEntries={rootEntries}
          rootMeta={rootMeta}
          rootLoading={rootLoading}
          error={error}
          treeByPath={treeByPath}
          expandedFolders={expandedFolders}
          loadingPaths={loadingPaths}
          selectedFilePath={selectedFilePath}
          onToggleFolder={handleToggleFolder}
          onSelectFile={handleSelectFile}
        />

        <DataExplorerPreviewDossier
          selectedFilePath={selectedFilePath}
          preview={preview}
          previewLoading={previewLoading}
          previewError={previewError}
          maxDeltaFiles={maxDeltaFiles}
        />
      </div>
    </div>
  );
};
