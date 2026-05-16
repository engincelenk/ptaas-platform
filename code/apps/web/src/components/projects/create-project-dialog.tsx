'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X } from 'lucide-react';
import { useCreateProject, type CreateProjectDto } from '@/hooks/use-projects';

const schema = z.object({
  name: z.string().min(2, 'Name muss mindestens 2 Zeichen haben'),
  description: z.string().optional(),
  targetUrl: z.string().url('Muss eine gültige URL sein'),
});

type FormValues = z.infer<typeof schema>;

interface CreateProjectDialogProps {
  onClose: () => void;
}

export function CreateProjectDialog({ onClose }: CreateProjectDialogProps) {
  const { mutateAsync, isPending } = useCreateProject();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormValues) {
    const dto: CreateProjectDto = {
      name: data.name,
      description: data.description,
      targets: [data.targetUrl],
    };
    await mutateAsync(dto);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Neues Projekt</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <input
              {...register('name')}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Mein Projekt"
            />
            {errors.name && (
              <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Ziel-URL</label>
            <input
              {...register('targetUrl')}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="https://example.com"
            />
            {errors.targetUrl && (
              <p className="mt-1 text-xs text-destructive">{errors.targetUrl.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Beschreibung <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              {...register('description')}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Kurze Projektbeschreibung..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? 'Erstelle...' : 'Projekt erstellen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
