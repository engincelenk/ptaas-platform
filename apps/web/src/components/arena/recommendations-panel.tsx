import { Lightbulb } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { categoryLabel } from '@/lib/arena-logic';
import type { ArenaRecommendation } from '@/lib/arena-types';
import { TranscriptText } from './transcript-text';

/** Always visible, also without breaches ("so bleibt es robust"). Text is untrusted -> plain text. */
export function RecommendationsPanel({ items }: { items: ArenaRecommendation[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-blue-600" /> Verbesserungsvorschläge
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Die Vorschläge zur Härtung deiner KI erscheinen hier, sobald die Auswertung je Kategorie vorliegt.
          </p>
        ) : (
          items.map((r) => (
            <div key={r.id} className="rounded-lg border p-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{r.title}</span>
                <span className="text-[11px] rounded bg-secondary px-1.5 py-0.5">{categoryLabel(r.category)}</span>
              </div>
              <TranscriptText text={r.text} className="font-sans text-sm" />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
