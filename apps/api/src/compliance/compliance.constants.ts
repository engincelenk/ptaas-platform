// Static mapping: OWASP category + CWE → compliance controls
// Each entry maps a "trigger" (owasp or cwe prefix) to one or more controls

export type Framework = 'pci-dss' | 'iso27001' | 'soc2' | 'gdpr' | 'nis2';

export interface ComplianceControl {
  id: string;         // e.g. "PCI-6.3.1"
  name: string;       // short name
  description: string;
  framework: Framework;
}

export interface ControlMapping {
  owaspCategories?: string[];  // e.g. ["A03", "A01"]
  cwePatterns?: string[];       // prefix match e.g. ["CWE-79", "CWE-89"]
  controlIds: string[];
}

// ─── PCI-DSS v4.0 Controls ───────────────────────────────────────────────────
export const PCI_CONTROLS: ComplianceControl[] = [
  { id: 'PCI-1.3',   framework: 'pci-dss', name: 'Network Access Controls',       description: 'Restrict inbound and outbound traffic to only that necessary.' },
  { id: 'PCI-2.2',   framework: 'pci-dss', name: 'Secure Configurations',         description: 'System components are configured and managed securely.' },
  { id: 'PCI-3.4',   framework: 'pci-dss', name: 'Protect Stored Cardholder Data',description: 'Primary account numbers are secured using strong cryptography.' },
  { id: 'PCI-4.2',   framework: 'pci-dss', name: 'Encryption in Transit',         description: 'Strong cryptography is used for PAN transmission over open networks.' },
  { id: 'PCI-5.2',   framework: 'pci-dss', name: 'Anti-Malware',                  description: 'Anti-malware mechanisms are deployed and maintained.' },
  { id: 'PCI-6.2',   framework: 'pci-dss', name: 'Bespoke Software Security',     description: 'All bespoke and custom software is developed securely.' },
  { id: 'PCI-6.3',   framework: 'pci-dss', name: 'Security Vulnerabilities',      description: 'Security vulnerabilities are identified and addressed.' },
  { id: 'PCI-6.4',   framework: 'pci-dss', name: 'Web-Facing Applications',       description: 'Public-facing web applications are protected against attacks.' },
  { id: 'PCI-7.2',   framework: 'pci-dss', name: 'Access Control Systems',        description: 'Access to system components is appropriately defined and assigned.' },
  { id: 'PCI-8.2',   framework: 'pci-dss', name: 'User Authentication',           description: 'All users are assigned unique credentials; authentication is enforced.' },
  { id: 'PCI-8.3',   framework: 'pci-dss', name: 'Strong Authentication',         description: 'Authentication for users and administrators is secure.' },
  { id: 'PCI-10.2',  framework: 'pci-dss', name: 'Audit Logging',                 description: 'Audit logs capture all access to system components.' },
  { id: 'PCI-11.3',  framework: 'pci-dss', name: 'Penetration Testing',           description: 'External and internal penetration testing is performed regularly.' },
  { id: 'PCI-12.3',  framework: 'pci-dss', name: 'Risk Management',               description: 'Risks to the cardholder data environment are identified and managed.' },
];

// ─── ISO 27001:2022 Annexes ───────────────────────────────────────────────────
export const ISO_CONTROLS: ComplianceControl[] = [
  { id: 'ISO-A.8.7',  framework: 'iso27001', name: 'Protection Against Malware',    description: 'Protection against malware shall be implemented.' },
  { id: 'ISO-A.8.8',  framework: 'iso27001', name: 'Management of Technical Vulnerabilities', description: 'Information about technical vulnerabilities shall be obtained and managed.' },
  { id: 'ISO-A.8.9',  framework: 'iso27001', name: 'Configuration Management',      description: 'Configurations including security configurations shall be managed.' },
  { id: 'ISO-A.8.20', framework: 'iso27001', name: 'Network Security',              description: 'Networks and network devices shall be secured and managed.' },
  { id: 'ISO-A.8.23', framework: 'iso27001', name: 'Web Filtering',                 description: 'Access to external websites shall be managed.' },
  { id: 'ISO-A.8.24', framework: 'iso27001', name: 'Use of Cryptography',           description: 'Rules for the use of cryptography shall be defined and implemented.' },
  { id: 'ISO-A.8.25', framework: 'iso27001', name: 'Secure Development Lifecycle',  description: 'Rules for the secure development of software shall be established.' },
  { id: 'ISO-A.8.26', framework: 'iso27001', name: 'Application Security',          description: 'Security requirements for application development shall be identified.' },
  { id: 'ISO-A.8.28', framework: 'iso27001', name: 'Secure Coding',                 description: 'Secure coding principles shall be applied to software development.' },
  { id: 'ISO-A.5.15', framework: 'iso27001', name: 'Access Control',                description: 'Rules to control physical and logical access shall be established.' },
  { id: 'ISO-A.5.17', framework: 'iso27001', name: 'Authentication Information',    description: 'Allocation and management of authentication information shall be controlled.' },
  { id: 'ISO-A.8.15', framework: 'iso27001', name: 'Logging',                       description: 'Logs that record activities, exceptions, and events shall be produced and managed.' },
  { id: 'ISO-A.8.16', framework: 'iso27001', name: 'Monitoring Activities',         description: 'Networks, systems and applications shall be monitored for anomalous behaviour.' },
];

// ─── SOC2 Trust Services Criteria ────────────────────────────────────────────
export const SOC2_CONTROLS: ComplianceControl[] = [
  { id: 'CC6.1',  framework: 'soc2', name: 'Logical & Physical Access Controls', description: 'The entity implements logical access security software, infrastructure, and architectures.' },
  { id: 'CC6.2',  framework: 'soc2', name: 'Authentication',                     description: 'Prior to issuing system credentials, the entity registers and authorizes new users.' },
  { id: 'CC6.3',  framework: 'soc2', name: 'Role-Based Access',                  description: 'The entity authorizes, modifies, or removes access to data, software, functions, and infrastructure.' },
  { id: 'CC6.6',  framework: 'soc2', name: 'Threat & Vulnerability Management',  description: 'The entity implements controls to prevent or detect and act upon the introduction of unauthorized or malicious software.' },
  { id: 'CC6.7',  framework: 'soc2', name: 'Transmission & Receipt Controls',    description: 'The entity restricts the transmission, movement, and removal of information to authorized users.' },
  { id: 'CC6.8',  framework: 'soc2', name: 'Prevent Unauthorized Software',      description: 'The entity implements controls to prevent or detect and act upon the introduction of unauthorized or malicious software.' },
  { id: 'CC7.1',  framework: 'soc2', name: 'System Monitoring',                  description: 'The entity uses detection and monitoring procedures to identify changes to configurations.' },
  { id: 'CC7.2',  framework: 'soc2', name: 'Security Incidents',                 description: 'The entity monitors system components and the operation of controls.' },
  { id: 'CC8.1',  framework: 'soc2', name: 'Change Management',                  description: 'The entity authorizes, designs, develops or acquires, configures, documents, tests, approves, and implements changes to infrastructure.' },
  { id: 'A1.2',   framework: 'soc2', name: 'Availability — Environmental',       description: 'The entity authorizes, designs, develops or acquires infrastructure to meet availability commitments.' },
];

// ─── NIS2 Directive Articles (EU 2022/2555) ───────────────────────────────────
export const NIS2_CONTROLS: ComplianceControl[] = [
  { id: 'NIS2-Art21-a', framework: 'nis2', name: 'Risk Analysis & IS Policies',      description: 'Policies on risk analysis and information system security (Art. 21.2.a).' },
  { id: 'NIS2-Art21-b', framework: 'nis2', name: 'Incident Handling',                description: 'Incident handling — prevention, detection, analysis, containment (Art. 21.2.b).' },
  { id: 'NIS2-Art21-c', framework: 'nis2', name: 'Business Continuity',              description: 'Business continuity, backup management, disaster recovery (Art. 21.2.c).' },
  { id: 'NIS2-Art21-d', framework: 'nis2', name: 'Supply Chain Security',            description: 'Security in the supply chain including relations between entities (Art. 21.2.d).' },
  { id: 'NIS2-Art21-e', framework: 'nis2', name: 'Secure Acquisition & Development', description: 'Security in network/information system acquisition, development, maintenance (Art. 21.2.e).' },
  { id: 'NIS2-Art21-f', framework: 'nis2', name: 'Vuln Handling & Disclosure',       description: 'Policies and procedures for vulnerability handling and disclosure (Art. 21.2.f).' },
  { id: 'NIS2-Art21-g', framework: 'nis2', name: 'Cybersecurity Risk Management',    description: 'Effectiveness assessment of cybersecurity risk management measures (Art. 21.2.g).' },
  { id: 'NIS2-Art21-h', framework: 'nis2', name: 'Cyber Hygiene & Training',         description: 'Basic cyber hygiene practices and cybersecurity training (Art. 21.2.h).' },
  { id: 'NIS2-Art21-i', framework: 'nis2', name: 'Cryptography',                     description: 'Policies and procedures on the use of cryptography and encryption (Art. 21.2.i).' },
  { id: 'NIS2-Art21-j', framework: 'nis2', name: 'Human Resources Security',         description: 'Human resources security, access control policies and asset management (Art. 21.2.j).' },
  { id: 'NIS2-Art21-k', framework: 'nis2', name: 'Multi-Factor Authentication',      description: 'Use of MFA/continuous authentication and secure communications (Art. 21.2.k).' },
  { id: 'NIS2-Art23',   framework: 'nis2', name: 'Incident Reporting',               description: 'Significant incidents must be reported to CSIRT within 24h, full report within 72h (Art. 23).' },
];

// ─── GDPR Articles ────────────────────────────────────────────────────────────
export const GDPR_CONTROLS: ComplianceControl[] = [
  { id: 'GDPR-5',   framework: 'gdpr', name: 'Principles of Processing',          description: 'Personal data shall be processed lawfully, fairly and in a transparent manner.' },
  { id: 'GDPR-25',  framework: 'gdpr', name: 'Data Protection by Design',         description: 'Data protection principles shall be implemented into processing systems by design and default.' },
  { id: 'GDPR-32',  framework: 'gdpr', name: 'Security of Processing',            description: 'Appropriate technical measures shall ensure a level of security appropriate to the risk.' },
  { id: 'GDPR-33',  framework: 'gdpr', name: 'Breach Notification',               description: 'Personal data breaches shall be notified to the supervisory authority within 72 hours.' },
  { id: 'GDPR-35',  framework: 'gdpr', name: 'Data Protection Impact Assessment', description: 'A DPIA shall be carried out prior to high-risk processing.' },
];

export const ALL_CONTROLS: ComplianceControl[] = [
  ...PCI_CONTROLS,
  ...ISO_CONTROLS,
  ...SOC2_CONTROLS,
  ...GDPR_CONTROLS,
  ...NIS2_CONTROLS,
];

export const CONTROL_MAP = new Map(ALL_CONTROLS.map((c) => [c.id, c]));

// ─── Mapping rules ────────────────────────────────────────────────────────────
export const MAPPINGS: ControlMapping[] = [
  // Injection (A03, SQL/XSS/etc)
  { owaspCategories: ['A03'], cwePatterns: ['CWE-79','CWE-89','CWE-90','CWE-94','CWE-116'],
    controlIds: ['PCI-6.3','PCI-6.4','ISO-A.8.25','ISO-A.8.26','ISO-A.8.28','CC6.6','CC8.1','GDPR-32'] },

  // Broken Access Control (A01)
  { owaspCategories: ['A01'], cwePatterns: ['CWE-285','CWE-639','CWE-284','CWE-862','CWE-863'],
    controlIds: ['PCI-7.2','PCI-8.2','ISO-A.5.15','CC6.1','CC6.3','GDPR-25','GDPR-32'] },

  // Cryptographic Failures (A02)
  { owaspCategories: ['A02'], cwePatterns: ['CWE-326','CWE-327','CWE-328','CWE-330','CWE-311'],
    controlIds: ['PCI-3.4','PCI-4.2','ISO-A.8.24','CC6.7','GDPR-32','GDPR-5'] },

  // Insecure Design (A04)
  { owaspCategories: ['A04'], controlIds: ['PCI-6.2','ISO-A.8.25','ISO-A.8.26','CC8.1','GDPR-25'] },

  // Security Misconfiguration (A05)
  { owaspCategories: ['A05'], cwePatterns: ['CWE-16','CWE-732','CWE-209'],
    controlIds: ['PCI-2.2','ISO-A.8.9','CC7.1','CC8.1'] },

  // Vulnerable and Outdated Components (A06)
  { owaspCategories: ['A06'], cwePatterns: ['CWE-1035','CWE-937'],
    controlIds: ['PCI-6.3','ISO-A.8.8','CC6.6','CC6.8'] },

  // Authentication Failures (A07)
  { owaspCategories: ['A07'], cwePatterns: ['CWE-287','CWE-307','CWE-308','CWE-521','CWE-522'],
    controlIds: ['PCI-8.2','PCI-8.3','ISO-A.5.17','CC6.2','GDPR-32'] },

  // Software and Data Integrity Failures (A08)
  { owaspCategories: ['A08'], cwePatterns: ['CWE-502','CWE-345'],
    controlIds: ['PCI-6.2','ISO-A.8.25','ISO-A.8.28','CC6.8','CC8.1'] },

  // Security Logging and Monitoring (A09)
  { owaspCategories: ['A09'], cwePatterns: ['CWE-778','CWE-223'],
    controlIds: ['PCI-10.2','ISO-A.8.15','ISO-A.8.16','CC7.1','CC7.2'] },

  // Server-Side Request Forgery (A10)
  { owaspCategories: ['A10'], cwePatterns: ['CWE-918'],
    controlIds: ['PCI-1.3','ISO-A.8.20','ISO-A.8.23','CC6.6'] },

  // Network / general
  { cwePatterns: ['CWE-400','CWE-770'],
    controlIds: ['PCI-1.3','ISO-A.8.20','A1.2'] },

  // GDPR — any personal data exposure
  { cwePatterns: ['CWE-359','CWE-201','CWE-212'],
    controlIds: ['GDPR-5','GDPR-25','GDPR-32','GDPR-33','GDPR-35'] },

  // NIS2 — vulnerability management maps to Art. 21.e/.f/.g
  { owaspCategories: ['A06'], cwePatterns: ['CWE-1035','CWE-937'],
    controlIds: ['NIS2-Art21-e','NIS2-Art21-f','NIS2-Art21-g'] },

  // NIS2 — injection / application security
  { owaspCategories: ['A03','A04','A05'],
    controlIds: ['NIS2-Art21-e','NIS2-Art21-g'] },

  // NIS2 — auth failures → MFA + HR security
  { owaspCategories: ['A07'], cwePatterns: ['CWE-287','CWE-521','CWE-522'],
    controlIds: ['NIS2-Art21-j','NIS2-Art21-k'] },

  // NIS2 — cryptography failures
  { owaspCategories: ['A02'], cwePatterns: ['CWE-326','CWE-327','CWE-328'],
    controlIds: ['NIS2-Art21-i'] },

  // NIS2 — logging & monitoring → incident handling
  { owaspCategories: ['A09'],
    controlIds: ['NIS2-Art21-b','NIS2-Art21-g','NIS2-Art23'] },
];

export function getControlIdsForFinding(owasp: string | null, cweIds: string[]): Set<string> {
  const result = new Set<string>();
  for (const m of MAPPINGS) {
    const owaspMatch = owasp && m.owaspCategories?.includes(owasp);
    const cweMatch   = m.cwePatterns?.some((p) => cweIds.some((c) => c.startsWith(p)));
    if (owaspMatch || cweMatch) {
      m.controlIds.forEach((id) => result.add(id));
    }
  }
  return result;
}
