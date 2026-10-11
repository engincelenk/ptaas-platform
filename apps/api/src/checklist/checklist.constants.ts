export interface ChecklistItemDef {
  key: string;
  label: string;
  ref?: string; // OWASP Testing Guide reference
}

export interface ChecklistCategory {
  id: string;
  label: string;
  icon: string;
  items: ChecklistItemDef[];
}

export const CHECKLIST: ChecklistCategory[] = [
  {
    id: 'info_gathering',
    label: 'Information Gathering',
    icon: '🔍',
    items: [
      { key: 'ig_01', label: 'Fingerprint web server (banner, headers)', ref: 'OTG-INFO-002' },
      { key: 'ig_02', label: 'Enumerate application entry points', ref: 'OTG-INFO-006' },
      { key: 'ig_03', label: 'Map application architecture', ref: 'OTG-INFO-010' },
      { key: 'ig_04', label: 'Search engine discovery / reconnaissance', ref: 'OTG-INFO-001' },
      { key: 'ig_05', label: 'Identify authentication mechanisms', ref: 'OTG-INFO-007' },
      { key: 'ig_06', label: 'Enumerate HTTP methods', ref: 'OTG-INFO-006' },
    ],
  },
  {
    id: 'config_mgmt',
    label: 'Configuration Management',
    icon: '⚙️',
    items: [
      { key: 'cm_01', label: 'Test network/infrastructure configuration', ref: 'OTG-CONFIG-001' },
      { key: 'cm_02', label: 'Test application platform configuration', ref: 'OTG-CONFIG-002' },
      { key: 'cm_03', label: 'Test HTTP strict transport security (HSTS)', ref: 'OTG-CONFIG-007' },
      { key: 'cm_04', label: 'Review HTTP security headers', ref: 'OTG-CONFIG-010' },
      { key: 'cm_05', label: 'Test for default credentials', ref: 'OTG-CONFIG-002' },
      { key: 'cm_06', label: 'Test for sensitive data in source/comments', ref: 'OTG-INFO-005' },
    ],
  },
  {
    id: 'authn',
    label: 'Authentication Testing',
    icon: '🔐',
    items: [
      { key: 'at_01', label: 'Test credentials transported over encrypted channel', ref: 'OTG-AUTHN-001' },
      { key: 'at_02', label: 'Test for default credentials', ref: 'OTG-AUTHN-002' },
      { key: 'at_03', label: 'Test for weak lockout mechanism', ref: 'OTG-AUTHN-003' },
      { key: 'at_04', label: 'Test for bypassing authentication', ref: 'OTG-AUTHN-004' },
      { key: 'at_05', label: 'Test for remember password functionality', ref: 'OTG-AUTHN-005' },
      { key: 'at_06', label: 'Test for browser cache weakness', ref: 'OTG-AUTHN-006' },
      { key: 'at_07', label: 'Test password policy', ref: 'OTG-AUTHN-007' },
      { key: 'at_08', label: 'Test multi-factor authentication (MFA)', ref: 'OTG-AUTHN-011' },
    ],
  },
  {
    id: 'authz',
    label: 'Authorization Testing',
    icon: '🛡️',
    items: [
      { key: 'az_01', label: 'Test directory traversal / file include', ref: 'OTG-AUTHZ-001' },
      { key: 'az_02', label: 'Test for bypassing authorization schema', ref: 'OTG-AUTHZ-002' },
      { key: 'az_03', label: 'Test privilege escalation (vertical)', ref: 'OTG-AUTHZ-003' },
      { key: 'az_04', label: 'Test insecure direct object reference (IDOR)', ref: 'OTG-AUTHZ-004' },
      { key: 'az_05', label: 'Test for horizontal privilege escalation', ref: 'OTG-AUTHZ-003' },
    ],
  },
  {
    id: 'session_mgmt',
    label: 'Session Management',
    icon: '🍪',
    items: [
      { key: 'sm_01', label: 'Test cookie attributes (Secure, HttpOnly, SameSite)', ref: 'OTG-SESS-002' },
      { key: 'sm_02', label: 'Test for CSRF', ref: 'OTG-SESS-005' },
      { key: 'sm_03', label: 'Test logout / session timeout', ref: 'OTG-SESS-006' },
      { key: 'sm_04', label: 'Test for session fixation', ref: 'OTG-SESS-003' },
      { key: 'sm_05', label: 'Test for session puzzling', ref: 'OTG-SESS-008' },
      { key: 'sm_06', label: 'Test for JWT weaknesses', ref: 'OTG-SESS-010' },
    ],
  },
  {
    id: 'input_validation',
    label: 'Input Validation',
    icon: '💉',
    items: [
      { key: 'iv_01', label: 'Test for reflected XSS', ref: 'OTG-INPVAL-001' },
      { key: 'iv_02', label: 'Test for stored XSS', ref: 'OTG-INPVAL-002' },
      { key: 'iv_03', label: 'Test for SQL injection', ref: 'OTG-INPVAL-005' },
      { key: 'iv_04', label: 'Test for command injection', ref: 'OTG-INPVAL-013' },
      { key: 'iv_05', label: 'Test for path traversal', ref: 'OTG-INPVAL-012' },
      { key: 'iv_06', label: 'Test for SSRF', ref: 'OTG-INPVAL-019' },
      { key: 'iv_07', label: 'Test for XXE injection', ref: 'OTG-INPVAL-007' },
      { key: 'iv_08', label: 'Test for HTTP request smuggling', ref: 'OTG-INPVAL-022' },
    ],
  },
  {
    id: 'error_handling',
    label: 'Error Handling',
    icon: '⚠️',
    items: [
      { key: 'eh_01', label: 'Test for improper error handling / stack traces', ref: 'OTG-ERR-001' },
      { key: 'eh_02', label: 'Verify no sensitive data in error messages', ref: 'OTG-ERR-002' },
      { key: 'eh_03', label: 'Test for verbose HTTP error codes (500, etc.)', ref: 'OTG-ERR-001' },
    ],
  },
  {
    id: 'cryptography',
    label: 'Cryptography',
    icon: '🔒',
    items: [
      { key: 'cr_01', label: 'Test for weak TLS configuration', ref: 'OTG-CRYPST-001' },
      { key: 'cr_02', label: 'Test for padding oracle vulnerability', ref: 'OTG-CRYPST-002' },
      { key: 'cr_03', label: 'Verify sensitive data not stored in cleartext', ref: 'OTG-CRYPST-001' },
      { key: 'cr_04', label: 'Check certificate validity and pinning', ref: 'OTG-CRYPST-003' },
    ],
  },
  {
    id: 'business_logic',
    label: 'Business Logic',
    icon: '🧩',
    items: [
      { key: 'bl_01', label: 'Test business logic data validation', ref: 'OTG-BUSLOGIC-001' },
      { key: 'bl_02', label: 'Test for request forgery', ref: 'OTG-BUSLOGIC-005' },
      { key: 'bl_03', label: 'Test for process timing attacks', ref: 'OTG-BUSLOGIC-004' },
      { key: 'bl_04', label: 'Test workflow bypass / step-skipping', ref: 'OTG-BUSLOGIC-006' },
      { key: 'bl_05', label: 'Test upload of unexpected file types', ref: 'OTG-BUSLOGIC-008' },
    ],
  },
  {
    id: 'api_testing',
    label: 'API & Web Services',
    icon: '🔌',
    items: [
      { key: 'api_01', label: 'Test GraphQL introspection / injection', ref: 'WSTG-APIT-001' },
      { key: 'api_02', label: 'Test REST API for mass assignment', ref: 'WSTG-APIT-003' },
      { key: 'api_03', label: 'Verify API rate limiting', ref: 'WSTG-APIT-004' },
      { key: 'api_04', label: 'Test for CORS misconfiguration', ref: 'WSTG-APIT-005' },
      { key: 'api_05', label: 'Test API authentication (token leakage, replay)', ref: 'WSTG-APIT-002' },
      { key: 'api_06', label: 'Test for excessive data exposure in responses', ref: 'WSTG-APIT-003' },
    ],
  },
];

export const CHECKLIST_MAP = new Map(CHECKLIST.map((c) => [c.id, c]));
export const ITEM_MAP = new Map(
  CHECKLIST.flatMap((c) => c.items.map((i) => [i.key, { ...i, categoryId: c.id, categoryLabel: c.label }])),
);
