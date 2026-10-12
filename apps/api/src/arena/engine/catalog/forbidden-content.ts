/**
 * The arena only ever runs harmless stand-in goals (emit a marker, reveal a canary or known prompt
 * fragments). This keyword guard keeps the catalog AND every generated attack inside that scope.
 * It is intentionally simple and conservative.
 */
const FORBIDDEN: RegExp[] = [
  /\b(bio-?weapons?|chemical weapons?|nerve agents?|cbrn|nuclear weapons?|dirty bombs?|explosives?|bomb[- ]making|build(?:ing)? a bomb)\b/i,
  /\b(malware|ransomware|keyloggers?|spyware|botnets?|trojans?|rootkits?|computer viruses?|exploit code|reverse shell)\b/i,
  /\b(csam|child (?:sexual|porn\w*)|child abuse material|minors? (?:sexual|nude))\b/i,
  /\b(suicide|self[- ]harm|kill myself|end my life|how to (?:overdose|cut))\b/i,
  /\b(racial slurs?|hate speech|ethnic cleansing|genocide)\b/i,
  /\b(ddos|denial[- ]of[- ]service|stress[- ]test the server|flood (?:the )?(?:server|endpoint))\b/i,
  /\b(phishing (?:email|mail|kit)|credit card numbers?|social security numbers?|steal (?:credentials|passwords))\b/i,
  /\b(drop table|rm -rf|delete all (?:records|users|data)|wire (?:the )?money|transfer funds)\b/i,
  // Agent guard (stage 3): attacks and goals must never ask for destructive, financial or sending actions.
  /\b(?:delete|remove|drop|wipe|erase|destroy|truncate|purge|overwrite)\s+(?:all\s+|the\s+|every\s+|any\s+|my\s+|a\s+|an\s+)?(?:files?|records?|rows?|users?|accounts?|databases?|tables?|data|entries|mailboxes?|backups?|repositor(?:y|ies)|buckets?|volumes?|instances?|logs?)\b/i,
  /\b(?:transfer|wire|send|pay|refund|charge|withdraw|deposit)\s+(?:the\s+|a\s+|some\s+|any\s+)?(?:money|funds?|payments?|amounts?|euros?|dollars?|eur|usd|crypto\w*|bitcoin)\b/i,
  /\b(?:make|issue|process|initiate)\s+(?:a\s+|an\s+|the\s+)?(?:payments?|refunds?|purchases?|orders?|transfers?|transactions?)\b/i,
  /\bsend\s+(?:an?\s+|the\s+)?(?:e-?mails?|mails?|messages?|sms|texts?|notifications?|tweets?|slack|invites?)\b/i,
  /\b(?:execute|run|launch|spawn)\s+(?:a\s+|the\s+|this\s+|any\s+)?(?:shell|command|script|bash|powershell|cmd|binary|code|program|process)\b/i,
  /\b(?:sudo|chmod|chown|curl\s+http|wget\s+http|exec\(|eval\()/i,
  /\b(?:grant|escalate|elevate)\s+(?:admin|root|privileges?|permissions?|access)\b/i,
  /\b(?:book|cancel|buy|sell|subscribe|unsubscribe|deploy|publish|post)\s+(?:a\s+|the\s+|an\s+|my\s+)?(?:order|ticket|flight|stock|shares?|subscription|release|build|tweet|article)\b/i,
];

export function containsForbiddenContent(text: string): boolean {
  return FORBIDDEN.some((re) => re.test(text));
}
