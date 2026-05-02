import { describe, expect, it } from 'vitest';

import type { JobRun } from '@/types/strategy';
import {
  buildLatestJobRunIndex,
  effectiveJobStatus,
  hasActiveJobRunningState,
  isSuspendedJobRunningState,
  normalizeJobStatus,
  selectAnchoredJobRun,
  selectLatestJobRun
} from '@/features/system-status/lib/SystemStatusHelpers';

describe('SystemStatusHelpers', () => {
  it('prefers active live resource running state over stale terminal execution status', () => {
    expect(effectiveJobStatus('success', 'Running')).toBe('running');
    expect(effectiveJobStatus('failed', 'Running')).toBe('running');
    expect(effectiveJobStatus('success', 'Queued')).toBe('running');
  });

  it('reports execution status when live resource state is terminal or absent', () => {
    expect(effectiveJobStatus('success', 'Succeeded')).toBe('success');
    expect(effectiveJobStatus('failed', 'Failed')).toBe('failed');
    expect(effectiveJobStatus('failed', null)).toBe('failed');
    expect(effectiveJobStatus('success', undefined)).toBe('success');
  });

  it('uses live resource state only when no execution status is available', () => {
    expect(effectiveJobStatus(null, 'Running')).toBe('running');
    expect(effectiveJobStatus(undefined, 'Suspended')).toBe('pending');
  });

  it('reports pending when live state is suspended even if a prior run was terminal', () => {
    expect(effectiveJobStatus('success', 'Suspended')).toBe('pending');
    expect(effectiveJobStatus('failed', 'Suspended')).toBe('pending');
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
