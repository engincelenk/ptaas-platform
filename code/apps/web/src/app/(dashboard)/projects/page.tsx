'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Globe, AlertTriangle, Loader2 } from 'lucide-react';
import { useProjects } from '@/hooks/use-projects';
import { useApiAuth } from '@/hooks/use-api-auth';
import { CreateProjectDialog } from '@/components/projects/create-project-dialog';

export default function ProjectsPage() {
  useApiAuth();
  const { data: projects, isLoading, error } = useProjects();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Projekte</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Verwalte deine Pentest-Ziele
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          Neues Projekt
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Lade Projekte...</span>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Projekte konnten nicht geladen werden.
        </div>
      )}

      {projects && projects.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Globe className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-4 text-sm font-medium">Noch keine Projekte</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Erstelle dein erstes Projekt um mit dem Scanning zu beginnen.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Projekt erstellen
          </button>
        </div>
      )}

      {projects && projects.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="group rounded-lg border border-border bg-card p-5 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-medium text-foreground group-hover:text-primary transition-colors">
                    {project.name}
                  </h3>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {project.targets[0]}
                  </p>
                </div>
                {(project._count?.findings ?? 0) > 0 && (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-orange-500" />
                )}
              </div>

              {project.description && (
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                  {project.description}
                </p>
              )}

              <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                <span>{project._count?.scans ?? 0} Scans</span>
                <span>{project._count?.findings ?? 0} Findings</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreate && <CreateProjectDialog onClose={() => setShowCreate(false)} />}
    </div>
  );
}
