import { Injectable, BadRequestException } from '@nestjs/common';
import * as dns from 'dns';
import { SsrfGuardService } from '../ssrf/ssrf-guard.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const VERIFY_PREFIX = 'ptaas-verify';
const HTTP_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 512;

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ssrfGuard: SsrfGuardService,
  ) {}

  async verify(
    targetId: string,
    method: 'DNS_TXT' | 'HTTP_FILE' | 'META_TAG',
    orgId: string,
    userId: string,
    ip?: string,
    userAgent?: string,
  ): Promise<{ success: boolean; message: string }> {
    const target = await this.prisma.target.findFirst({
      where: { id: targetId, organizationId: orgId },
    });
    if (!target) throw new BadRequestException('Target not found');

    const expectedToken = target.verificationToken;
    const domain = extractDomain(target.value);

    let success = false;
    let message = '';

    try {
      switch (method) {
        case 'DNS_TXT':
          ({ success, message } = await this.verifyDnsTxt(domain, expectedToken));
          break;
        case 'HTTP_FILE':
          ({ success, message } = await this.verifyHttpFile(domain, expectedToken));
          break;
        case 'META_TAG':
          ({ success, message } = await this.verifyMetaTag(domain, expectedToken));
          break;
      }
    } catch (err) {
      success = false;
      message = err instanceof Error ? err.message : 'Verification error';
    }

    await this.prisma.target.update({
      where: { id: targetId },
      data: {
        verificationStatus: success ? 'VERIFIED' : 'FAILED',
        verificationMethod: method,
        verifiedAt: success ? new Date() : undefined,
        lastVerifiedAt: new Date(),
      },
    });

    await this.audit.log({
      action: success ? 'target.verified' : 'target.verification_failed',
      userId,
      organizationId: orgId,
      resource: 'target',
      resourceId: targetId,
      metadata: { method, domain, message },
      ipAddress: ip,
      userAgent,
    });

    return { success, message };
  }

  // ── DNS TXT ────────────────────────────────────────────────

  private async verifyDnsTxt(
    domain: string,
    token: string,
  ): Promise<{ success: boolean; message: string }> {
    const expected = `${VERIFY_PREFIX}=${token}`;

    let records: string[][];
    try {
      records = await dns.promises.resolveTxt(domain);
    } catch {
      return { success: false, message: `DNS TXT lookup failed for ${domain}` };
    }

    const flat = records.flat();
    const found = flat.some((r) => r === expected);

    return found
      ? { success: true, message: 'DNS TXT record verified' }
      : { success: false, message: `TXT record "${expected}" not found on ${domain}` };
  }

  // ── HTTP File ──────────────────────────────────────────────

  private async verifyHttpFile(
    domain: string,
    token: string,
  ): Promise<{ success: boolean; message: string }> {
    const url = `https://${domain}/.well-known/ptaas-verify.txt`;
    const expected = `${VERIFY_PREFIX}=${token}`;

    await this.ssrfGuard.assertSafeHost(domain);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': 'PTaaS-Verifier/1.0' },
      });

      // Reject redirects to different hosts
      if (res.url) {
        const redirectHost = new URL(res.url).hostname;
        if (redirectHost !== domain) {
          await this.ssrfGuard.assertSafeHost(redirectHost);
        }
      }

      if (!res.ok) {
        return { success: false, message: `HTTP ${res.status} from ${url}` };
      }

      // Read only the first MAX_RESPONSE_BYTES to avoid DoS
      const reader = res.body?.getReader();
      if (!reader) return { success: false, message: 'Empty response body' };

      let content = '';
      let bytes = 0;
      while (bytes < MAX_RESPONSE_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        content += new TextDecoder().decode(value);
      }
      await reader.cancel();

      const trimmed = content.trim();
      return trimmed === expected
        ? { success: true, message: 'HTTP file verified' }
        : { success: false, message: `File content mismatch. Expected: ${expected}` };
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return { success: false, message: `Request to ${url} timed out` };
      }
      return { success: false, message: (err as Error).message };
    } finally {
      clearTimeout(timeout);
    }
  }

  // ── Meta Tag ───────────────────────────────────────────────

  private async verifyMetaTag(
    domain: string,
    token: string,
  ): Promise<{ success: boolean; message: string }> {
    const url = `https://${domain}/`;

    await this.ssrfGuard.assertSafeHost(domain);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': 'PTaaS-Verifier/1.0', Accept: 'text/html' },
      });

      if (!res.ok) {
        return { success: false, message: `HTTP ${res.status} fetching homepage` };
      }

      // Read only first 64KB — meta tag must be in <head>
      const reader = res.body?.getReader();
      if (!reader) return { success: false, message: 'Empty response' };

      let html = '';
      let bytes = 0;
      while (bytes < 65_536) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        html += new TextDecoder().decode(value);
        // Stop after </head>
        if (html.includes('</head>') || html.includes('</HEAD>')) break;
      }
      await reader.cancel();

      // Look for <meta name="ptaas-verify" content="{token}">
      const pattern = new RegExp(
        `<meta[^>]+name=["']ptaas-verify["'][^>]+content=["']${escapeRegex(token)}["']`,
        'i',
      );
      const altPattern = new RegExp(
        `<meta[^>]+content=["']${escapeRegex(token)}["'][^>]+name=["']ptaas-verify["']`,
        'i',
      );

      const found = pattern.test(html) || altPattern.test(html);
      return found
        ? { success: true, message: 'Meta tag verified' }
        : { success: false, message: `ptaas-verify meta tag with token not found on ${domain}` };
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return { success: false, message: `Request to ${url} timed out` };
      }
      return { success: false, message: (err as Error).message };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function extractDomain(value: string): string {
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);
    return url.hostname;
  } catch {
    return value;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
