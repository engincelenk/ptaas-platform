import { describe, it, expect } from 'vitest';
import { isBlockedIp, normalizeHost, expandIpv6 } from './ip-ranges';

describe('isBlockedIp — IPv4', () => {
  const blocked = [
    '10.1.1.1', '172.16.0.1', '192.168.1.1', '127.0.0.1', '169.254.169.254',
    '0.0.0.0', '100.64.0.1', '198.18.0.1', '240.0.0.1', '255.255.255.255',
    '192.0.2.5', '198.51.100.1', '203.0.113.9', // Doku-Netze
    '224.0.0.1', '239.255.255.250',            // Multicast
    '192.88.99.1',                             // 6to4 relay
  ];
  for (const ip of blocked) it(`blocks ${ip}`, () => expect(isBlockedIp(ip)).toBe(true));

  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34'])
    it(`allows ${ip}`, () => expect(isBlockedIp(ip)).toBe(false));
});

describe('isBlockedIp — IPv6', () => {
  const blocked = [
    '::', '::1', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1',
    '2001:db8::1',                              // Doku
    '2001:0:4136:e378:8000:63bf:3fff:fdd2',     // Teredo
    '::ffff:192.168.0.1', '::ffff:c0a8:0101',   // mapped (dotted + hex)
    '2002:c0a8:0101::1',                        // 6to4 von 192.168.1.1
    '64:ff9b::7f00:1',                          // NAT64 von 127.0.0.1
    '::2',                                      // IPv4-compatible (deprecated)
  ];
  for (const ip of blocked) it(`blocks ${ip}`, () => expect(isBlockedIp(ip)).toBe(true));

  for (const ip of ['2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8',
                    '2002:0808:0808::1', '64:ff9b::808:808'])
    it(`allows ${ip}`, () => expect(isBlockedIp(ip)).toBe(false));

  it('blocks unparseable input (fail closed)', () => {
    expect(isBlockedIp('not-an-ip')).toBe(true);
    expect(isBlockedIp('1:2:3')).toBe(true);
  });
});

describe('expandIpv6', () => {
  it('expands :: and embedded IPv4', () => {
    expect(expandIpv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(expandIpv6('::ffff:1.2.3.4')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x0102, 0x0304]);
  });
  it('returns null for malformed input', () => {
    expect(expandIpv6('1::2::3')).toBeNull();
    expect(expandIpv6('12345::1')).toBeNull();
  });
});

describe('normalizeHost', () => {
  it('strips brackets and port from IPv6 literals', () => {
    expect(normalizeHost('[::1]:8080')).toBe('::1');
    expect(normalizeHost('[::1]')).toBe('::1');
  });
  it('keeps bare IPv6 intact', () => expect(normalizeHost('::1')).toBe('::1'));
  it('strips port from hostnames and IPv4', () => {
    expect(normalizeHost('example.com:443')).toBe('example.com');
    expect(normalizeHost('10.0.0.1:80')).toBe('10.0.0.1');
    expect(normalizeHost('example.com')).toBe('example.com');
  });
});
