import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { SsrfGuardService } from './ssrf-guard.service';

const guard = new SsrfGuardService();

describe('SsrfGuardService.assertSafeHost — IP inputs', () => {
  const blocked = [
    '10.0.0.1',
    '10.255.255.255',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.1',
    '127.0.0.1',
    '127.0.0.255',
    '169.254.169.254',  // AWS metadata endpoint
    '169.254.0.1',
    '::1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    '::ffff:192.168.1.1',  // IPv4-mapped private
  ];

  for (const ip of blocked) {
    it(`blocks ${ip}`, async () => {
      await expect(guard.assertSafeHost(ip)).rejects.toThrow(BadRequestException);
    });
  }
});

describe('SsrfGuardService.assertSafeCidr', () => {
  it('blocks RFC1918 CIDR', () => {
    expect(() => guard.assertSafeCidr('192.168.0.0/16')).toThrow(BadRequestException);
  });

  it('blocks CIDR that overlaps with private range', () => {
    expect(() => guard.assertSafeCidr('10.0.0.0/8')).toThrow(BadRequestException);
  });

  it('blocks CIDR that partially overlaps', () => {
    expect(() => guard.assertSafeCidr('172.16.0.0/12')).toThrow(BadRequestException);
  });

  it('does not block public CIDR', () => {
    expect(() => guard.assertSafeCidr('93.184.216.0/24')).not.toThrow();
  });
});

describe('SsrfGuardService.assertSafeUrl', () => {
  it('blocks http:// to localhost', async () => {
    await expect(guard.assertSafeUrl('http://localhost/')).rejects.toThrow(BadRequestException);
  });

  it('blocks non-http protocols', async () => {
    await expect(guard.assertSafeUrl('file:///etc/passwd')).rejects.toThrow(BadRequestException);
  });

  it('blocks ftp://', async () => {
    await expect(guard.assertSafeUrl('ftp://example.com/')).rejects.toThrow(BadRequestException);
  });
});

class StubGuard extends SsrfGuardService {
  constructor(private readonly answers: Array<{ address: string; family: 4 | 6 }>) {
    super();
  }
  protected async lookupAll() {
    return this.answers;
  }
}

describe('SsrfGuardService.resolveSafe', () => {
  it('returns the checked addresses for a public host', async () => {
    const g = new StubGuard([{ address: '93.184.216.34', family: 4 }]);
    await expect(g.resolveSafe('example.com')).resolves.toEqual([
      { address: '93.184.216.34', family: 4 },
    ]);
  });

  it('rejects if ANY resolved address is internal (mixed answer)', async () => {
    const g = new StubGuard([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ]);
    await expect(g.resolveSafe('rebind.example')).rejects.toThrow(BadRequestException);
  });

  it('rejects when nothing resolves', async () => {
    const g = new StubGuard([]);
    await expect(g.resolveSafe('nx.example')).rejects.toThrow('Could not resolve host');
  });

  it('handles bracketed IPv6 literals with port', async () => {
    const g = new StubGuard([]);
    await expect(g.resolveSafe('[::1]:8080')).rejects.toThrow('disallowed address range');
    await expect(g.resolveSafe('[2606:4700:4700::1111]:443')).resolves.toEqual([
      { address: '2606:4700:4700::1111', family: 6 },
    ]);
  });
});

describe('SsrfGuardService.assertSafeHost — extended ranges', () => {
  for (const ip of ['192.0.2.1', '224.0.0.1', '::', 'ff02::1', '2002:c0a8:0101::1', '::ffff:c0a8:0101']) {
    it(`blocks ${ip}`, async () => {
      await expect(guard.assertSafeHost(ip)).rejects.toThrow(BadRequestException);
    });
  }
});
