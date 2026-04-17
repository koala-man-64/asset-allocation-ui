import { FileStack, Plus } from 'lucide-react';
import { PageLoader } from '@/app/components/common/PageLoader';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { ScrollArea } from '@/app/components/ui/scroll-area';
import { cn } from '@/app/components/ui/utils';
import type { RankingSchemaSummary } from '@/types/strategy';
import { formatTimestamp } from './rankingEditorUtils';

interface RankingSchemaLibraryProps {
  schemas: RankingSchemaSummary[];
  selectedSchemaName: string | null;
  isCreatingNew: boolean;
  hasUnsavedChanges: boolean;
  draftName: string;
  isLoading: boolean;
  error: string;
  onCreateNew: () => void;
  onSelectSchema: (name: string) => void;
  className?: string;
}

export function RankingSchemaLibrary({
  schemas,
  selectedSchemaName,
  isCreatingNew,
  hasUnsavedChanges,
  draftName,
  isLoading,
  error,
  onCreateNew,
  onSelectSchema,
  className
}: RankingSchemaLibraryProps) {
  const draftLabel = draftName.trim() || 'Untitled draft';

  return (
    <Card className={cn('h-full min-h-[420px]', className)}>
      <CardHeader className="border-b border-border/40">
        <div className="space-y-1">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
            Schema Library
          </div>
          <CardTitle className="text-xl">Saved ranking schemas</CardTitle>
          <CardDescription>
            Load a published configuration or start a fresh draft without losing your place in the builder.
          </CardDescription>
        </div>
        <CardAction className="flex items-center gap-2">
          <Badge variant="secondary">{schemas.length} total</Badge>
          <Button type="button" size="sm" onClick={onCreateNew}>
            <Plus className="h-4 w-4" />
            New Draft
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex h-full flex-col gap-4 pt-5">
        <div className="rounded-2xl border border-mcm-walnut/25 bg-mcm-cream/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Current workspace
              </div>
              <div className="font-display text-lg text-foreground">{draftLabel}</div>
              <p className="text-sm text-muted-foreground">
                {isCreatingNew ? 'New schema draft in progress.' : 'Editing the selected saved schema.'}
              </p>
            </div>
            {hasUnsavedChanges ? <Badge>Unsaved</Badge> : <Badge variant="outline">Stable</Badge>}
          </div>
        </div>

        {isLoading ? (
          <PageLoader text="Loading ranking schemas..." className="h-52" />
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : schemas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-mcm-walnut/35 bg-mcm-paper/70 p-5 text-sm text-muted-foreground">
            No ranking schemas have been saved yet. Build a draft and publish it when the readiness rail is clear.
          </div>
        ) : (
          <ScrollArea className="min-h-0 flex-1 pr-3">
            <div className="space-y-3 pb-1">
              {schemas.map((schema) => {
                const isActive = !isCreatingNew && schema.name === selectedSchemaName;

                return (
                  <div
                    key={schema.name}
                    className={cn(
                      'rounded-2xl border border-mcm-walnut/20 bg-card/85 p-4 shadow-[4px_4px_0px_0px_rgba(119,63,26,0.08)] transition-colors',
                      isActive && 'border-mcm-walnut bg-mcm-cream'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        className="flex flex-1 flex-col items-start gap-1 text-left"
                        onClick={() => onSelectSchema(schema.name)}
                      >
                        <div className="flex items-center gap-2">
                          <FileStack className="h-4 w-4 text-mcm-teal" />
                          <span className="font-display text-base text-foreground">{schema.name}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {schema.description || 'No description provided.'}
                        </p>
                      </button>
                      <div className="flex flex-col items-end gap-2">
                        <Badge variant={isActive ? 'default' : 'outline'}>v{schema.version}</Badge>
                        {isActive ? <Badge variant="secondary">Active</Badge> : null}
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">
                      Last updated {formatTimestamp(schema.updated_at)}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
