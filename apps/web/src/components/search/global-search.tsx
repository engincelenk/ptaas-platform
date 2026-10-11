'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, FolderOpen, Bug, Target, Scan, Clock, ArrowRight } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SearchResults {
  projects: Array<{ id: string; name: string; description: string | null }>;
  findings: Array<{ id: string; title: string; severity: string; status: string; cveIds: string[]; projectId: string; project: { name: string } }>;
  targets: Array<{ id: string; value: string; type: string; verificationStatus: string; projectId: string; project: { name: string } }>;
  scans: Array<{ id: string; type: string; status: string; startedAt: string | null; projectId: string; target: { value: string } }>;
}

interface RecentItem {
  href: string;
  label: string;
  sub?: string;
  type: string;
}

interface SectionItem {
  href: string;
  label: string;
  sub?: string;
  severity?: string;
  icon: string;
}

interface Section {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: SectionItem[];
}

const RECENT_KEY = 'ptaas_recent_pages';
const MAX_RECENT = 6;

function getRecent(): RecentItem[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); } catch { return []; }
}

export function trackVisit(item: RecentItem) {
  try {
    const prev = getRecent().filter((r) => r.href !== item.href);
    localStorage.setItem(RECENT_KEY, JSON.stringify([item, ...prev].slice(0, MAX_RECENT)));
  } catch {}
}

// ── Highlight matching text ────────────────────────────────────────────────────

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 dark:bg-yellow-800/60 text-inherit rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ── Severity badge ─────────────────────────────────────────────────────────────

const SEV_DOT: Record<string, string> = {
  CRITICAL: 'bg-red-500', HIGH: 'bg-orange-500', MEDIUM: 'bg-yellow-500',
  LOW: 'bg-blue-500', INFO: 'bg-gray-400',
};

// ── Main component ─────────────────────────────────────────────────────────────

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Open on Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setRecent(getRecent());
      setTimeout(() => inputRef.current?.focus(), 30);
    } else {
      setQuery('');
      setResults(null);
      setActiveIdx(0);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults(null); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await apiClient.get<SearchResults>(`/search?q=${encodeURIComponent(query)}&limit=4`);
        setResults(data);
        setActiveIdx(0);
      } catch {} finally { setLoading(false); }
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Build flat list of navigable items
  const items = results
    ? [
        ...results.projects.map((p) => ({ href: `/projects/${p.id}`, label: p.name, sub: p.description ?? '', icon: 'project' as const, q: query })),
        ...results.findings.map((f) => ({ href: `/projects/${f.projectId}/findings/${f.id}`, label: f.title, sub: `${f.severity} · ${f.project.name}`, icon: 'finding' as const, severity: f.severity, q: query })),
        ...results.targets.map((t) => ({ href: `/projects/${t.projectId}/targets/${t.id}`, label: t.value, sub: `${t.type} · ${t.project.name}`, icon: 'target' as const, q: query })),
        ...results.scans.map((s) => ({ href: `/projects/${s.projectId}`, label: `${s.type} scan — ${s.target.value}`, sub: s.status, icon: 'scan' as const, q: query })),
      ]
    : [];

  const navigate = useCallback((href: string, label: string, sub?: string) => {
    router.push(href);
    setOpen(false);
  }, [router]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const list = query.length >= 2 ? items : recent.map((r) => ({ href: r.href, label: r.label, sub: r.sub }));
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, list.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && list[activeIdx]) { navigate(list[activeIdx].href, list[activeIdx].label, list[activeIdx].sub); }
  };

  const totalResults = results
    ? results.projects.length + results.findings.length + results.targets.length + results.scans.length
    : 0;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[10vh] px-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-xl bg-background rounded-2xl border border-border shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search projects, findings, targets…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading && <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />}
          <kbd className="hidden sm:inline-flex text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">Esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {/* No query — show recent */}
          {query.length < 2 && recent.length > 0 && (
            <div>
              <div className="px-4 pt-3 pb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> Recent
              </div>
              {recent.map((item, i) => (
                <button
                  key={item.href}
                  onClick={() => navigate(item.href, item.label)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${i === activeIdx ? 'bg-accent' : 'hover:bg-muted/50'}`}
                >
                  <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{item.label}</p>
                    {item.sub && <p className="text-xs text-muted-foreground truncate">{item.sub}</p>}
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          )}

          {/* Search results */}
          {query.length >= 2 && results && totalResults === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No results for <strong>"{query}"</strong>
            </div>
          )}

          {results && totalResults > 0 && (() => {
            let globalIdx = 0;
            const sections: Section[] = [
              { title: 'Projects', icon: FolderOpen, items: results.projects.map((p) => ({ href: `/projects/${p.id}`, label: p.name, sub: p.description ?? undefined, icon: 'project' })) },
              { title: 'Findings', icon: Bug, items: results.findings.map((f) => ({ href: `/projects/${f.projectId}/findings/${f.id}`, label: f.title, sub: `${f.severity} · ${f.project.name}`, severity: f.severity, icon: 'finding' })) },
              { title: 'Targets', icon: Target, items: results.targets.map((t) => ({ href: `/projects/${t.projectId}/targets/${t.id}`, label: t.value, sub: `${t.type} · ${t.project.name}`, icon: 'target' })) },
              { title: 'Scans', icon: Scan, items: results.scans.map((s) => ({ href: `/projects/${s.projectId}`, label: `${s.type} — ${s.target.value}`, sub: s.status, icon: 'scan' })) },
            ].filter((s) => s.items.length > 0);

            return sections.map((section) => (
              <div key={section.title}>
                <div className="px-4 pt-3 pb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <section.icon className="h-3.5 w-3.5" />
                  {section.title}
                </div>
                {section.items.map((item) => {
                  const myIdx = globalIdx++;
                  return (
                    <button
                      key={item.href + myIdx}
                      onClick={() => navigate(item.href, item.label, item.sub)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${myIdx === activeIdx ? 'bg-accent' : 'hover:bg-muted/50'}`}
                    >
                      {item.severity && (
                        <span className={`h-2 w-2 rounded-full shrink-0 mt-0.5 ${SEV_DOT[item.severity] ?? 'bg-gray-400'}`} />
                      )}
                      {!item.severity && <div className="w-2 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">
                          <Highlight text={item.label} query={query} />
                        </p>
                        {item.sub && <p className="text-xs text-muted-foreground truncate">{item.sub}</p>}
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </button>
                  );
                })}
              </div>
            ));
          })()}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-border text-xs text-muted-foreground bg-muted/30">
          <span><kbd className="border border-border rounded px-1">↑↓</kbd> navigate</span>
          <span><kbd className="border border-border rounded px-1">↵</kbd> open</span>
          <span><kbd className="border border-border rounded px-1">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

// ── Trigger button (in nav) ────────────────────────────────────────────────────

export function SearchTrigger() {
  return (
    <button
      onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted/50 transition-colors w-full"
    >
      <Search className="h-3.5 w-3.5" />
      <span className="flex-1 text-left">Search…</span>
      <kbd className="hidden sm:inline-flex text-xs border border-border rounded px-1.5 py-0.5">⌘K</kbd>
    </button>
  );
}
