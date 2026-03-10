import '~/lib/load-env'
import { isIP } from 'node:net'
import { getRequest, getRequestIP } from '@tanstack/react-start/server'

const DEFAULT_TRUSTED_PROXY_CIDRS = ['127.0.0.1/32', '::1/128']

type IpVersion = 4 | 6

interface ParsedIpAddress {
  value: string
  version: IpVersion
  bits: number
  numeric: bigint
}

interface ParsedCidr {
  version: IpVersion
  bits: number
  prefixLength: number
  numeric: bigint
}

function normalizeCandidateIp(value: string | null | undefined): string | undefined {
  if (!value) return undefined

  let normalized = value.trim()
  if (!normalized) return undefined

  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    normalized = normalized.slice(1, -1)
  }

  const zoneIndex = normalized.indexOf('%')
  if (zoneIndex !== -1) {
    normalized = normalized.slice(0, zoneIndex)
  }

  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (mappedIpv4 && isIP(mappedIpv4[1]) === 4) {
    return mappedIpv4[1]
  }

  return isIP(normalized) === 0 ? undefined : normalized
}

function parseIpv4ToBigInt(ip: string): bigint {
  const octets = ip.split('.')
  if (octets.length !== 4) {
    throw new Error(`Invalid IPv4 address: ${ip}`)
  }

  return octets.reduce((result, octet) => {
    const value = Number.parseInt(octet, 10)
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new Error(`Invalid IPv4 address: ${ip}`)
    }
    return (result << 8n) + BigInt(value)
  }, 0n)
}

function expandIpv6Part(part: string): string[] {
  if (!part.includes('.')) {
    return [part]
  }

  const ipv4Value = normalizeCandidateIp(part)
  if (!ipv4Value || isIP(ipv4Value) !== 4) {
    throw new Error(`Invalid embedded IPv4 address: ${part}`)
  }

  const numeric = parseIpv4ToBigInt(ipv4Value)
  const upper = Number((numeric >> 16n) & 0xffffn).toString(16)
  const lower = Number(numeric & 0xffffn).toString(16)
  return [upper, lower]
}

function parseIpv6ToBigInt(ip: string): bigint {
  const parts = ip.split('::')
  if (parts.length > 2) {
    throw new Error(`Invalid IPv6 address: ${ip}`)
  }

  const left = parts[0]
    ? parts[0].split(':').filter(Boolean).flatMap(expandIpv6Part)
    : []
  const right = parts.length === 2 && parts[1]
    ? parts[1].split(':').filter(Boolean).flatMap(expandIpv6Part)
    : []

  const hasCompression = parts.length === 2
  const expandedParts = hasCompression
    ? [
        ...left,
        ...Array.from({ length: 8 - left.length - right.length }, () => '0'),
        ...right,
      ]
    : left

  if (expandedParts.length !== 8) {
    throw new Error(`Invalid IPv6 address: ${ip}`)
  }

  return expandedParts.reduce((result, segment) => {
    const value = Number.parseInt(segment, 16)
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
      throw new Error(`Invalid IPv6 address: ${ip}`)
    }
    return (result << 16n) + BigInt(value)
  }, 0n)
}

function parseIpAddress(value: string): ParsedIpAddress | undefined {
  const normalized = normalizeCandidateIp(value)
  if (!normalized) return undefined

  const version = isIP(normalized)
  if (version === 4) {
    return {
      value: normalized,
      version: 4,
      bits: 32,
      numeric: parseIpv4ToBigInt(normalized),
    }
  }

  if (version === 6) {
    return {
      value: normalized,
      version: 6,
      bits: 128,
      numeric: parseIpv6ToBigInt(normalized),
    }
  }

  return undefined
}

function parseCidr(value: string): ParsedCidr | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const [rawIp, rawPrefix] = trimmed.split('/')
  if (trimmed.includes('/') && rawPrefix === undefined) {
    return undefined
  }

  const parsedIp = parseIpAddress(rawIp)
  if (!parsedIp) return undefined

  const prefixLength = rawPrefix === undefined
    ? parsedIp.bits
    : Number.parseInt(rawPrefix, 10)

  if (!Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > parsedIp.bits) {
    return undefined
  }

  return {
    version: parsedIp.version,
    bits: parsedIp.bits,
    prefixLength,
    numeric: parsedIp.numeric,
  }
}

function ipMatchesCidr(ip: ParsedIpAddress, cidr: ParsedCidr): boolean {
  if (ip.version !== cidr.version) return false
  if (cidr.prefixLength === 0) return true

  const shift = BigInt(cidr.bits - cidr.prefixLength)
  return (ip.numeric >> shift) === (cidr.numeric >> shift)
}

function getTrustedProxyCidrs(trustedProxies?: string[]): ParsedCidr[] {
  const configured = trustedProxies
    ?? process.env.TRUSTED_PROXY_CIDRS
      ?.split(',')
      .map(value => value.trim())
      .filter(Boolean)
    ?? DEFAULT_TRUSTED_PROXY_CIDRS

  return configured
    .map(parseCidr)
    .filter((cidr): cidr is ParsedCidr => cidr !== undefined)
}

function isTrustedProxyIp(ip: string, trustedProxies?: string[]): boolean {
  const parsedIp = parseIpAddress(ip)
  if (!parsedIp) return false

  return getTrustedProxyCidrs(trustedProxies).some(cidr => ipMatchesCidr(parsedIp, cidr))
}

function extractForwardedClientIp(forwardedFor: string | null): string | undefined {
  if (!forwardedFor) return undefined

  const [leftMost] = forwardedFor.split(',')
  return normalizeCandidateIp(leftMost)
}

export function resolveIpFromValues(
  peerIp: string | undefined,
  forwardedFor: string | null,
  trustedProxies?: string[],
): string {
  const normalizedPeerIp = normalizeCandidateIp(peerIp) ?? '127.0.0.1'

  if (!isTrustedProxyIp(normalizedPeerIp, trustedProxies)) {
    return normalizedPeerIp
  }

  return extractForwardedClientIp(forwardedFor) ?? normalizedPeerIp
}

export function resolveClientIpFromRequest(request: Request, peerIp?: string): string {
  return resolveIpFromValues(peerIp, request.headers.get('x-forwarded-for'))
}

export function resolveClientIp(): string {
  return resolveIpFromValues(
    getRequestIP({ xForwardedFor: false }),
    getRequest().headers.get('x-forwarded-for'),
  )
}
