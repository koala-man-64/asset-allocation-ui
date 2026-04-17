import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/app/components/ui/select';
import { cn } from '@/app/components/ui/utils';
import type { RankingTransform, RankingTransformType } from '@/types/strategy';
import {
  buildEmptyTransform,
  getTransformParamConfig,
  moveItem,
  parseParamValue,
  TRANSFORM_OPTIONS
} from './rankingEditorUtils';

interface RankingTransformSequenceEditorProps {
  title: string;
  description: string;
  transforms: RankingTransform[];
  onChange: (nextValue: RankingTransform[]) => void;
  addLabel?: string;
  emptyLabel?: string;
  className?: string;
}

export function RankingTransformSequenceEditor({
  title,
  description,
  transforms,
  onChange,
  addLabel = 'Add Transform',
  emptyLabel = 'No transforms configured.',
  className
}: RankingTransformSequenceEditorProps) {
  const idPrefix = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return (
    <div className={cn('space-y-3 rounded-3xl border border-border/60 bg-background/45 p-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            {title}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => onChange([...transforms, buildEmptyTransform()])}>
          <Plus className="h-4 w-4" />
          {addLabel}
        </Button>
      </div>

      {transforms.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-mcm-walnut/35 bg-mcm-cream/60 p-4 text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <div className="space-y-3">
          {transforms.map((transform, index) => {
            const paramFields = getTransformParamConfig(transform.type);

            return (
              <div
                key={`${title}-${index}`}
                className="rounded-2xl border border-border/60 bg-card/85 p-4 shadow-[4px_4px_0px_0px_rgba(119,63,26,0.08)]"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="secondary">Step {index + 1}</Badge>
                  <div className="min-w-[220px] flex-1">
                    <Label htmlFor={`${idPrefix}-transform-${index}`}>Transform</Label>
                    <Select
                      value={transform.type}
                      onValueChange={(value) => {
                        const nextTransforms = transforms.slice();
                        nextTransforms[index] = {
                          type: value as RankingTransformType,
                          params: {}
                        };
                        onChange(nextTransforms);
                      }}
                    >
                      <SelectTrigger id={`${idPrefix}-transform-${index}`}>
                        <SelectValue placeholder="Select transform" />
                      </SelectTrigger>
                      <SelectContent>
                        {TRANSFORM_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${title} transform ${index + 1} up`}
                      onClick={() => onChange(moveItem(transforms, index, index - 1))}
                      disabled={index === 0}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${title} transform ${index + 1} down`}
                      onClick={() => onChange(moveItem(transforms, index, index + 1))}
                      disabled={index === transforms.length - 1}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onChange(transforms.filter((_, itemIndex) => itemIndex !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </Button>
                  </div>
                </div>

                {paramFields.length > 0 ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {paramFields.map((field) => (
                      <div key={field.key} className="grid gap-2">
                        <Label htmlFor={`${idPrefix}-${index}-${field.key}`}>{field.label}</Label>
                        <Input
                          id={`${idPrefix}-${index}-${field.key}`}
                          value={String(transform.params[field.key] ?? '')}
                          onChange={(event) => {
                            const nextTransforms = transforms.slice();
                            nextTransforms[index] = {
                              ...transform,
                              params: {
                                ...transform.params,
                                [field.key]: parseParamValue(event.target.value)
                              }
                            };
                            onChange(nextTransforms);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">No extra parameters required.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
