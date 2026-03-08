import { describe, expect, it } from 'vitest'
import { resolveIpFromValues } from '~/lib/request-ip'

describe('request-ip', () => {
  it('uses the leftmost forwarded value when the direct peer is trusted', () => {
    expect(resolveIpFromValues('127.0.0.1', '203.0.113.10, 10.0.0.2')).toBe('203.0.113.10')
  })

  it('ignores spoofed forwarded headers when the direct peer is untrusted', () => {
    expect(
      resolveIpFromValues('198.51.100.20', '203.0.113.10', ['10.0.0.0/8']),
    ).toBe('198.51.100.20')
  })

  it('falls back to the direct peer when the forwarded header is malformed', () => {
    expect(resolveIpFromValues('127.0.0.1', 'not-an-ip')).toBe('127.0.0.1')
  })

  it('trims multiple forwarded values correctly', () => {
    expect(resolveIpFromValues('127.0.0.1', ' 203.0.113.15 , 10.0.0.5 ')).toBe('203.0.113.15')
  })

  it('normalizes IPv4-mapped IPv6 loopback addresses', () => {
    expect(resolveIpFromValues('::ffff:127.0.0.1', '203.0.113.22')).toBe('203.0.113.22')
  })

  it('supports IPv6 trusted proxy CIDRs', () => {
    expect(
      resolveIpFromValues('2001:db8::5', '198.51.100.25', ['2001:db8::/32']),
    ).toBe('198.51.100.25')
  })

  it('falls back to loopback when no peer IP is available', () => {
    expect(resolveIpFromValues(undefined, null)).toBe('127.0.0.1')
  })
})
