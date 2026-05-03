import type { Page, Route } from '@playwright/test';

const NOW = '2026-04-18T14:30:00Z';

const systemStatusViewPayload = {
  version: 3,
  generatedAt: NOW,
  systemHealth: {
    overall: 'healthy',
    lastUpdated: NOW,
    alerts: [],
    resources: [
      {
        name: 'aca-job-market-bronze',
        resourceType: 'Microsoft.App/jobs',
        status: 'healthy',
        jobCategory: 'data-pipeline',
        jobKey: 'market',
        jobRole: 'load',
        triggerOwner: 'schedule',
        metadataSource: 'tags',
        metadataStatus: 'valid',
        runningState: 'Succeeded',
        lastModifiedAt: NOW,
        signals: []
      },
      {
        name: 'gold-regime-job',
        resourceType: 'Microsoft.App/jobs',
        status: 'healthy',
        jobCategory: 'strategy-compute',
        jobKey: 'regime',
        jobRole: 'publish',
        triggerOwner: 'schedule',
        metadataSource: 'tags',
        metadataStatus: 'valid',
        runningState: 'Succeeded',
        lastModifiedAt: NOW,
        signals: []
      },
      {
        name: 'results-reconcile-job',
        resourceType: 'Microsoft.App/jobs',
        status: 'warning',
        jobCategory: 'operational-support',
        jobKey: 'results-reconcile',
        jobRole: 'reconcile',
        triggerOwner: 'reconciler',
        metadataSource: 'legacy-catalog',
        metadataStatus: 'fallback',
        runningState: 'Succeeded',
        lastModifiedAt: NOW,
        signals: []
      },
      {
        name: 'aca-job-backtest-runner',
        resourceType: 'Microsoft.App/jobs',
        status: 'healthy',
        runningState: 'Running',
        lastModifiedAt: NOW,
        signals: []
      },
      {
        name: 'aca-job-ranking-materialize',
        resourceType: 'Microsoft.App/jobs',
        status: 'healthy',
        runningState: 'Succeeded',
        lastModifiedAt: NOW,
        signals: []
      }
    ],
    recentJobs: [
      {
        jobName: 'aca-job-market-bronze',
        jobType: 'data-ingest',
        jobCategory: 'data-pipeline',
        jobKey: 'market',
        jobRole: 'load',
        triggerOwner: 'schedule',
        metadataSource: 'tags',
        metadataStatus: 'valid',
        status: 'success',
        startTime: NOW,
        duration: 180,
        triggeredBy: 'playwright'
      },
      {
        jobName: 'aca-job-backtest-runner',
        jobType: 'backtest',
        status: 'running',
        startTime: NOW,
        duration: 240,
        triggeredBy: 'playwright'
      },
      {
        jobName: 'aca-job-ranking-materialize',
        jobType: 'data-ingest',
        status: 'success',
        startTime: NOW,
        duration: 120,
        triggeredBy: 'playwright'
      }
    ],
    dataLayers: [
      {
        name: 'Bronze',
        description: 'Raw ingestion',
        status: 'healthy',
        lastUpdated: NOW,
        refreshFrequency: 'Daily',
        domains: [
          {
            name: 'market',
            type: 'delta',
            path: 'market-data',
            lastUpdated: NOW,
            status: 'healthy',
            jobName: 'aca-job-market-bronze',
            portalUrl: 'https://example.test/storage/market',
            jobUrl: 'https://example.test/jobs/market'
          }
        ]
      },
      {
        name: 'Silver',
        description: 'Normalized dataset',
        status: 'healthy',
        lastUpdated: NOW,
        refreshFrequency: 'Daily',
        domains: [
          {
            name: 'market',
            type: 'delta',
            path: 'market-data',
            lastUpdated: NOW,
            status: 'healthy',
            jobName: 'aca-job-market-silver'
          }
        ]
      },
      {
        name: 'Gold',
        description: 'Feature outputs',
        status: 'healthy',
        lastUpdated: NOW,
        refreshFrequency: 'Daily',
        domains: [
          {
            name: 'finance',
            type: 'delta',
            path: 'finance-data',
            lastUpdated: NOW,
            status: 'healthy',
            jobName: 'aca-job-finance-gold'
          }
        ]
      }
    ]
  },
  metadataSnapshot: {
    version: 2,
    updatedAt: NOW,
    entries: {
      'bronze/market': {
        layer: 'bronze',
        domain: 'market',
        container: 'bronze',
        type: 'delta',
        computedAt: NOW,
        metadataSource: 'artifact',
        symbolCount: 501,
        columnCount: 12,
        totalBytes: 10485760,
        warnings: [],
        dateRange: {
          min: '2026-01-02T00:00:00Z',
          max: '2026-04-18T00:00:00Z',
          column: 'date',
          source: 'stats'
        }
      },
      'silver/market': {
        layer: 'silver',
        domain: 'market',
        container: 'silver',
        type: 'delta',
        computedAt: NOW,
        metadataSource: 'artifact',
        symbolCount: 501,
        columnCount: 18,
        totalBytes: 9437184,
        warnings: []
      },
      'gold/finance': {
        layer: 'gold',
        domain: 'finance',
        container: 'gold',
        type: 'delta',
        computedAt: NOW,
        metadataSource: 'artifact',
        symbolCount: 501,
        columnCount: 24,
        totalBytes: 6291456,
        warnings: []
      }
    },
    warnings: []
  },
  sources: {
    systemHealth: 'live-refresh',
    metadataSnapshot: 'persisted-snapshot'
  }
};

const containerAppsPayload = {
  probed: true,
  apps: [
    {
      name: 'ui-api',
      resourceType: 'Microsoft.App/containerApps',
      status: 'healthy',
      details: 'Serving traffic',
      provisioningState: 'Succeeded',
      runningState: 'Running',
      latestReadyRevisionName: 'ui-api--000001',
      ingressFqdn: 'ui-api.example.test',
      checkedAt: NOW,
      health: {
        status: 'healthy',
        url: 'https://ui-api.example.test/healthz',
        httpStatus: 200,
        checkedAt: NOW
      }
    }
  ]
};

const dataProfilingRows = [
  {
    close: 182.31,
    symbol: 'AAPL',
    sector: 'Technology',
    trade_date: '2026-04-18',
    volume: 1300000
  },
  {
    close: 421.03,
    symbol: 'MSFT',
    sector: 'Technology',
    trade_date: '2026-04-18',
    volume: 990000
  }
];

const dataProfilePayload = {
  layer: 'gold',
  domain: 'market',
  column: 'close',
  kind: 'numeric',
  totalRows: 4000,
  nonNullCount: 3980,
  nullCount: 20,
  sampleRows: 1200,
  uniqueCount: 875,
  duplicateCount: 325,
  bins: [
    { label: '0-100', count: 140, start: 0, end: 100 },
    { label: '100-200', count: 420, start: 100, end: 200 },
    { label: '200-300', count: 300, start: 200, end: 300 },
    { label: '300-500', count: 340, start: 300, end: 500 }
  ],
  topValues: []
};

const backtestRunsPayload = {
  runs: [
    {
      run_id: 'run-playwright-completed',
      run_name: 'playwright completed backtest',
      status: 'completed',
      submitted_at: NOW,
      start_date: '2026-01-01',
      end_date: '2026-04-18'
    }
  ],
  limit: 8,
  offset: 0
};

const strategySummaries = [
  {
    name: 'quality-trend',
    type: 'configured',
    description: 'Quality trend desk note',
    updated_at: NOW
  },
  {
    name: 'defensive-value',
    type: 'configured',
    description: 'Defensive value desk note',
    updated_at: '2026-04-17T14:30:00Z'
  }
];

const strategyDetails = {
  'quality-trend': {
    name: 'quality-trend',
    type: 'configured',
    description: 'Quality trend desk note',
    output_table_name: 'quality_trend_daily',
    updated_at: NOW,
    config: {
      componentRefs: {
        universe: { name: 'large-cap-quality', version: 1 },
        ranking: { name: 'quality-momentum', version: 1 },
        rebalance: { name: 'monthly_last_trading_day', version: 1 },
        regimePolicy: { name: 'observe_only_default', version: 1 },
        riskPolicy: { name: 'balanced_long_only', version: 1 },
        exitPolicy: { name: 'rebalance_only', version: 1 }
      },
      universeConfigName: 'large-cap-quality',
      universeConfigVersion: 1,
      rankingSchemaName: 'quality-momentum',
      rankingSchemaVersion: 1,
      rebalance: 'weekly',
      longOnly: true,
      topN: 25,
      lookbackWindow: 90,
      holdingPeriod: 30,
      costModel: 'default',
      regimePolicy: {
        modelName: 'default-regime',
        mode: 'observe_only'
      },
      riskPolicy: {
        grossExposureLimit: 1,
        singleNameMaxWeight: 0.08,
        turnoverBudget: 0.35,
        maxTradeNotionalBaseCcy: 250000,
        notes: 'Desk risk envelope'
      },
      intrabarConflictPolicy: 'stop_first',
      exits: []
    }
  },
  'defensive-value': {
    name: 'defensive-value',
    type: 'configured',
    description: 'Defensive value desk note',
    output_table_name: 'defensive_value_daily',
    updated_at: '2026-04-17T14:30:00Z',
    config: {
      componentRefs: {
        universe: { name: 'large-cap-quality', version: 1 },
        ranking: { name: 'quality-momentum', version: 1 },
        rebalance: { name: 'monthly_last_trading_day', version: 1 },
        exitPolicy: { name: 'rank_decay_exit', version: 1 }
      },
      universeConfigName: 'large-cap-quality',
      universeConfigVersion: 1,
      rankingSchemaName: 'quality-momentum',
      rankingSchemaVersion: 1,
      rebalance: 'monthly',
      longOnly: true,
      topN: 20,
      lookbackWindow: 63,
      holdingPeriod: 21,
      costModel: 'default',
      intrabarConflictPolicy: 'stop_first',
      exits: []
    }
  }
};

const universeCatalogPayload = {
  source: 'postgres_gold',
  fields: [
    {
      field: 'market.close',
      dataType: 'float',
      valueKind: 'number',
      operators: ['gt', 'gte', 'lt', 'lte', 'eq']
    }
  ]
};

const universeDetailPayload = {
  name: 'large-cap-quality',
  description: 'Large cap quality universe',
  version: 1,
  updated_at: NOW,
  config: {
    source: 'postgres_gold',
    root: {
      kind: 'group',
      operator: 'and',
      clauses: [{ kind: 'condition', field: 'market.close', operator: 'gt', value: 0 }]
    }
  }
};

const rankingCatalogPayload = {
  source: 'postgres_gold',
  tables: [
    {
      name: 'market_data',
      asOfColumn: 'date',
      columns: [{ name: 'return_20d', dataType: 'float', valueKind: 'number' }]
    }
  ]
};

const rankingDetailPayload = {
  name: 'quality-momentum',
  description: 'Quality and momentum factors',
  version: 1,
  updated_at: NOW,
  config: {
    universeConfigName: 'large-cap-quality',
    groups: [
      {
        name: 'Quality',
        weight: 1,
        transforms: [{ type: 'percentile_rank', params: {} }],
        factors: [
          {
            name: 'return-20d',
            table: 'market_data',
            column: 'return_20d',
            weight: 1,
            direction: 'desc',
            missingValuePolicy: 'exclude',
            transforms: [{ type: 'zscore', params: {} }]
          }
        ]
      }
    ],
    overallTransforms: []
  }
};

const strategyComparisonPayload = {
  asOf: NOW,
  benchmarkSymbol: 'SPY',
  costModel: 'default',
  barSize: '1d',
  strategies: [
    { strategyName: 'quality-trend', role: 'baseline' },
    { strategyName: 'defensive-value', role: 'challenger' }
  ],
  metrics: [
    {
      metric: 'sharpe_ratio',
      label: 'Sharpe',
      unit: 'score',
      values: {
        'quality-trend': 1.2,
        'defensive-value': 0.9
      },
      winnerStrategyName: 'quality-trend',
      notes: ''
    }
  ],
  runEvidence: [],
  warnings: [],
  blockedReasons: []
};

const strategyForecastPayload = {
  asOf: NOW,
  horizon: '3M',
  regimeAssumption: 'current',
  source: 'control_plane',
  forecasts: [
    {
      strategyName: 'quality-trend',
      expectedReturn: 0.03,
      expectedActiveReturn: 0.01,
      downside: -0.04,
      upside: 0.08,
      confidence: 'medium',
      sampleSize: 12,
      sampleMode: 'regime_conditioned',
      appliedRegimeCode: 'current',
      source: 'backtest',
      notes: ['Matched historical regime windows.']
    }
  ],
  warnings: []
};

const strategyAllocationPayload = {
  strategyName: 'quality-trend',
  asOf: NOW,
  totalMarketValue: 100000,
  aggregateTargetWeight: 0.6,
  aggregateActualWeight: 0.58,
  exposures: [
    {
      accountId: 'acct-paper',
      accountName: 'Core Paper',
      portfolioName: 'Core Paper Portfolio',
      portfolioVersion: 1,
      sleeveId: 'core',
      sleeveName: 'Core',
      strategyName: 'quality-trend',
      strategyVersion: 4,
      asOf: '2026-04-18',
      targetWeight: 0.6,
      actualWeight: 0.58,
      drift: -0.02,
      marketValue: 58000,
      status: 'active'
    }
  ],
  positions: [],
  warnings: []
};

const strategyTradeHistoryPayload = {
  strategyName: 'quality-trend',
  trades: [
    {
      source: 'portfolio_ledger',
      timestamp: NOW,
      symbol: 'MSFT',
      side: 'buy',
      quantity: 10,
      price: 420,
      notional: 4200,
      commission: 1,
      slippageCost: 0.5,
      accountId: 'acct-paper',
      portfolioName: 'Core Paper Portfolio',
      eventId: 'evt-001'
    }
  ],
  total: 1,
  limit: 100,
  offset: 0,
  warnings: []
};

const tradeFreshnessPayload = {
  balancesState: 'fresh',
  positionsState: 'fresh',
  ordersState: 'fresh',
  balancesAsOf: NOW,
  positionsAsOf: NOW,
  ordersAsOf: NOW,
  maxAgeSeconds: 300,
  staleReason: null
};

const tradeAccounts = [
  {
    accountId: 'acct-paper',
    name: 'Core Paper',
    provider: 'alpaca',
    environment: 'paper',
    accountNumberMasked: '****1234',
    baseCurrency: 'USD',
    readiness: 'ready',
    readinessReason: null,
    capabilities: {
      canReadAccount: true,
      canReadPositions: true,
      canReadOrders: true,
      canReadHistory: true,
      canPreview: true,
      canSubmitPaper: true,
      canSubmitSandbox: false,
      canSubmitLive: false,
      canCancel: true,
      supportsMarketOrders: true,
      supportsLimitOrders: true,
      supportsStopOrders: false,
      supportsFractionalQuantity: false,
      supportsNotionalOrders: true,
      supportsEquities: true,
      supportsEtfs: true,
      supportsOptions: false,
      readOnly: false,
      unsupportedReason: null
    },
    cash: 100000,
    buyingPower: 100000,
    equity: 125000,
    openOrderCount: 1,
    positionCount: 1,
    unresolvedAlertCount: 0,
    killSwitchActive: false,
    confirmationRequired: false,
    lastSyncedAt: NOW,
    snapshotAsOf: NOW,
    freshness: tradeFreshnessPayload,
    pnl: {
      realizedPnl: 1200,
      unrealizedPnl: 100,
      dayPnl: 45,
      grossExposure: 21000,
      netExposure: 18000,
      asOf: NOW
    },
    lastTradeAt: NOW
  },
  {
    accountId: 'acct-live',
    name: 'Live Alpha',
    provider: 'schwab',
    environment: 'live',
    accountNumberMasked: '****9876',
    baseCurrency: 'USD',
    readiness: 'review',
    readinessReason: 'Supervisor acknowledgement required before live execution.',
    capabilities: {
      canReadAccount: true,
      canReadPositions: true,
      canReadOrders: true,
      canReadHistory: true,
      canPreview: true,
      canSubmitPaper: false,
      canSubmitSandbox: false,
      canSubmitLive: true,
      canCancel: true,
      supportsMarketOrders: true,
      supportsLimitOrders: true,
      supportsStopOrders: true,
      supportsFractionalQuantity: false,
      supportsNotionalOrders: false,
      supportsEquities: true,
      supportsEtfs: true,
      supportsOptions: false,
      readOnly: false,
      unsupportedReason: null
    },
    cash: 250000,
    buyingPower: 250000,
    equity: 300000,
    openOrderCount: 2,
    positionCount: 1,
    unresolvedAlertCount: 1,
    killSwitchActive: false,
    confirmationRequired: true,
    lastSyncedAt: NOW,
    snapshotAsOf: NOW,
    freshness: {
      ...tradeFreshnessPayload,
      ordersState: 'stale',
      staleReason: 'Order feed lag is under review.'
    },
    pnl: {
      realizedPnl: 3200,
      unrealizedPnl: -240,
      dayPnl: -60,
      grossExposure: 61000,
      netExposure: 45000,
      asOf: NOW
    },
    lastTradeAt: NOW
  }
];

const tradeAccountById = Object.fromEntries(
  tradeAccounts.map((account) => [account.accountId, account])
);

type TradeAccountMock = (typeof tradeAccounts)[number];

function brokerCapabilitiesFromTrade(account: TradeAccountMock) {
  return {
    canReadBalances: account.capabilities.canReadAccount,
    canReadPositions: account.capabilities.canReadPositions,
    canReadOrders: account.capabilities.canReadOrders,
    canTrade:
      account.capabilities.canSubmitPaper ||
      account.capabilities.canSubmitSandbox ||
      account.capabilities.canSubmitLive,
    canReconnect: false,
    canPauseSync: false,
    canRefresh: false,
    canAcknowledgeAlerts: false,
    canReadTradingPolicy: account.capabilities.canReadAccount,
    canWriteTradingPolicy: !account.capabilities.readOnly,
    canReadAllocation: account.capabilities.canReadAccount,
    canWriteAllocation: !account.capabilities.readOnly,
    canReleaseTradeConfirmation: !account.capabilities.readOnly,
    readOnlyReason: account.capabilities.readOnly ? account.capabilities.unsupportedReason : null
  };
}

function brokerSyncStatusFromTrade(account: TradeAccountMock) {
  const states = [
    account.freshness.balancesState,
    account.freshness.positionsState,
    account.freshness.ordersState
  ];
  if (states.every((state) => state === 'fresh')) {
    return 'fresh';
  }
  if (states.some((state) => state === 'stale')) {
    return 'stale';
  }
  return 'never_synced';
}

function brokerOverallStatusFromTrade(account: TradeAccountMock) {
  const syncStatus = brokerSyncStatusFromTrade(account);
  if (account.readiness === 'blocked' || account.killSwitchActive || !account.capabilities.canReadAccount) {
    return 'critical';
  }
  if (account.readiness === 'review' || syncStatus !== 'fresh' || account.unresolvedAlertCount > 0) {
    return 'warning';
  }
  return 'healthy';
}

function brokerConnectionHealthFromTrade(account: TradeAccountMock) {
  const syncStatus = brokerSyncStatusFromTrade(account);
  const overallStatus = brokerOverallStatusFromTrade(account);
  return {
    overallStatus,
    authStatus: account.capabilities.canReadAccount ? 'authenticated' : 'not_connected',
    connectionState:
      !account.capabilities.canReadAccount ? 'disconnected' : syncStatus === 'fresh' ? 'connected' : 'degraded',
    syncStatus,
    lastCheckedAt: account.snapshotAsOf,
    lastSuccessfulSyncAt: syncStatus === 'fresh' || syncStatus === 'stale' ? account.lastSyncedAt : null,
    lastFailedSyncAt: null,
    authExpiresAt: null,
    staleReason: syncStatus === 'stale' ? account.freshness.staleReason : null,
    failureMessage: account.readiness === 'blocked' ? account.readinessReason : null,
    syncPaused: false
  };
}

function brokerAllocationForTradeAccount(account: TradeAccountMock) {
  return {
    portfolioName: account.accountId === 'acct-live' ? 'Live Alpha Portfolio' : 'Core Paper Portfolio',
    portfolioVersion: 1,
    allocationMode: 'percent',
    allocatableCapital: account.buyingPower,
    allocatedPercent: 100,
    allocatedNotionalBaseCcy: account.buyingPower,
    remainingPercent: 0,
    remainingNotionalBaseCcy: 0,
    sharedActivePortfolio: false,
    effectiveFrom: '2026-04-18',
    items: [
      {
        sleeveId: 'core',
        sleeveName: 'Core',
        strategy: {
          strategyName: 'quality-trend',
          strategyVersion: 4
        },
        allocationMode: 'percent',
        targetWeightPct: 100,
        targetNotionalBaseCcy: null,
        derivedWeightPct: 100,
        enabled: true,
        notes: ''
      }
    ]
  };
}

function brokerAccountFromTradeAccount(account: TradeAccountMock) {
  const allocationSummary = brokerAllocationForTradeAccount(account);
  return {
    accountId: account.accountId,
    broker: account.provider,
    name: account.name,
    accountNumberMasked: account.accountNumberMasked,
    baseCurrency: account.baseCurrency,
    overallStatus: brokerOverallStatusFromTrade(account),
    tradeReadiness: account.readiness,
    tradeReadinessReason: account.readinessReason,
    highestAlertSeverity: account.unresolvedAlertCount > 0 ? 'warning' : null,
    connectionHealth: brokerConnectionHealthFromTrade(account),
    equity: account.equity,
    cash: account.cash,
    buyingPower: account.buyingPower,
    openPositionCount: account.positionCount,
    openOrderCount: account.openOrderCount,
    lastSyncedAt: account.lastSyncedAt,
    snapshotAsOf: account.snapshotAsOf,
    activePortfolioName: allocationSummary.portfolioName,
    strategyLabel: null,
    configurationVersion: 1,
    allocationSummary,
    alertCount: account.unresolvedAlertCount
  };
}

function brokerConfigurationFromTradeAccount(account: TradeAccountMock) {
  return {
    accountId: account.accountId,
    accountName: account.name,
    baseCurrency: account.baseCurrency,
    configurationVersion: 1,
    requestedPolicy: {
      maxOpenPositions: 20,
      maxSinglePositionExposure: {
        mode: 'pct_of_allocatable_capital',
        value: 10
      },
      allowedSides: ['long'],
      allowedAssetClasses: ['equity'],
      requireOrderConfirmation: account.confirmationRequired
    },
    effectivePolicy: {
      maxOpenPositions: 20,
      maxSinglePositionExposure: {
        mode: 'pct_of_allocatable_capital',
        value: 10
      },
      allowedSides: ['long'],
      allowedAssetClasses: ['equity'],
      requireOrderConfirmation: account.confirmationRequired
    },
    capabilities: brokerCapabilitiesFromTrade(account),
    allocation: brokerAllocationForTradeAccount(account),
    warnings: [],
    updatedAt: NOW,
    updatedBy: 'playwright',
    audit: []
  };
}

function effectivePolicyFromRequestedPolicy(
  account: TradeAccountMock,
  requestedPolicy: ReturnType<typeof brokerConfigurationFromTradeAccount>['requestedPolicy']
) {
  const allowedSides = requestedPolicy.allowedSides.filter((side) => side === 'long' || side === 'short');
  const allowedAssetClasses = requestedPolicy.allowedAssetClasses.filter((assetClass) => {
    if (assetClass === 'option') {
      return account.capabilities.supportsOptions;
    }
    return account.capabilities.supportsEquities || account.capabilities.supportsEtfs;
  });

  return {
    ...requestedPolicy,
    allowedSides: allowedSides.length ? allowedSides : ['long'],
    allowedAssetClasses: allowedAssetClasses.length ? allowedAssetClasses : ['equity']
  };
}

function brokerAccountDetailFromTradeAccount(account: TradeAccountMock) {
  return {
    account: brokerAccountFromTradeAccount(account),
    capabilities: brokerCapabilitiesFromTrade(account),
    accountType: account.environment === 'paper' ? 'paper' : 'other',
    tradingBlocked: account.readiness === 'blocked' || account.killSwitchActive,
    tradingBlockedReason:
      account.readiness === 'blocked'
        ? account.readinessReason || 'Account is blocked from trading.'
        : null,
    unsettledFunds: null,
    dayTradeBuyingPower: null,
    maintenanceExcess: null,
    alerts: [],
    syncRuns: [],
    recentActivity: [],
    configuration: brokerConfigurationFromTradeAccount(account)
  };
}

const brokerAccounts = tradeAccounts.map((account) => brokerAccountFromTradeAccount(account));
const brokerAccountById = Object.fromEntries(
  brokerAccounts.map((account) => [account.accountId, account])
);
const brokerConfigurationByAccountId = Object.fromEntries(
  tradeAccounts.map((account) => [account.accountId, brokerConfigurationFromTradeAccount(account)])
);
const brokerAccountDetailsById = Object.fromEntries(
  tradeAccounts.map((account) => [account.accountId, brokerAccountDetailFromTradeAccount(account)])
);

function syncBrokerConfiguration(
  accountId: string,
  configuration: ReturnType<typeof brokerConfigurationFromTradeAccount>
) {
  brokerConfigurationByAccountId[accountId] = configuration;

  const currentAccount = brokerAccountById[accountId];
  if (currentAccount) {
    const nextAccount = {
      ...currentAccount,
      configurationVersion: configuration.configurationVersion,
      allocationSummary: configuration.allocation
    };
    brokerAccountById[accountId] = nextAccount;
    const accountIndex = brokerAccounts.findIndex((account) => account.accountId === accountId);
    if (accountIndex >= 0) {
      brokerAccounts[accountIndex] = nextAccount;
    }
  }

  const currentDetail = brokerAccountDetailsById[accountId];
  if (currentDetail) {
    brokerAccountDetailsById[accountId] = {
      ...currentDetail,
      account: brokerAccountById[accountId] ?? currentDetail.account,
      capabilities: configuration.capabilities,
      configuration
    };
  }
}

function resetBrokerMocks() {
  brokerAccounts.splice(
    0,
    brokerAccounts.length,
    ...tradeAccounts.map((account) => brokerAccountFromTradeAccount(account))
  );
  for (const account of tradeAccounts) {
    brokerAccountById[account.accountId] = brokerAccountFromTradeAccount(account);
    brokerConfigurationByAccountId[account.accountId] = brokerConfigurationFromTradeAccount(account);
    brokerAccountDetailsById[account.accountId] = brokerAccountDetailFromTradeAccount(account);
  }
}

const tradeOrdersByAccountId = {
  'acct-paper': [
    {
      orderId: 'order-paper-1',
      accountId: 'acct-paper',
      provider: 'alpaca',
      environment: 'paper',
      status: 'accepted',
      symbol: 'MSFT',
      side: 'buy',
      orderType: 'market',
      timeInForce: 'day',
      assetClass: 'equity',
      clientRequestId: 'client-paper-1',
      idempotencyKey: 'idem-paper-1',
      correlationId: null,
      providerOrderId: 'alpaca-paper-1',
      providerCorrelationId: null,
      quantity: 1,
      notional: null,
      limitPrice: null,
      stopPrice: null,
      estimatedPrice: null,
      estimatedNotional: null,
      filledQuantity: 0,
      averageFillPrice: null,
      submittedAt: NOW,
      acceptedAt: NOW,
      filledAt: null,
      cancelledAt: null,
      expiresAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      statusReason: null,
      riskChecks: [],
      reconciliationRequired: false
    }
  ],
  'acct-live': [
    {
      orderId: 'order-live-1',
      accountId: 'acct-live',
      provider: 'schwab',
      environment: 'live',
      status: 'accepted',
      symbol: 'TSLA',
      side: 'sell',
      orderType: 'limit',
      timeInForce: 'day',
      assetClass: 'equity',
      clientRequestId: 'client-live-1',
      idempotencyKey: 'idem-live-1',
      correlationId: null,
      providerOrderId: 'schwab-live-1',
      providerCorrelationId: null,
      quantity: 5,
      notional: null,
      limitPrice: 215,
      stopPrice: null,
      estimatedPrice: null,
      estimatedNotional: 1075,
      filledQuantity: 0,
      averageFillPrice: null,
      submittedAt: NOW,
      acceptedAt: NOW,
      filledAt: null,
      cancelledAt: null,
      expiresAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      statusReason: null,
      riskChecks: [],
      reconciliationRequired: false
    }
  ]
};

const tradeHistoryByAccountId = {
  'acct-paper': [
    ...tradeOrdersByAccountId['acct-paper'],
    {
      orderId: 'order-paper-filled-1',
      accountId: 'acct-paper',
      provider: 'alpaca',
      environment: 'paper',
      status: 'filled',
      symbol: 'AAPL',
      side: 'buy',
      orderType: 'market',
      timeInForce: 'day',
      assetClass: 'equity',
      clientRequestId: 'client-paper-filled-1',
      idempotencyKey: 'idem-paper-filled-1',
      correlationId: null,
      providerOrderId: 'alpaca-paper-filled-1',
      providerCorrelationId: null,
      quantity: 2,
      notional: null,
      limitPrice: null,
      stopPrice: null,
      estimatedPrice: null,
      estimatedNotional: null,
      filledQuantity: 2,
      averageFillPrice: 180,
      submittedAt: NOW,
      acceptedAt: NOW,
      filledAt: NOW,
      cancelledAt: null,
      expiresAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      statusReason: null,
      riskChecks: [],
      reconciliationRequired: false
    }
  ],
  'acct-live': [
    ...tradeOrdersByAccountId['acct-live'],
    {
      orderId: 'order-live-filled-1',
      accountId: 'acct-live',
      provider: 'schwab',
      environment: 'live',
      status: 'filled',
      symbol: 'TSLA',
      side: 'sell',
      orderType: 'limit',
      timeInForce: 'day',
      assetClass: 'equity',
      clientRequestId: 'client-live-filled-1',
      idempotencyKey: 'idem-live-filled-1',
      correlationId: null,
      providerOrderId: 'schwab-live-filled-1',
      providerCorrelationId: null,
      quantity: 3,
      notional: null,
      limitPrice: 212,
      stopPrice: null,
      estimatedPrice: null,
      estimatedNotional: null,
      filledQuantity: 3,
      averageFillPrice: 212,
      submittedAt: NOW,
      acceptedAt: NOW,
      filledAt: NOW,
      cancelledAt: null,
      expiresAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      statusReason: null,
      riskChecks: [],
      reconciliationRequired: false
    }
  ]
};

const tradePositionsByAccountId = {
  'acct-paper': [
    {
      accountId: 'acct-paper',
      symbol: 'MSFT',
      assetClass: 'equity',
      quantity: 10,
      marketValue: 1000,
      averageEntryPrice: 90,
      lastPrice: 100,
      costBasis: 900,
      unrealizedPnl: 100,
      unrealizedPnlPercent: 0.11,
      dayPnl: 5,
      weight: 0.01,
      asOf: NOW
    }
  ],
  'acct-live': [
    {
      accountId: 'acct-live',
      symbol: 'TSLA',
      assetClass: 'equity',
      quantity: 20,
      marketValue: 4200,
      averageEntryPrice: 205,
      lastPrice: 210,
      costBasis: 4100,
      unrealizedPnl: 100,
      unrealizedPnlPercent: 0.02,
      dayPnl: -35,
      weight: 0.04,
      asOf: NOW
    }
  ]
};

const tradeBlotterByAccountId = {
  'acct-paper': [
    {
      rowId: 'blotter-paper-1',
      accountId: 'acct-paper',
      provider: 'alpaca',
      environment: 'paper',
      eventType: 'fill',
      occurredAt: NOW,
      orderId: 'order-paper-filled-1',
      providerOrderId: 'alpaca-paper-filled-1',
      clientRequestId: 'client-paper-filled-1',
      symbol: 'AAPL',
      side: 'buy',
      status: 'filled',
      quantity: 2,
      price: 180,
      fees: 0,
      realizedPnl: null,
      cashImpact: -360,
      note: null
    }
  ],
  'acct-live': [
    {
      rowId: 'blotter-live-1',
      accountId: 'acct-live',
      provider: 'schwab',
      environment: 'live',
      eventType: 'fill',
      occurredAt: NOW,
      orderId: 'order-live-filled-1',
      providerOrderId: 'schwab-live-filled-1',
      clientRequestId: 'client-live-filled-1',
      symbol: 'TSLA',
      side: 'sell',
      status: 'filled',
      quantity: 3,
      price: 212,
      fees: 1.25,
      realizedPnl: 48,
      cashImpact: 634.75,
      note: null
    }
  ]
};

const tradeAccountDetailsById = {
  'acct-paper': {
    account: tradeAccountById['acct-paper'],
    restrictions: [],
    riskLimits: {
      maxOrderNotional: 50000,
      maxDailyNotional: 100000,
      maxShareQuantity: 1000,
      allowedAssetClasses: ['equity'],
      allowedOrderTypes: ['market', 'limit'],
      liveTradingAllowed: false,
      liveTradingReason: null
    },
    unresolvedAlerts: [],
    recentAuditEvents: [
      {
        eventId: 'audit-paper-1',
        accountId: 'acct-paper',
        provider: 'alpaca',
        environment: 'paper',
        eventType: 'preview',
        severity: 'info',
        occurredAt: NOW,
        actor: 'playwright',
        orderId: 'order-paper-1',
        providerOrderId: null,
        clientRequestId: 'client-paper-1',
        idempotencyKey: null,
        statusBefore: null,
        statusAfter: 'previewed',
        summary: 'Manual order preview generated.',
        sanitizedError: null,
        details: {}
      }
    ],
    alerts: []
  },
  'acct-live': {
    account: tradeAccountById['acct-live'],
    restrictions: ['Heightened supervision is active for live routing.'],
    riskLimits: {
      maxOrderNotional: 75000,
      maxDailyNotional: 150000,
      maxShareQuantity: 2500,
      allowedAssetClasses: ['equity'],
      allowedOrderTypes: ['market', 'limit', 'stop'],
      liveTradingAllowed: true,
      liveTradingReason: null
    },
    unresolvedAlerts: ['Awaiting margin review'],
    recentAuditEvents: [
      {
        eventId: 'audit-live-1',
        accountId: 'acct-live',
        provider: 'schwab',
        environment: 'live',
        eventType: 'submit',
        severity: 'warning',
        occurredAt: NOW,
        actor: 'playwright',
        orderId: 'order-live-1',
        providerOrderId: 'schwab-live-1',
        clientRequestId: 'client-live-1',
        idempotencyKey: 'idem-live-1',
        statusBefore: 'previewed',
        statusAfter: 'accepted',
        summary: 'Live trade submitted under supervisory review.',
        sanitizedError: null,
        details: {}
      }
    ],
    alerts: [
      {
        alertId: 'alert-live-1',
        accountId: 'acct-live',
        severity: 'warning',
        status: 'open',
        code: 'MARGIN_REVIEW',
        title: 'Awaiting margin review',
        message: 'Awaiting margin review before expanding live exposure.',
        blocking: false,
        observedAt: NOW
      }
    ]
  }
};

const tradePreviewByAccountId = {
  'acct-paper': {
    previewId: 'preview-paper-1',
    accountId: 'acct-paper',
    provider: 'alpaca',
    environment: 'paper',
    order: {
      ...tradeOrdersByAccountId['acct-paper'][0],
      status: 'previewed',
      providerOrderId: null
    },
    generatedAt: NOW,
    expiresAt: '2026-04-18T14:35:00Z',
    estimatedCost: null,
    estimatedFees: 0,
    cashAfter: null,
    buyingPowerAfter: null,
    riskChecks: [
      {
        checkId: 'risk-warning-1',
        label: 'Price band',
        status: 'warning',
        blocking: false,
        message: 'The price band is within tolerance but requires operator acknowledgement.',
        metadata: { headroomPct: 0.14 }
      }
    ],
    warnings: ['Review the price-band warning before submission.'],
    blocked: false,
    blockReason: null,
    freshness: tradeFreshnessPayload,
    confirmationRequired: false
  },
  'acct-live': {
    previewId: 'preview-live-1',
    accountId: 'acct-live',
    provider: 'schwab',
    environment: 'live',
    order: {
      ...tradeOrdersByAccountId['acct-live'][0],
      status: 'previewed'
    },
    generatedAt: NOW,
    expiresAt: '2026-04-18T14:35:00Z',
    estimatedCost: null,
    estimatedFees: 0,
    cashAfter: null,
    buyingPowerAfter: null,
    riskChecks: [],
    warnings: [],
    blocked: false,
    blockReason: null,
    freshness: tradeAccountById['acct-live'].freshness,
    confirmationRequired: true
  }
};

function tradeAccountIdFromPath(apiPath: string) {
  return decodeURIComponent(apiPath.split('/')[2] || '');
}

function brokerAccountIdFromPath(apiPath: string) {
  return decodeURIComponent(apiPath.split('/')[2] || '');
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });
}

function requestJson(route: Route): Record<string, unknown> {
  const body = route.request().postData();
  return body ? JSON.parse(body) as Record<string, unknown> : {};
}

function saveBrokerTradingPolicy(route: Route, accountId: string) {
  const current = brokerConfigurationByAccountId[accountId];
  const tradeAccount = tradeAccountById[accountId];
  const payload = requestJson(route);
  const expectedConfigurationVersion = payload.expectedConfigurationVersion;

  if (
    typeof expectedConfigurationVersion === 'number' &&
    expectedConfigurationVersion !== current.configurationVersion
  ) {
    return json(
      route,
      {
        detail: `Configuration version conflict for account '${accountId}': expected ${expectedConfigurationVersion}, found ${current.configurationVersion}.`
      },
      409
    );
  }

  const requestedPolicy = (payload.requestedPolicy ?? current.requestedPolicy) as typeof current.requestedPolicy;
  const nextConfiguration = {
    ...current,
    configurationVersion: current.configurationVersion + 1,
    requestedPolicy,
    effectivePolicy: effectivePolicyFromRequestedPolicy(tradeAccount, requestedPolicy),
    updatedAt: NOW,
    updatedBy: 'playwright',
    audit: [
      {
        auditId: `audit-policy-${accountId}-${current.configurationVersion + 1}`,
        accountId,
        category: 'trading_policy',
        outcome: 'saved',
        requestedAt: NOW,
        actor: 'playwright',
        requestId: 'playwright-request',
        grantedRoles: ['AssetAllocation.AccountPolicy.Write'],
        summary: 'Updated trading policy from account operations.',
        before: current.requestedPolicy,
        after: requestedPolicy,
        denialReason: null
      },
      ...current.audit
    ]
  };

  syncBrokerConfiguration(accountId, nextConfiguration);
  return json(route, nextConfiguration);
}

function jobLogsPayload(jobName: string) {
  return {
    jobName,
    runsRequested: 1,
    runsReturned: 1,
    tailLines: 50,
    runs: [
      {
        executionName: `${jobName}-20260418`,
        executionId: `${jobName}-20260418`,
        status: 'Succeeded',
        startTime: NOW,
        endTime: NOW,
        tail: ['Job completed successfully.'],
        consoleLogs: [
          {
            timestamp: NOW,
            stream_s: 'stdout',
            executionName: `${jobName}-20260418`,
            message: 'Job completed successfully.'
          }
        ]
      }
    ]
  };
}

function normalizeApiPath(url: URL) {
  return url.pathname.replace(/\/api/, '');
}

async function handleApiRoute(route: Route) {
  const requestUrl = new URL(route.request().url());
  const apiPath = normalizeApiPath(requestUrl);

  if (apiPath === '/system/status-view') {
    return json(route, systemStatusViewPayload);
  }

  if (apiPath === '/system/container-apps') {
    return json(route, containerAppsPayload);
  }

  if (apiPath.startsWith('/system/jobs/') && apiPath.endsWith('/logs')) {
    const jobName = decodeURIComponent(apiPath.split('/')[3] || 'job');
    return json(route, jobLogsPayload(jobName));
  }

  if (apiPath === '/system/health') {
    return json(route, systemStatusViewPayload.systemHealth);
  }

  if (apiPath === '/strategies') {
    return json(route, strategySummaries);
  }

  if (apiPath.startsWith('/strategies/') && apiPath.endsWith('/detail')) {
    const strategyName = decodeURIComponent(apiPath.split('/')[2] || '');
    const detail = strategyDetails[strategyName as keyof typeof strategyDetails];
    return detail ? json(route, detail) : json(route, { message: 'Unknown strategy' }, 404);
  }

  if (apiPath === '/strategies/analytics/compare') {
    return json(route, strategyComparisonPayload);
  }

  if (apiPath === '/strategies/analytics/forecast') {
    return json(route, strategyForecastPayload);
  }

  if (apiPath === '/strategies/analytics/allocations') {
    return json(route, strategyAllocationPayload);
  }

  if (apiPath === '/strategies/analytics/trades') {
    return json(route, strategyTradeHistoryPayload);
  }

  if (apiPath === '/universes') {
    return json(route, [
      {
        name: 'large-cap-quality',
        description: 'Large cap quality universe',
        version: 1,
        updated_at: NOW
      }
    ]);
  }

  if (apiPath === '/universes/catalog') {
    return json(route, universeCatalogPayload);
  }

  if (apiPath === '/universes/large-cap-quality/detail') {
    return json(route, universeDetailPayload);
  }

  if (apiPath === '/rankings') {
    return json(route, [
      {
        name: 'quality-momentum',
        description: 'Quality and momentum factors',
        version: 1,
        updated_at: NOW
      }
    ]);
  }

  if (apiPath === '/rankings/catalog') {
    return json(route, rankingCatalogPayload);
  }

  if (apiPath === '/rankings/quality-momentum/detail') {
    return json(route, rankingDetailPayload);
  }

  if (apiPath === '/backtests') {
    return json(route, backtestRunsPayload);
  }

  if (apiPath === '/backtests/run-playwright-completed/summary') {
    return json(route, {
      run_id: 'run-playwright-completed',
      total_return: 0.12,
      sharpe_ratio: 1.1,
      max_drawdown: -0.05,
      cost_drag_bps: 12,
      trades: 4,
      closed_positions: 2
    });
  }

  if (apiPath === '/backtests/run-playwright-completed/metrics/timeseries') {
    return json(route, {
      points: [],
      total_points: 2,
      truncated: false
    });
  }

  if (apiPath === '/backtests/run-playwright-completed/metrics/rolling') {
    return json(route, {
      points: [],
      total_points: 2,
      truncated: false
    });
  }

  if (apiPath === '/data/gold/market') {
    return json(route, dataProfilingRows);
  }

  if (apiPath === '/data/gold/profile') {
    return json(route, dataProfilePayload);
  }

  if (apiPath === '/realtime/ticket') {
    return json(route, { ticket: 'playwright-ticket-123' });
  }

  if (apiPath === '/broker-accounts') {
    return json(route, { accounts: brokerAccounts, generatedAt: NOW });
  }

  if (apiPath.startsWith('/broker-accounts/')) {
    const accountId = brokerAccountIdFromPath(apiPath);
    if (!brokerAccountById[accountId]) {
      return json(route, { detail: 'Unknown broker account' }, 404);
    }

    if (apiPath === `/broker-accounts/${accountId}`) {
      return json(route, brokerAccountDetailsById[accountId]);
    }

    if (apiPath === `/broker-accounts/${accountId}/configuration`) {
      return json(route, brokerConfigurationByAccountId[accountId]);
    }

    if (apiPath === `/broker-accounts/${accountId}/trading-policy`) {
      return saveBrokerTradingPolicy(route, accountId);
    }

    if (apiPath === `/broker-accounts/${accountId}/allocation`) {
      return json(route, brokerConfigurationByAccountId[accountId]);
    }

    if (
      apiPath === `/broker-accounts/${accountId}/reconnect` ||
      apiPath === `/broker-accounts/${accountId}/sync/pause` ||
      apiPath === `/broker-accounts/${accountId}/sync/resume` ||
      apiPath === `/broker-accounts/${accountId}/refresh` ||
      apiPath.match(/^\/broker-accounts\/([^/]+)\/alerts\/([^/]+)\/acknowledge$/)
    ) {
      return json(route, { detail: 'Action is not implemented in Account Operations v1.' }, 501);
    }
  }

  if (apiPath === '/trade-accounts') {
    return json(route, { accounts: tradeAccounts, generatedAt: NOW });
  }

  if (apiPath.startsWith('/trade-accounts/')) {
    const accountId = tradeAccountIdFromPath(apiPath);
    if (!tradeAccountById[accountId]) {
      return json(route, { message: 'Unknown trade account' }, 404);
    }

    if (apiPath === `/trade-accounts/${accountId}`) {
      return json(route, tradeAccountDetailsById[accountId]);
    }

    if (apiPath === `/trade-accounts/${accountId}/positions`) {
      return json(route, {
        accountId,
        positions: tradePositionsByAccountId[accountId] ?? [],
        generatedAt: NOW,
        freshness: tradeAccountById[accountId].freshness
      });
    }

    if (apiPath === `/trade-accounts/${accountId}/orders`) {
      if (route.request().method() === 'POST') {
        return json(route, {
          order: tradeOrdersByAccountId[accountId][0],
          submitted: true,
          replayed: false,
          reconciliationRequired: false,
          auditEventId: `audit-submit-${accountId}`,
          message: 'accepted'
        });
      }
      return json(route, {
        accountId,
        orders: tradeOrdersByAccountId[accountId] ?? [],
        generatedAt: NOW
      });
    }

    if (apiPath === `/trade-accounts/${accountId}/history`) {
      return json(route, {
        accountId,
        orders: tradeHistoryByAccountId[accountId] ?? [],
        generatedAt: NOW
      });
    }

    if (apiPath === `/trade-accounts/${accountId}/blotter`) {
      return json(route, {
        accountId,
        rows: tradeBlotterByAccountId[accountId] ?? [],
        generatedAt: NOW
      });
    }

    if (apiPath === `/trade-accounts/${accountId}/orders/preview`) {
      return json(route, tradePreviewByAccountId[accountId]);
    }

    const cancelMatch = apiPath.match(/^\/trade-accounts\/([^/]+)\/orders\/([^/]+)\/cancel$/);
    if (cancelMatch) {
      const matchedAccountId = decodeURIComponent(cancelMatch[1] || '');
      const orderId = decodeURIComponent(cancelMatch[2] || '');
      const order =
        (tradeOrdersByAccountId[matchedAccountId] ?? []).find((candidate) => candidate.orderId === orderId) ??
        tradeOrdersByAccountId[matchedAccountId]?.[0];

      return json(route, {
        order: { ...order, status: 'cancel_pending' },
        cancelAccepted: true,
        replayed: false,
        reconciliationRequired: false,
        auditEventId: `audit-cancel-${matchedAccountId}`,
        message: 'cancel accepted'
      });
    }
  }

  return json(route, {}, 404);
}

export async function registerUiApiMocks(page: Page) {
  resetBrokerMocks();

  await page.route('**/healthz', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok' })
    });
  });

  await page.route('**/api/**', handleApiRoute);
}
