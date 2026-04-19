import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/app/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { cn } from '@/app/components/ui/utils';
import type { StrategySummary } from '@/types/strategy';

interface PortfolioStrategyPickerProps {
  sleeveId: string;
  selectedStrategyName: string;
  strategies: readonly StrategySummary[];
  disabled?: boolean;
  onSelect: (strategy: StrategySummary) => void;
}

export function PortfolioStrategyPicker({
  sleeveId,
  selectedStrategyName,
  strategies,
  disabled,
  onSelect
}: PortfolioStrategyPickerProps) {
  const [open, setOpen] = useState(false);
  const selectedStrategy = useMemo(
    () => strategies.find((strategy) => strategy.name === selectedStrategyName) ?? null,
    [selectedStrategyName, strategies]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={`Select strategy for ${sleeveId}`}
          className="w-full justify-between"
          disabled={disabled}
        >
          <span className="truncate">{selectedStrategy?.name || selectedStrategyName || 'Select strategy'}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[28rem] p-0" align="start">
        <Command shouldFilter>
          <CommandInput placeholder="Search strategies" />
          <CommandList>
            <CommandEmpty>No strategies match the current search.</CommandEmpty>
            <CommandGroup heading="Strategy Library">
              {strategies.map((strategy) => (
                <CommandItem
                  key={strategy.name}
                  value={`${strategy.name} ${strategy.type} ${strategy.description || ''}`}
                  onSelect={() => {
                    onSelect(strategy);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'h-4 w-4',
                      strategy.name === selectedStrategyName ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{strategy.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {strategy.description || strategy.type}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
