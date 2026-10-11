export const SCAN_QUEUE = 'scan-queue';

export type ScanTypeValue = 'QUICK' | 'FULL' | 'WEB_CRAWL' | 'API_SCAN' | 'RETEST';

export interface ScanJobData {
  scanId: string;
  targetId: string;
  targetValue: string;
  targetType: string;
  projectId: string;
  organizationId: string;
  scanType: ScanTypeValue;
  // Nuclei options (QUICK / FULL)
  templateCategories: string[];
  excludePaths: string[];
  rateLimit: number;
  // ZAP options (WEB_CRAWL / API_SCAN)
  crawlDepth?: number;
  openApiSpec?: string;   // URL or inline YAML/JSON
  // Auth
  hasCredentials: boolean;
  // Custom scan policy (M14)
  policyId?: string;
  policyNucleiTags?: string[];
  policyNucleiSeverities?: string[];
  policyExcludedTemplates?: string[];
  policyMaxDurationSeconds?: number;
  policyRateLimit?: number;
  // Retest options (M18)
  retestFindingIds?: string[];
  retestTemplateId?: string;
  retestMatchedAt?: string;
}
