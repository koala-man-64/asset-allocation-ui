import { describe, expect, it } from 'vitest';
import { sanitizeExternalUrl, sanitizeOperatorUrl } from './urlSecurity';

describe('sanitizeExternalUrl', () => {
  it('allows https URLs on allowed hosts', () => {
    const value = sanitizeExternalUrl('https://portal.azure.com/#resource/foo', {
      allowedHosts: ['portal.azure.com']
    });
    expect(value).toContain('https://portal.azure.com');
  });

  it('blocks javascript urls', () => {
    const value = sanitizeExternalUrl('javascript:alert(1)', {
      allowedHosts: ['portal.azure.com']
    });
    expect(value).toBe('');
  });

  it('blocks unapproved hosts', () => {
    const value = sanitizeExternalUrl('https://evil.example.com/path', {
      allowedHosts: ['portal.azure.com']
    });
    expect(value).toBe('');
  });

  it('supports wildcard hosts', () => {
    const value = sanitizeExternalUrl('https://sub.portal.azure.com/path', {
      allowedHosts: ['*.portal.azure.com']
    });
    expect(value).toContain('https://sub.portal.azure.com');
  });
});

describe('sanitizeOperatorUrl', () => {
  it('allows Azure portal resource IDs', () => {
    const value = sanitizeOperatorUrl('/subscriptions/123/resourceGroups/demo/providers/Microsoft.App/jobs/job-1');
    expect(value).toBe(
      'https://portal.azure.com/#resource/subscriptions/123/resourceGroups/demo/providers/Microsoft.App/jobs/job-1'
    );
  });

  it('allows same-origin URLs', () => {
    const value = sanitizeOperatorUrl('/api/system/status-view');
    expect(value).toBe(`${window.location.origin}/api/system/status-view`);
  });

  it('allows same-origin absolute URLs', () => {
    const value = sanitizeOperatorUrl(`${window.location.origin}/readyz`);
    expect(value).toBe(`${window.location.origin}/readyz`);
  });

  it('blocks arbitrary external hosts', () => {
    expect(sanitizeOperatorUrl('https://evil.example.com/path')).toBe('');
  });

  it('blocks javascript operator links', () => {
    expect(sanitizeOperatorUrl('javascript:alert(1)')).toBe('');
  });

  it('blocks Azure portal links when that route type is disabled', () => {
    expect(sanitizeOperatorUrl('https://portal.azure.com/#resource/foo', { allowAzurePortal: false })).toBe(
      ''
    );
  });
});
