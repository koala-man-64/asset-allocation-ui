import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/hooks/useDataQueries';
import {
  mergeSystemHealthWithJobOverrides,
  renewPendingOverrides,
  type SystemHealthJobOverride,
  type SystemHealthJobOverrideMap
} from '@/hooks/useSystemHealthJobOverrides';
import type { JobRun, ResourceHealth, SystemHealth } from '@/types/strategy';

const FUTURE_EXPIRES_MS = 5 * 60 * 1000;

const buildOverride = (
  baseTime: string,
  overrides: Partial<SystemHealthJobOverride> = {}
): SystemHealthJobOverride => ({
  jobName: 'bronze-market-job',
  jobKey: 'bronze-market-job',
  status: 'running',
  runningState: 'Running',
  startTime: baseTime,
  firstSeenAt: baseTime,
  triggeredBy: 'manual',
  executionId: null,
  executionName: null,
  expiresAt: new Date(Date.now() + FUTURE_EXPIRES_MS).toISOString(),
  ...overrides
});

const buildHealth = (recentJobs: JobRun[] = [], resources: ResourceHealth[] = []): SystemHealth =>
  ({
    overall: 'healthy',
    components: [],
    alerts: [],
    recentJobs,
    resources,
    dataLayers: []
  }) as unknown as SystemHealth;

const buildJobRun = (overrides: Partial<JobRun> = {}): JobRun => ({
  jobName: 'bronze-market-job',
  jobType: 'data-ingest',
  status: 'failed',
  startTime: new Date().toISOString(),
  triggeredBy: 'schedule',
  ...overrides
});

const buildResource = (overrides: Partial<ResourceHealth> = {}): ResourceHealth =>
  ({
    name: 'bronze-market-job',
    resourceType: 'Microsoft.App/jobs',
    status: 'healthy',
    ...overrides
  }) as ResourceHealth;

const overridesMap = (override: SystemHealthJobOverride): SystemHealthJobOverrideMap => ({
  [override.jobKey]: override
});

describe('mergeSystemHealthWithJobOverrides - duplicate filter', () => {
  it('keeps a terminal server JobRun matching the override executionId', () => {
    const baseEpoch = Date.now();
    const baseTime = new Date(baseEpoch).toISOString();
    const override = buildOverride(baseTime, { executionId: 'exec-42' });
    const sameExecRun = buildJobRun({
      status: 'failed',
      executionId: 'exec-42',
      startTime: new Date(baseEpoch - 5 * 60_000).toISOString()
    });

    const merged = mergeSystemHealthWithJobOverrides(
      buildHealth([sameExecRun]),
      overridesMap(override)
    );

    expect(merged?.recentJobs).toHaveLength(1);
    expect(merged?.recentJobs[0]).toEqual(sameExecRun);
  });

  it('keeps a terminal server JobRun within start-time tolerance when neither side has an executionId', () => {
    const baseEpoch = Date.now();
    const baseTime = new Date(baseEpoch).toISOString();
    const override = buildOverride(baseTime);
    const nearbyRun = buildJobRun({
      status: 'failed',
      startTime: new Date(baseEpoch - 30_000).toISOString()
    });

    const merged = mergeSystemHealthWithJobOverrides(
      buildHealth([nearbyRun]),
      overridesMap(override)
    );

    expect(merged?.recentJobs).toHaveLength(1);
    expect(merged?.recentJobs[0]).toEqual(nearbyRun);
  });

  it('keeps unrelated recentJobs entries when the override matches nothing', () => {
    const baseTime = new Date().toISOString();
    const override = buildOverride(baseTime, { jobName: 'silver-job', jobKey: 'silver-job' });
    const unrelated = buildJobRun({
      jobName: 'gold-job',
      status: 'success'
    });

    const merged = mergeSystemHealthWithJobOverrides(
      buildHealth([unrelated]),
      overridesMap(override)
    );

    expect(merged?.recentJobs).toHaveLength(2);
    expect(merged?.recentJobs.find((j) => j.jobName === 'gold-job')?.status).toBe('success');
  });

  it('keeps a server JobRun whose executionId differs from the override (different execution)', () => {
    const baseTime = new Date().toISOString();
    const override = buildOverride(baseTime, { executionId: 'exec-42' });
    const otherExecRun = buildJobRun({
      status: 'failed',
      executionId: 'exec-41',
      startTime: new Date(Date.now() - 10 * 60_000).toISOString()
    });

    const merged = mergeSystemHealthWithJobOverrides(
      buildHealth([otherExecRun]),
      overridesMap(override)
    );

    expect(merged?.recentJobs).toHaveLength(2);
    const optimistic = merged?.recentJobs.find((j) => j.executionId === 'exec-42');
    const previous = merged?.recentJobs.find((j) => j.executionId === 'exec-41');
    expect(optimistic?.status).toBe('running');
    expect(previous?.status).toBe('failed');
  });
});

describe('jobReflectsServerState - bidirectional tolerance', () => {
  it('treats a server start within the tolerance window as caught up even when the server start is earlier', () => {
    const baseEpoch = Date.now();
    const baseTime = new Date(baseEpoch).toISOString();
    const override = buildOverride(baseTime);
    const earlierRun = buildJobRun({
      status: 'running',
      startTime: new Date(baseEpoch - 90_000).toISOString()
    });

    const merged = mergeSystemHealthWithJobOverrides(
      buildHealth([earlierRun]),
      overridesMap(override)
    );

    expect(merged?.recentJobs).toEqual([earlierRun]);
  });

  it('does not treat a server start outside the tolerance window as caught up', () => {
    const baseEpoch = Date.now();
    const baseTime = new Date(baseEpoch).toISOString();
    const override = buildOverride(baseTime);
    const veryStaleRun = buildJobRun({
      status: 'running',
      startTime: new Date(baseEpoch - 10 * 60_000).toISOString()
    });

    const merged = mergeSystemHealthWithJobOverrides(
      buildHealth([veryStaleRun]),
      overridesMap(override)
    );

    expect(merged?.recentJobs.length).toBeGreaterThanOrEqual(2);
    expect(merged?.recentJobs[0].triggeredBy).toBe('manual');
    expect(merged?.recentJobs[0].status).toBe('running');
  });
});

describe('mergeSystemHealthWithJobOverrides - resource handling', () => {
  it('overrides a non-running resource state with the override running state', () => {
    const baseTime = new Date().toISOString();
    const override = buildOverride(baseTime);
    const idleResource = buildResource({ runningState: 'Succeeded' });

    const merged = mergeSystemHealthWithJobOverrides(
      buildHealth([], [idleResource]),
      overridesMap(override)
    );

    expect(merged?.resources?.[0].runningState).toBe('Running');
  });

  it('does not override an already-running resource', () => {
    const baseTime = new Date().toISOString();
    const override = buildOverride(baseTime);
    const liveResource = buildResource({ runningState: 'Running' });

    const merged = mergeSystemHealthWithJobOverrides(
      buildHealth([], [liveResource]),
      overridesMap(override)
    );

    expect(merged?.resources?.[0]).toEqual(liveResource);
  });
});

describe('renewPendingOverrides', () => {
  it('removes an optimistic override after the server reports the same execution as terminal', () => {
    const queryClient = new QueryClient();
    const baseTime = new Date().toISOString();
    const override = buildOverride(baseTime, { executionId: 'exec-42' });

    queryClient.setQueryData(queryKeys.systemHealthJobOverrides(), overridesMap(override));

    renewPendingOverrides(
      queryClient,
      buildHealth([
        buildJobRun({
          status: 'success',
          executionId: 'exec-42',
          startTime: baseTime
        })
      ])
    );

    expect(queryClient.getQueryData(queryKeys.systemHealthJobOverrides())).toEqual({});
  });
});
