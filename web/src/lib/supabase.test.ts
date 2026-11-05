import { describe, expect, it } from 'vitest';
import { friendlyError } from './supabase';

describe('friendlyError', () => {
  it('explains the project-wide hourly email limit', () => {
    expect(friendlyError({ message: 'email rate limit exceeded', code: 'over_email_send_rate_limit' })).toMatch(/hourly email limit/);
    expect(friendlyError({ message: 'Email rate limit exceeded' })).toMatch(/hourly email limit/);
  });

  it('passes on how long to wait between requests', () => {
    expect(friendlyError({ message: 'For security purposes, you can only request this after 43 seconds.' }))
      .toBe('For security, please wait 43 seconds before asking again.');
  });

  it('keeps the generic message for other rate limits', () => {
    expect(friendlyError({ message: 'Request rate limit reached' })).toMatch(/Too many attempts/);
  });
});
