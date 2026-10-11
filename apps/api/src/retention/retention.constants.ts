export const RETENTION_QUEUE = 'retention-queue';

// Retention periods in milliseconds
export const RETENTION_MS = {
  findings:  24 * 30 * 24 * 60 * 60 * 1000,  // 24 months
  evidence:  12 * 30 * 24 * 60 * 60 * 1000,  // 12 months
  auditLogs: 36 * 30 * 24 * 60 * 60 * 1000,  // 36 months
} as const;
