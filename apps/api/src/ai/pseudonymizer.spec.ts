import { describe, it, expect } from 'vitest';
import { Pseudonymizer } from './pseudonymizer';

describe('Pseudonymizer', () => {
  it('replaces IPs', () => {
    const p = new Pseudonymizer();
    const result = p.pseudonymize('Found on 192.168.1.1 and 10.0.0.5');
    expect(result).toBe('Found on [IP-1] and [IP-2]');
    expect(p.restore(result)).toBe('Found on 192.168.1.1 and 10.0.0.5');
  });

  it('replaces domains', () => {
    const p = new Pseudonymizer();
    const out = p.pseudonymize('Vulnerable: example.com and sub.example.com');
    expect(out).not.toContain('example.com');
    expect(p.restore(out)).toContain('example.com');
  });

  it('replaces paths', () => {
    const p = new Pseudonymizer();
    const out = p.pseudonymize('Matched at /admin/login?next=/dashboard');
    expect(out).not.toContain('/admin');
    expect(p.restore(out)).toContain('/admin');
  });

  it('is consistent — same value maps to same placeholder', () => {
    const p = new Pseudonymizer();
    const out = p.pseudonymize('1.2.3.4 and 1.2.3.4 again');
    expect(out).toBe('[IP-1] and [IP-1] again');
  });

  it('round-trips JSON', () => {
    const p = new Pseudonymizer();
    const original = JSON.stringify({ host: 'api.example.com', path: '/v1/users', ip: '203.0.113.5' });
    const pseudo = p.pseudonymize(original);
    const restored = p.restore(pseudo);
    expect(JSON.parse(restored)).toEqual(JSON.parse(original));
  });
});
