import { describe, expect, it } from 'vitest';

import type { JobRun } from '@/types/strategy';
import {
  buildAnchoredJobRunIndex,
  buildLatestJobRunIndex,
  effectiveJobStatus,
  hasActiveJobRunningState,
  isSuspendedJobRunningState,
  normalizeJobStatus,
  selectAnchoredJobRun,
  selectLatestJobRun
} from '@/features/system-status/lib/SystemStatusHelpers';

describe('SystemStatusHelpers', () => {
  it('prefers execution status over live resource running state', () => {
    expect(effectiveJobStatus('success', 'Running')).toBe('success');
    expect(effectiveJobStatus('failed', 'Running')).toBe('failed');
  });

  it('uses live resource state only when no execution status is available', () => {
    expect(effectiveJobStatus(null, 'Running')).toBe('running');
    expect(effectiveJobStatus(undefined, 'Suspended')).toBe('pending');
  });

  it('uses terminal live resource state when no recent run is available', () => {
    expect(effectiveJobStatus(null, 'Failed')).toBe('failed');
    expect(effectiveJobStatus(undefined, 'Succeeded')).toBe('success');
  });

  it('shares running-state detection across helpers', () => {
    expect(hasActiveJobRunningState('queued')).toBe(true);
    expect(isSuspendedJobRunningState('Suspended')).toBe(true);
  });

  it('normalizes spaced and hyphenated Azure status variants', () => {
    expect(hasActiveJobRunningState('In Progress')).toBe(true);
    expect(normalizeJobStatus('Succeeded With Warnings')).toBe('warning');
    expect(effectiveJobStatus('In-Progress', null)).toBe('running');
  });

  it('anchors to an active run even when a newer run finished later', () => {
    expect(
      selectAnchoredJobRun([
        {
          status: 'success',
          startTime: '2026-03-21T12:00:00Z'
        },
        {
          status: 'running',
          startTime: '2026-03-20T12:00:00Z'
        }
      ])
    ).toEqual({
      status: 'running',
      startTime: '2026-03-20T12:00:00Z'
    });
  });

  it('selects the latest execution when displaying status', () => {
    expect(
      selectLatestJobRun([
        {
          status: 'running',
          startTime: '2026-03-20T12:00:00Z'
        },
        {
          status: 'failed',
          startTime: '2026-03-21T12:00:00Z'
        }
      ])
    ).toEqual({
      status: 'failed',
      startTime: '2026-03-21T12:00:00Z'
    });
  });

  it('indexes each job by its anchored run rather than the newest completed run', () => {
    const anchored = buildAnchoredJobRunIndex([
      {
        jobName: 'bronze-market-job',
        status: 'success',
        startTime: '2026-03-21T12:00:00Z'
      },
      {
        jobName: 'bronze-market-job',
        status: 'running',
        startTime: '2026-03-20T12:00:00Z'
      }
    ] as JobRun[]);

    expect(anchored.get('bronze-market-job')).toEqual(
      expect.objectContaining({
        status: 'running',
        startTime: '2026-03-20T12:00:00Z'
      })
    );
  });

  it('indexes each job by its latest execution for status display', () => {
    const latest = buildLatestJobRunIndex([
      {
        jobName: 'bronze-market-job',
        status: 'running',
        startTime: '2026-03-20T12:00:00Z'
      },
      {
        jobName: 'bronze-market-job',
        status: 'failed',
        startTime: '2026-03-21T12:00:00Z'
      }
    ] as JobRun[]);

    expect(latest.get('bronze-market-job')).toEqual(
      expect.objectContaining({
        status: 'failed',
        startTime: '2026-03-21T12:00:00Z'
      })
    );
  });
});
