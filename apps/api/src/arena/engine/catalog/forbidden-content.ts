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
];

export function containsForbiddenContent(text: string): boolean {
  return FORBIDDEN.some((re) => re.test(text));
}
