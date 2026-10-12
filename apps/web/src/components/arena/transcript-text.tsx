import { sanitizeTranscript } from '@/lib/arena-logic';

/**
 * Renders untrusted transcript text. Plain text only: no HTML injection, no Markdown,
 * no auto-links, no images. React escapes the string; whitespace is preserved by CSS.
 */
export function TranscriptText({ text, className = '' }: { text: string | null; className?: string }) {
  return (
    <pre
      className={`whitespace-pre-wrap break-words font-mono text-xs leading-relaxed m-0 ${className}`}
    >
      {sanitizeTranscript(text)}
    </pre>
  );
}
