/**
 * Static mapping tables for OWASP Top 10 2021 and ISO 27001:2022 Annex A.
 * Used by ComplianceService to classify findings without external calls.
 */

export interface OwaspCategory {
  id: string;       // "A01"
  name: string;     // "Broken Access Control"
  description: string;
  iso27001Controls: string[];  // e.g. ["A.9.1", "A.9.4"]
}

export const OWASP_TOP10: OwaspCategory[] = [
  {
    id: 'A01',
    name: 'Broken Access Control',
    description: 'Restrictions on authenticated users are not properly enforced.',
    iso27001Controls: ['A.9.1.1', 'A.9.1.2', 'A.9.4.1'],
  },
  {
    id: 'A02',
    name: 'Cryptographic Failures',
    description: 'Failures related to cryptography or missing encryption.',
    iso27001Controls: ['A.10.1.1', 'A.10.1.2', 'A.14.1.3'],
  },
  {
    id: 'A03',
    name: 'Injection',
    description: 'SQL, NoSQL, OS, LDAP injection attacks.',
    iso27001Controls: ['A.14.2.1', 'A.14.2.5'],
  },
  {
    id: 'A04',
    name: 'Insecure Design',
    description: 'Missing or ineffective control design.',
    iso27001Controls: ['A.14.1.1', 'A.14.2.1'],
  },
  {
    id: 'A05',
    name: 'Security Misconfiguration',
    description: 'Insecure default configurations, unnecessary features enabled.',
    iso27001Controls: ['A.12.1.1', 'A.12.6.1', 'A.14.2.2'],
  },
  {
    id: 'A06',
    name: 'Vulnerable and Outdated Components',
    description: 'Using components with known vulnerabilities.',
    iso27001Controls: ['A.12.6.1', 'A.14.2.3'],
  },
  {
    id: 'A07',
    name: 'Identification and Authentication Failures',
    description: 'Broken authentication, session management weaknesses.',
    iso27001Controls: ['A.9.2.1', 'A.9.4.2', 'A.9.4.3'],
  },
  {
    id: 'A08',
    name: 'Software and Data Integrity Failures',
    description: 'Code and infrastructure that does not protect against integrity violations.',
    iso27001Controls: ['A.12.2.1', 'A.14.2.7'],
  },
  {
    id: 'A09',
    name: 'Security Logging and Monitoring Failures',
    description: 'Insufficient logging, monitoring, and incident response.',
    iso27001Controls: ['A.12.4.1', 'A.12.4.2', 'A.16.1.2'],
  },
  {
    id: 'A10',
    name: 'Server-Side Request Forgery',
    description: 'SSRF flaws allow attackers to induce server-side HTTP requests.',
    iso27001Controls: ['A.13.1.3', 'A.14.1.2'],
  },
];

/** CWE → OWASP Top 10 2021 mapping (subset of most common CWEs) */
export const CWE_TO_OWASP: Record<string, string> = {
  // A01 Broken Access Control
  '22': 'A01', '59': 'A01', '200': 'A01', '201': 'A01', '219': 'A01',
  '264': 'A01', '275': 'A01', '276': 'A01', '284': 'A01', '285': 'A01',
  '352': 'A01', '359': 'A01', '377': 'A01', '402': 'A01', '425': 'A01',
  '441': 'A01', '497': 'A01', '538': 'A01', '540': 'A01', '548': 'A01',
  '552': 'A01', '566': 'A01', '601': 'A01', '639': 'A01', '651': 'A01',
  '668': 'A01', '706': 'A01', '862': 'A01', '863': 'A01',
  // A02 Cryptographic Failures
  '261': 'A02', '296': 'A02', '310': 'A02', '319': 'A02', '321': 'A02',
  '322': 'A02', '323': 'A02', '324': 'A02', '325': 'A02', '326': 'A02',
  '327': 'A02', '328': 'A02', '329': 'A02', '330': 'A02', '331': 'A02',
  '335': 'A02', '336': 'A02', '337': 'A02', '338': 'A02', '340': 'A02',
  '347': 'A02', '523': 'A02', '720': 'A02', '757': 'A02', '759': 'A02',
  '760': 'A02', '780': 'A02', '818': 'A02', '916': 'A02',
  // A03 Injection
  '20': 'A03', '74': 'A03', '75': 'A03', '77': 'A03', '78': 'A03',
  '79': 'A03', '80': 'A03', '83': 'A03', '87': 'A03', '88': 'A03',
  '89': 'A03', '90': 'A03', '91': 'A03', '93': 'A03', '94': 'A03',
  '95': 'A03', '96': 'A03', '97': 'A03', '98': 'A03', '99': 'A03',
  '116': 'A03', '138': 'A03', '184': 'A03', '470': 'A03', '564': 'A03',
  '610': 'A03', '643': 'A03', '644': 'A03', '652': 'A03', '917': 'A03',
  // A05 Security Misconfiguration
  '2': 'A05', '11': 'A05', '13': 'A05', '15': 'A05', '16': 'A05',
  '260': 'A05', '315': 'A05', '520': 'A05', '526': 'A05', '537': 'A05',
  '541': 'A05', '547': 'A05', '611': 'A05', '614': 'A05', '756': 'A05',
  '942': 'A05',
  // A06 Vulnerable Components
  '937': 'A06', '1035': 'A06', '1104': 'A06',
  // A07 Auth Failures
  '255': 'A07', '259': 'A07', '287': 'A07', '288': 'A07', '290': 'A07',
  '294': 'A07', '295': 'A07', '297': 'A07', '300': 'A07', '302': 'A07',
  '304': 'A07', '306': 'A07', '307': 'A07', '346': 'A07', '384': 'A07',
  '521': 'A07', '613': 'A07', '620': 'A07', '640': 'A07', '798': 'A07',
  '940': 'A07', '1216': 'A07',
  // A08 Software Integrity
  '345': 'A08', '353': 'A08', '354': 'A08', '426': 'A08', '494': 'A08',
  '502': 'A08', '565': 'A08', '784': 'A08', '829': 'A08', '830': 'A08',
  '913': 'A08',
  // A09 Logging Failures
  '117': 'A09', '223': 'A09', '532': 'A09', '778': 'A09',
  // A10 SSRF
  '918': 'A10',
};

/** Template name keywords → OWASP category (fallback when no CWE available) */
export const TEMPLATE_KEYWORD_TO_OWASP: Array<[RegExp, string]> = [
  [/sql.?inject|sqli/i, 'A03'],
  [/xss|cross.site.script/i, 'A03'],
  [/ssrf/i, 'A10'],
  [/rce|remote.code.exec|command.inject/i, 'A03'],
  [/lfi|local.file|path.trav/i, 'A01'],
  [/open.redirect/i, 'A01'],
  [/csrf/i, 'A01'],
  [/auth.bypass|broken.auth|default.cred|weak.pass/i, 'A07'],
  [/ssl|tls|cert|crypto|cipher/i, 'A02'],
  [/misconfigur|default.config|exposed.panel|admin.panel/i, 'A05'],
  [/outdated|vulnerable.version|cve-/i, 'A06'],
  [/log.?inject|log4|log.forging/i, 'A09'],
  [/xxe|xml.inject/i, 'A03'],
  [/deserializ|unsafe.deserial/i, 'A08'],
  [/idor|insecure.direct/i, 'A01'],
  [/cors|access.control/i, 'A01'],
];

export function resolveOwaspCategory(finding: {
  cweIds?: string[];
  templateName?: string | null;
  owasp?: string | null;
}): string | null {
  // 1. Already set
  if (finding.owasp && /^A\d\d$/.test(finding.owasp)) return finding.owasp;

  // 2. CWE lookup
  for (const cweId of finding.cweIds ?? []) {
    const num = cweId.replace(/^CWE-/i, '');
    if (CWE_TO_OWASP[num]) return CWE_TO_OWASP[num];
  }

  // 3. Template name keyword
  const name = finding.templateName ?? '';
  for (const [pattern, category] of TEMPLATE_KEYWORD_TO_OWASP) {
    if (pattern.test(name)) return category;
  }

  return null;
}
