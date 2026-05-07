import { describe, expect, it } from 'vitest';

import { applyJobRunMonotonicityGuard } from '@/features/system-status/lib/jobRunMonotonicity';
import type { JobRun, ResourceHealth, SystemHealth } from '@/types/strategy';

const buildHealth = (recentJobs: JobRun[] = [], resources: ResourceHealth[] = []): SystemHealth =>
  ({
    overall: 'healthy',
    components: [],
    alerts: [],
    recentJobs,
    resources,
    dataLayers: []
  }) as unknown as SystemHealth;

const job = (overrides: Partial<JobRun> = {}): JobRun => ({
  jobName: 'bronze-market-job',
  jobType: 'data-ingest',
  status: 'success',
  startTime: '2026-05-01T12:00:00Z',
  triggeredBy: 'schedule',
  ...overrides
});

const resource = (overrides: Partial<ResourceHealth> = {}): ResourceHealth =>
  ({
    name: 'bronze-market-job',
    resourceType: 'Microsoft.App/jobs',
    status: 'healthy',
    ...overrides
  }) as ResourceHealth;

describe('applyJobRunMonotonicityGuard', () => {
  it('keeps the previous newer JobRun when an older one arrives for the same execution', () => {
    const previous = buildHealth([
      job({ executionId: 'exec-9', startTime: '2026-05-01T12:05:00Z', status: 'success' })
    ]);
    const incoming = buildHealth([
      job({ executionId: 'exec-9', startTime: '2026-05-01T12:00:00Z', status: 'running' })
    ]);

    const result = applyJobRunMonotonicityGuard(incoming, previous);

    expect(result?.recentJobs[0].startTime).toBe('2026-05-01T12:05:00Z');
    expect(result?.recentJobs[0].status).toBe('success');
  });

  it('keeps the previous terminal JobRun when a non-terminal one arrives for the same execution', () => {
    const previous = buildHealth([
      job({ executionId: 'exec-9', startTime: '2026-05-01T12:00:00Z', status: 'failed' })
    ]);
    const incoming = buildHealth([
      job({ executionId: 'exec-9', startTime: '2026-05-01T12:01:00Z', status: 'pending' })
    ]);

    const result = applyJobRunMonotonicityGuard(incoming, previous);

    expect(result?.recentJobs[0].status).toBe('failed');
  });

  it('prefers an incoming JobRun with a strictly newer startTime', () => {
    const previous = buildHealth([
      job({ executionId: 'exec-9', startTime: '2026-05-01T12:00:00Z', status: 'success' })
    ]);
    const incoming = buildHealth([
      job({ executionId: 'exec-10', startTime: '2026-05-01T12:10:00Z', status: 'running' })
    ]);

    const result = applyJobRunMonotonicityGuard(incoming, previous);

    expect(result?.recentJobs[0].executionId).toBe('exec-10');
    expect(result?.recentJobs[0].status).toBe('running');
  });

  it('passes the incoming health through unchanged when no previous state exists', () => {
    const incoming = buildHealth([job({ executionId: 'exec-9', status: 'success' })]);
    const result = applyJobRunMonotonicityGuard(incoming, undefined);
    expect(result).toBe(incoming);
  });

  it('returns the incoming value unchanged when the guard is disabled', () => {
    const previous = buildHealth([
      job({ executionId: 'exec-9', startTime: '2026-05-01T12:05:00Z', status: 'success' })
    ]);
    const incoming = buildHealth([
      job({ executionId: 'exec-9', startTime: '2026-05-01T12:00:00Z', status: 'pending' })
    ]);

    const result = applyJobRunMonotonicityGuard(incoming, previous, { disabled: true });
    expect(result).toBe(incoming);
  });

  it('keeps the previous resource when its lastModifiedAt is newer', () => {
    const previous = buildHealth(
      [],
      [resource({ runningState: 'Succeeded', lastModifiedAt: '2026-05-01T12:05:00Z' })]
    );
    const incoming = buildHealth(
      [],
      [resource({ runningState: 'Running', lastModifiedAt: '2026-05-01T12:00:00Z' })]
    );

    const result = applyJobRunMonotonicityGuard(incoming, previous);
    expect(result?.resources?.[0].runningState).toBe('Succeeded');
  });

  it('keeps a previous terminal resource state when a running state regresses without a newer timestamp', () => {
    const previous = buildHealth(
      [],
      [resource({ runningState: 'Succeeded', lastModifiedAt: '2026-05-01T12:00:00Z' })]
    );
    const incoming = buildHealth(
      [],
      [resource({ runningState: 'Running', lastModifiedAt: '2026-05-01T12:00:00Z' })]
    );

    const result = applyJobRunMonotonicityGuard(incoming, previous);
    expect(result?.resources?.[0].runningState).toBe('Succeeded');
  });
});
