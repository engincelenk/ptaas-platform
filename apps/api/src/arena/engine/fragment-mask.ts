import { fragmentSimilarity } from './judge/deterministic';
import { decodeEncodedSegments, normalizeUnicode, rot13 } from './judge/normalize';

const MIN_FRAGMENT_CHARS = 12;
const WORD = /[\p{L}\p{N}]+/gu;

function wordsOf(s: string): string[] {
  return normalizeUnicode(s)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replaces customer-known system prompt fragments in a text by `[REDACTED:FRAGMENT#i]`.
 * Judging runs on the raw text first; this is applied afterwards, before persistence / SSE / findings.
 *  - exact match (case-insensitive, whitespace-flexible),
 *  - fuzzy match: every word window that shares a word trigram with the fragment is masked (longest window),
 *  - encoded leaks (ROT13 / base64 / hex) cannot be located: the whole text is replaced.
 */
export function maskFragments(input: string, fragments: string[]): string {
  let text = input;
  fragments.forEach((frag, i) => {
    const trimmed = frag.trim();
    if (normalizeUnicode(trimmed).replace(/[^a-z0-9]/g, '').length < MIN_FRAGMENT_CHARS) return;
    const label = `[REDACTED:FRAGMENT#${i}]`;

    // 1) exact, whitespace-flexible
    const pattern = trimmed.split(/\s+/).map(escapeRe).join('\\s+');
    text = text.replace(new RegExp(pattern, 'gi'), label);

    // 2) fuzzy windows via word n-grams
    const fw = wordsOf(trimmed);
    const n = Math.min(3, fw.length);
    if (n > 0) {
      const grams = new Set<string>();
      for (let k = 0; k + n <= fw.length; k++) grams.add(fw.slice(k, k + n).join(' '));
      const toks = [...text.matchAll(WORD)].map((m) => ({
        start: m.index ?? 0,
        end: (m.index ?? 0) + m[0].length,
        norm: normalizeUnicode(m[0]).replace(/[^a-z0-9]/g, ''),
      }));
      const marked = new Array<boolean>(toks.length).fill(false);
      for (let k = 0; k + n <= toks.length; k++) {
        if (grams.has(toks.slice(k, k + n).map((t) => t.norm).join(' '))) for (let j = k; j < k + n; j++) marked[j] = true;
      }
      // Replace from the end so offsets stay valid; merge runs of marked words.
      let k = toks.length - 1;
      while (k >= 0) {
        if (!marked[k]) {
          k--;
          continue;
        }
        let s = k;
        while (s - 1 >= 0 && marked[s - 1]) s--;
        text = text.slice(0, toks[s].start) + label + text.slice(toks[k].end);
        k = s - 1;
      }
    }

    // 3) encoded leaks
    const encodedHit =
      fragmentSimilarity(trimmed, rot13(normalizeUnicode(text))) >= 0.7 ||
      decodeEncodedSegments(text).some((d) => fragmentSimilarity(trimmed, d) >= 0.7);
    if (encodedHit) text = `[REDACTED:FRAGMENT#${i} (encoded leak)]`;
  });
  return text;
}
