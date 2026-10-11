// ─── Base layout ──────────────────────────────────────────────────────────────

function base(content: string, appUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>PTaaS Platform</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="min-width:100%;background:#f1f5f9">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

        <!-- Header -->
        <tr>
          <td style="padding-bottom:24px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="display:inline-flex;align-items:center;gap:8px">
                    <div style="width:32px;height:32px;background:#6366f1;border-radius:8px;display:inline-flex;align-items:center;justify-content:center">
                      <span style="color:#fff;font-size:16px;font-weight:700;line-height:1">P</span>
                    </div>
                    <span style="font-size:16px;font-weight:600;color:#1e1b4b">PTaaS Platform</span>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Card -->
        <tr>
          <td style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden">
            ${content}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 0;text-align:center">
            <p style="margin:0;font-size:12px;color:#94a3b8">
              PTaaS Platform &nbsp;·&nbsp;
              <a href="${appUrl}/settings/profile" style="color:#94a3b8;text-decoration:underline">Notification preferences</a>
              &nbsp;·&nbsp;
              <a href="${appUrl}" style="color:#94a3b8;text-decoration:underline">Dashboard</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(label: string, href: string, color = '#6366f1'): string {
  return `<a href="${href}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;line-height:1">${label}</a>`;
}

function severityColor(sev: string): string {
  const m: Record<string, string> = { CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#eab308', LOW: '#3b82f6', INFO: '#6b7280' };
  return m[sev.toUpperCase()] ?? '#6b7280';
}

function severityBadge(sev: string): string {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;color:#fff;background:${severityColor(sev)}">${sev.toUpperCase()}</span>`;
}

// ─── Templates ────────────────────────────────────────────────────────────────

export function invitationEmail(opts: {
  orgName: string;
  inviterName: string;
  role: string;
  inviteUrl: string;
  appUrl: string;
}): { subject: string; html: string } {
  const { orgName, inviterName, role, inviteUrl, appUrl } = opts;

  const content = `
    <div style="padding:32px;border-bottom:1px solid #e2e8f0;background:linear-gradient(135deg,#f8f7ff 0%,#eef2ff 100%)">
      <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#6366f1;text-transform:uppercase;letter-spacing:0.05em">Team Invitation</p>
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#1e1b4b">You've been invited to ${orgName}</h1>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6">
        <strong style="color:#1e293b">${inviterName}</strong> invited you to join
        <strong style="color:#1e293b">${orgName}</strong> on PTaaS as a <strong style="color:#1e293b">${role}</strong>.
      </p>
      <p style="text-align:center;margin:32px 0">
        ${btn('Accept Invitation', inviteUrl)}
      </p>
      <p style="margin:0;font-size:12px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:20px">
        This invitation link expires in 7 days. If you didn't expect this, you can safely ignore this email.
      </p>
    </div>`;

  return {
    subject: `You've been invited to ${orgName} on PTaaS`,
    html: base(content, appUrl),
  };
}

export function findingAssignedEmail(opts: {
  assigneeName: string;
  finderTitle: string;
  severity: string;
  projectName: string;
  findingUrl: string;
  assigner: string;
  dueDate?: string;
  appUrl: string;
}): { subject: string; html: string } {
  const { assigneeName, finderTitle, severity, projectName, findingUrl, assigner, dueDate, appUrl } = opts;

  const content = `
    <div style="padding:24px 32px;border-bottom:4px solid ${severityColor(severity)};background:#fafafa">
      <p style="margin:0 0 4px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Finding Assigned</p>
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#1e293b;line-height:1.3">${finderTitle}</h1>
      <div style="margin-top:10px">${severityBadge(severity)}</div>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 6px;font-size:14px;color:#475569">
        Hi <strong style="color:#1e293b">${assigneeName}</strong>,
      </p>
      <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6">
        <strong style="color:#1e293b">${assigner}</strong> assigned you a finding in project <strong style="color:#1e293b">${projectName}</strong>.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;width:100%;margin-bottom:24px">
        <tr><td style="padding:16px">
          <table role="presentation" cellpadding="6" cellspacing="0" width="100%">
            <tr>
              <td style="font-size:12px;color:#64748b;white-space:nowrap">Project</td>
              <td style="font-size:13px;font-weight:500;color:#1e293b">${projectName}</td>
            </tr>
            <tr>
              <td style="font-size:12px;color:#64748b;white-space:nowrap">Severity</td>
              <td>${severityBadge(severity)}</td>
            </tr>
            ${dueDate ? `<tr>
              <td style="font-size:12px;color:#64748b;white-space:nowrap">SLA Due</td>
              <td style="font-size:13px;font-weight:500;color:#dc2626">${dueDate}</td>
            </tr>` : ''}
          </table>
        </td></tr>
      </table>
      <p style="text-align:center;margin:0 0 8px">
        ${btn('View Finding', findingUrl)}
      </p>
    </div>`;

  return {
    subject: `[${severity}] Finding assigned: ${finderTitle}`,
    html: base(content, appUrl),
  };
}

export function scanCompleteEmail(opts: {
  userName: string;
  projectName: string;
  targetValue: string;
  scanType: string;
  duration: string;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  scanUrl: string;
  appUrl: string;
}): { subject: string; html: string } {
  const { userName, projectName, targetValue, scanType, duration, totalFindings, criticalCount, highCount, mediumCount, lowCount, scanUrl, appUrl } = opts;

  const noFindings = totalFindings === 0;

  const content = `
    <div style="padding:24px 32px;border-bottom:1px solid #e2e8f0;background:${noFindings ? 'linear-gradient(135deg,#f0fdf4,#dcfce7)' : 'linear-gradient(135deg,#fff7ed,#ffedd5)'}">
      <p style="margin:0 0 4px;font-size:12px;color:${noFindings ? '#16a34a' : '#ea580c'};text-transform:uppercase;letter-spacing:0.05em;font-weight:600">Scan Complete</p>
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#1e293b">${projectName}</h1>
      <p style="margin:6px 0 0;font-size:13px;color:#64748b;font-family:monospace">${targetValue}</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 20px;font-size:14px;color:#475569">
        Hi <strong style="color:#1e293b">${userName}</strong>, your <strong>${scanType}</strong> scan completed in ${duration}.
      </p>

      ${noFindings
        ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;text-align:center;margin-bottom:24px">
             <p style="margin:0;font-size:15px;font-weight:600;color:#15803d">✅ No findings detected</p>
             <p style="margin:4px 0 0;font-size:13px;color:#16a34a">Target appears clean.</p>
           </div>`
        : `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px">
             <tr>
               ${[[criticalCount,'CRITICAL','#fef2f2','#ef4444'],[highCount,'HIGH','#fff7ed','#f97316'],[mediumCount,'MEDIUM','#fefce8','#ca8a04'],[lowCount,'LOW','#eff6ff','#3b82f6']]
                 .map(([count,label,bg,color]) =>
                   `<td style="padding:4px;width:25%" align="center">
                     <div style="background:${bg};border-radius:8px;padding:12px 8px;border:1px solid ${color}22">
                       <p style="margin:0;font-size:20px;font-weight:700;color:${color}">${count}</p>
                       <p style="margin:4px 0 0;font-size:11px;color:${color};font-weight:600">${label}</p>
                     </div>
                   </td>`).join('')}
             </tr>
           </table>`}

      <p style="text-align:center;margin:0">
        ${btn('View Scan Results', scanUrl, noFindings ? '#10b981' : '#6366f1')}
      </p>
    </div>`;

  return {
    subject: noFindings
      ? `✅ Scan complete — no findings for ${targetValue}`
      : `🔍 Scan complete — ${totalFindings} finding${totalFindings !== 1 ? 's' : ''} for ${targetValue}`,
    html: base(content, appUrl),
  };
}

export function slaBreachEmail(opts: {
  userName: string;
  orgName: string;
  breachCount: number;
  criticalCount: number;
  highCount: number;
  items: Array<{ title: string; severity: string; daysOverdue: number; url: string }>;
  slaUrl: string;
  appUrl: string;
}): { subject: string; html: string } {
  const { userName, orgName, breachCount, criticalCount, highCount, items, slaUrl, appUrl } = opts;

  const rowsHtml = items.slice(0, 8).map((item) => `
    <tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:10px 0;font-size:13px;color:#1e293b;padding-right:12px">
        <a href="${item.url}" style="color:#6366f1;text-decoration:none;font-weight:500">${item.title}</a>
      </td>
      <td style="padding:10px 0;white-space:nowrap">${severityBadge(item.severity)}</td>
      <td style="padding:10px 0;white-space:nowrap;text-align:right;font-size:13px;font-weight:600;color:#ef4444">
        +${item.daysOverdue}d
      </td>
    </tr>`).join('');

  const content = `
    <div style="padding:24px 32px;border-bottom:4px solid #ef4444;background:linear-gradient(135deg,#fef2f2,#fee2e2)">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#ef4444;text-transform:uppercase;letter-spacing:0.05em">⚠️ SLA Alert</p>
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#1e293b">${breachCount} SLA Breach${breachCount !== 1 ? 'es' : ''} in ${orgName}</h1>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6">
        Hi <strong style="color:#1e293b">${userName}</strong>,
        you have <strong style="color:#ef4444">${criticalCount > 0 ? `${criticalCount} Critical` : ''}${criticalCount > 0 && highCount > 0 ? ' and ' : ''}${highCount > 0 ? `${highCount} High` : ''}</strong> finding${breachCount !== 1 ? 's' : ''} that exceed their SLA remediation window.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #f1f5f9;margin-bottom:24px">
        ${rowsHtml}
      </table>
      ${items.length > 8 ? `<p style="font-size:12px;color:#94a3b8;margin:0 0 24px">…and ${items.length - 8} more breaches</p>` : ''}
      <p style="text-align:center;margin:0">
        ${btn('View SLA Dashboard', slaUrl, '#ef4444')}
      </p>
    </div>`;

  return {
    subject: `⚠️ ${breachCount} SLA breach${breachCount !== 1 ? 'es' : ''} require immediate attention`,
    html: base(content, appUrl),
  };
}

export function passwordResetEmail(opts: {
  name: string;
  resetUrl: string;
  expiresIn: string;
  appUrl: string;
}): { subject: string; html: string } {
  const { name, resetUrl, expiresIn, appUrl } = opts;

  const content = `
    <div style="padding:32px;border-bottom:1px solid #e2e8f0;background:#fafafa;text-align:center">
      <div style="width:56px;height:56px;background:#f1f5f9;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;font-size:24px">🔐</div>
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#1e293b">Reset your password</h1>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:14px;color:#475569;line-height:1.6">
        Hi <strong style="color:#1e293b">${name}</strong>,
      </p>
      <p style="margin:0 0 28px;font-size:14px;color:#475569;line-height:1.6">
        We received a request to reset your PTaaS password. Click the button below to set a new password. This link expires in <strong>${expiresIn}</strong>.
      </p>
      <p style="text-align:center;margin:0 0 28px">
        ${btn('Reset Password', resetUrl)}
      </p>
      <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:12px 16px">
        <p style="margin:0;font-size:12px;color:#713f12">
          If you didn't request a password reset, please ignore this email. Your password will not change.
        </p>
      </div>
      <p style="margin:20px 0 0;font-size:12px;color:#94a3b8">
        Or copy this link into your browser:<br>
        <span style="color:#6366f1;word-break:break-all">${resetUrl}</span>
      </p>
    </div>`;

  return {
    subject: 'Reset your PTaaS password',
    html: base(content, appUrl),
  };
}

export function digestEmail(opts: {
  name: string;
  count: number;
  items: Array<{ type: string; title: string; body: string | null; link: string | null; createdAt: Date }>;
  appUrl: string;
}): { subject: string; html: string } {
  const { name, count, items, appUrl } = opts;

  const TYPE_ICON: Record<string, string> = {
    'scan.complete': '🔍',
    'scan.failed': '❌',
    'finding.critical': '🚨',
    'finding.overdue': '⏰',
    'target.down': '🔴',
    'threat.brief.generated': '📰',
    'member.invited': '👤',
  };

  const itemsHtml = items.map((n) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #f1f5f9">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="width:28px;vertical-align:top;font-size:16px;padding-top:1px">${TYPE_ICON[n.type] ?? '🔹'}</td>
            <td>
              <p style="margin:0;font-size:13px;font-weight:600;color:#1e293b">${n.title}</p>
              ${n.body ? `<p style="margin:3px 0 0;font-size:12px;color:#64748b;line-height:1.5">${n.body}</p>` : ''}
              ${n.link ? `<a href="${appUrl}${n.link}" style="font-size:12px;color:#6366f1;text-decoration:none;font-weight:500">View →</a>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>`).join('');

  const content = `
    <div style="padding:24px 32px;border-bottom:1px solid #e2e8f0;background:linear-gradient(135deg,#f8f7ff,#eef2ff)">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#6366f1;text-transform:uppercase;letter-spacing:0.05em">Daily Digest</p>
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#1e1b4b">
        ${count} unread notification${count !== 1 ? 's' : ''}
      </h1>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 20px;font-size:14px;color:#475569">Hi <strong style="color:#1e293b">${name}</strong>,</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #f1f5f9">
        ${itemsHtml}
      </table>
      ${count > items.length ? `<p style="font-size:12px;color:#94a3b8;margin:12px 0 0">…and ${count - items.length} more</p>` : ''}
      <p style="text-align:center;margin:28px 0 0">
        ${btn('View all notifications', `${appUrl}/dashboard`)}
      </p>
    </div>`;

  return {
    subject: `PTaaS: ${count} unread notification${count !== 1 ? 's' : ''}`,
    html: base(content, appUrl),
  };
}

export function threatBriefEmail(opts: {
  name: string;
  week: string;
  summary: string;
  highlights: Array<{ type: string; title: string; detail: string; severity?: string; cveId?: string }>;
  briefUrl: string;
  appUrl: string;
}): { subject: string; html: string } {
  const { name, week, summary, highlights, briefUrl, appUrl } = opts;

  const TYPE_ICON: Record<string, string> = {
    critical_finding: '🚨',
    kev_alert:        '⚠️',
    epss_spike:       '📈',
    recommendation:   '✅',
  };

  const highlightsHtml = highlights.map((h) => `
    <div style="padding:14px 16px;border-left:3px solid ${h.severity ? severityColor(h.severity) : '#6366f1'};background:#f8f7ff;margin-bottom:10px;border-radius:0 8px 8px 0">
      <p style="margin:0;font-size:13px;font-weight:600;color:#1e293b">${TYPE_ICON[h.type] ?? '🔹'} ${h.title}</p>
      ${h.severity ? `<div style="margin:6px 0">${severityBadge(h.severity)}</div>` : ''}
      <p style="margin:6px 0 0;font-size:12px;color:#475569;line-height:1.5">${h.detail}</p>
      ${h.cveId ? `<code style="font-size:11px;color:#6366f1;font-weight:600">${h.cveId}</code>` : ''}
    </div>`).join('');

  const content = `
    <div style="padding:24px 32px;background:linear-gradient(135deg,#1e1b4b 0%,#312e81 100%);color:#fff">
      <p style="margin:0 0 4px;font-size:12px;color:#a5b4fc;text-transform:uppercase;letter-spacing:0.05em;font-weight:600">🛡️ Weekly Threat Brief</p>
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff">Security Intelligence</h1>
      <p style="margin:6px 0 0;font-size:13px;color:#c7d2fe">Week of ${week}</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 16px;font-size:14px;color:#475569">Hi <strong style="color:#1e293b">${name}</strong>,</p>
      <div style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;padding:16px;margin-bottom:24px">
        <p style="margin:0;font-size:14px;color:#1e293b;line-height:1.7">${summary}</p>
      </div>
      <h2 style="font-size:14px;font-weight:600;color:#1e293b;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.05em">Highlights</h2>
      ${highlightsHtml || '<p style="color:#94a3b8;font-size:13px">No highlights this week.</p>'}
      <p style="text-align:center;margin:28px 0 0">
        ${btn('Read full brief →', briefUrl, '#6366f1')}
      </p>
    </div>`;

  return {
    subject: `🛡️ PTaaS Threat Brief — ${week}`,
    html: base(content, appUrl),
  };
}
