// ──────────────────────────────────────────
// Shared types across API and Web
// ──────────────────────────────────────────

export type Role = 'ADMIN' | 'SECURITY_ENGINEER' | 'DEVELOPER' | 'VIEWER';

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type ScanStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type FindingStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'FIXED'
  | 'VERIFIED'
  | 'CLOSED'
  | 'FALSE_POSITIVE'
  | 'ACCEPTED_RISK';

export type VerificationMethod = 'DNS_TXT' | 'HTTP_FILE' | 'META_TAG';

export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'FAILED';

// ── API Response shapes ──────────────────

export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  statusCode: number;
  message: string;
  timestamp: string;
  path: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ── Health ───────────────────────────────

export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  service: string;
}
