/**
 * RAM-only pseudonymizer — never persists the mapping.
 *
 * Replaces sensitive customer data (domains, IPs, paths) with deterministic
 * placeholders before sending context to the Claude API.
 * Re-substitutes placeholders in the AI response before storing.
 *
 * One instance per AI call — do not share across requests.
 */
export class Pseudonymizer {
  private readonly forward = new Map<string, string>();
  private readonly reverse = new Map<string, string>();
  private readonly counters: Record<string, number> = {
    DOMAIN: 0,
    IP: 0,
    PATH: 0,
  };

  private assign(value: string, type: string): string {
    const existing = this.forward.get(value);
    if (existing) return existing;
    const placeholder = `[${type}-${++this.counters[type]}]`;
    this.forward.set(value, placeholder);
    this.reverse.set(placeholder, value);
    return placeholder;
  }

  pseudonymize(text: string): string {
    // Order matters: IPs before domains to avoid partial matches
    // IPv4 addresses
    text = text.replace(
      /\b(\d{1,3}\.){3}\d{1,3}\b/g,
      (ip) => this.assign(ip, 'IP'),
    );

    // Fully-qualified domains (2+ labels)
    text = text.replace(
      /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi,
      (domain) => this.assign(domain.toLowerCase(), 'DOMAIN'),
    );

    // URL paths starting with /
    text = text.replace(
      /(?<![a-z0-9])\/[a-zA-Z0-9/_.\-?=&%]+/g,
      (path) => this.assign(path, 'PATH'),
    );

    return text;
  }

  restore(text: string): string {
    // Replace all placeholders with original values
    let result = text;
    for (const [placeholder, original] of this.reverse) {
      // Escape the placeholder for use in regex
      const escaped = placeholder.replace(/[[\]]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'g'), original);
    }
    return result;
  }
}
