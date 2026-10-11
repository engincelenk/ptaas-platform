import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Composite priority score formula:
 *   CVSS (0–10)   → 0–40 points
 *   EPSS (0–1)    → 0–30 points
 *   KEV listed    → +25 points
 *   Total cap: 100
 */
function computePriorityScore(cvss: number | null, epss: number | null, kev: boolean): number {
  const cvssPoints = Math.min((cvss ?? 0) * 4, 40);
  const epssPoints = Math.min((epss ?? 0) * 30, 30);
  const kevPoints = kev ? 25 : 0;
  return Math.min(Math.round(cvssPoints + epssPoints + kevPoints), 100);
}

@Injectable()
export class EnrichmentService {
  private readonly logger = new Logger(EnrichmentService.name);

  /** In-memory CISA KEV cache — refreshed every 24h */
  private kevCache: Set<string> = new Set();
  private kevFetchedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  /** Enrich a single finding by its ID. Returns updated finding. */
  async enrichFinding(findingId: string): Promise<void> {
    const finding = await this.prisma.finding.findUnique({
      where: { id: findingId },
      select: { id: true, cveIds: true, cvssScore: true },
    });
    if (!finding || finding.cveIds.length === 0) return;

    await this._enrichCveIds(finding.id, finding.cveIds, finding.cvssScore);
  }

  /** Enrich all findings in a scan that have CVE IDs and haven't been enriched yet. */
  async enrichScan(scanId: string): Promise<void> {
    const findings = await this.prisma.finding.findMany({
      where: { scanId, enrichedAt: null, cveIds: { isEmpty: false } },
      select: { id: true, cveIds: true, cvssScore: true },
    });

    for (const f of findings) {
      await this._enrichCveIds(f.id, f.cveIds, f.cvssScore).catch((err) =>
        this.logger.warn(`Enrichment failed for finding ${f.id}: ${err.message}`),
      );
      // Rate-limit: NVD free tier = 5 req/30s without API key
      await new Promise((r) => setTimeout(r, 700));
    }
  }

  private async _enrichCveIds(
    findingId: string,
    cveIds: string[],
    existingCvss: number | null,
  ): Promise<void> {
    const primaryCve = cveIds[0];

    const [nvd, epss, kev] = await Promise.allSettled([
      this._fetchNvd(primaryCve),
      this._fetchEpss(cveIds),
      this._isKevListed(cveIds),
    ]);

    const nvdData = nvd.status === 'fulfilled' ? nvd.value : null;
    const epssData = epss.status === 'fulfilled' ? epss.value : null;
    const kevListed = kev.status === 'fulfilled' ? kev.value : false;

    const cvssScore = nvdData?.cvssScore ?? existingCvss;
    const epssScore = epssData?.epss ?? null;
    const priorityScore = computePriorityScore(cvssScore, epssScore, kevListed);

    await this.prisma.finding.update({
      where: { id: findingId },
      data: {
        ...(nvdData?.cvssScore != null && { cvssScore: nvdData.cvssScore }),
        ...(nvdData?.cvssVector && { cvssVector: nvdData.cvssVector }),
        ...(nvdData?.description && { nvdDescription: nvdData.description }),
        epssScore,
        epssPercentile: epssData?.percentile ?? null,
        kevListed,
        priorityScore,
        enrichedAt: new Date(),
      },
    });

    this.logger.debug(`Enriched ${findingId}: CVSS=${cvssScore} EPSS=${epssScore} KEV=${kevListed} Priority=${priorityScore}`);
  }

  // ── NVD API v2 ─────────────────────────────────────────────────────────────

  private async _fetchNvd(cveId: string): Promise<{
    cvssScore: number | null;
    cvssVector: string | null;
    description: string | null;
  } | null> {
    const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${encodeURIComponent(cveId)}`;
    const headers: Record<string, string> = { 'User-Agent': 'PTaaS-Enrichment/1.0' };
    const apiKey = process.env.NVD_API_KEY;
    if (apiKey) headers['apiKey'] = apiKey;

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;

    const data = await res.json() as any;
    const vuln = data?.vulnerabilities?.[0]?.cve;
    if (!vuln) return null;

    // CVSS v3.1 preferred, fall back to v3.0, then v2.0
    const metrics = vuln.metrics ?? {};
    const cvssV31 = metrics.cvssMetricV31?.[0]?.cvssData;
    const cvssV30 = metrics.cvssMetricV30?.[0]?.cvssData;
    const cvssV2 = metrics.cvssMetricV2?.[0]?.cvssData;
    const cvssData = cvssV31 ?? cvssV30 ?? cvssV2;

    const description = vuln.descriptions?.find((d: any) => d.lang === 'en')?.value ?? null;

    return {
      cvssScore: cvssData?.baseScore ?? null,
      cvssVector: cvssData?.vectorString ?? null,
      description: description?.slice(0, 2000) ?? null,
    };
  }

  // ── FIRST EPSS API ──────────────────────────────────────────────────────────

  private async _fetchEpss(cveIds: string[]): Promise<{ epss: number; percentile: number } | null> {
    const cveParam = cveIds.slice(0, 5).join(',');
    const url = `https://api.first.org/data/v1/epss?cve=${encodeURIComponent(cveParam)}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;

    const data = await res.json() as any;
    const entry = data?.data?.[0];
    if (!entry) return null;

    return {
      epss: parseFloat(entry.epss ?? '0'),
      percentile: parseFloat(entry.percentile ?? '0'),
    };
  }

  // ── CISA KEV ───────────────────────────────────────────────────────────────

  private async _isKevListed(cveIds: string[]): Promise<boolean> {
    await this._refreshKevCache();
    return cveIds.some((id) => this.kevCache.has(id.toUpperCase()));
  }

  private async _refreshKevCache(): Promise<void> {
    const AGE_MS = 24 * 60 * 60 * 1000;
    if (this.kevFetchedAt > 0 && Date.now() - this.kevFetchedAt < AGE_MS) return;

    try {
      const url = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return;

      const data = await res.json() as any;
      const vulns: string[] = (data?.vulnerabilities ?? []).map((v: any) =>
        String(v.cveID ?? '').toUpperCase(),
      );
      this.kevCache = new Set(vulns);
      this.kevFetchedAt = Date.now();
      this.logger.log(`KEV cache refreshed: ${this.kevCache.size} entries`);
    } catch (err: unknown) {
      this.logger.warn(`KEV cache refresh failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}
