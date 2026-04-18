import '@asset-allocation/contracts';

declare module '@asset-allocation/contracts' {
  export interface UniverseCatalogResponse {
    source: UniverseSource;
    fields: UniverseFieldDefinition[];
  }

  export interface UniversePreviewResponse {
    source: UniverseSource;
    symbolCount: number;
    sampleSymbols: string[];
    fieldsUsed: UniverseFieldId[];
    warnings: string[];
  }
}

export {};
