'use client'

import * as React from 'react'
import { Check, ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'

export interface SearchableOption {
  value: string
  label: string
  /** Second line under the label — also searchable. */
  description?: string
  /** Options sharing a group are listed under that heading, groups in first-seen order. */
  group?: string
}

/**
 * Single-select dropdown with a search box, styled like <NativeSelect>. Use it instead of
 * NativeSelect when the list is long enough that scrolling to find an item is a chore.
 * Safe inside a Dialog: the popover is modal, so the list scrolls with the mouse wheel.
 */
export function SearchableSelect({
  id, value, onChange, options, placeholder = 'Select…', searchPlaceholder = 'Search…',
  emptyText = 'No matches.', disabled, className, ...aria
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  options: SearchableOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
  'aria-label'?: string
  'aria-labelledby'?: string
}) {
  const [open, setOpen] = React.useState(false)
  const selected = options.find(o => o.value === value)

  const groups = React.useMemo(() => {
    const map = new Map<string, SearchableOption[]>()
    for (const o of options) {
      const key = o.group ?? ''
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(o)
    }
    return [...map.entries()]
  }, [options])

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          type="button" id={id} disabled={disabled} {...aria}
          aria-expanded={open} aria-haspopup="listbox"
          className={cn(
            'border-input dark:bg-input/30 relative flex h-9 w-full min-w-0 items-center rounded-md border bg-transparent py-1 pl-3 pr-8 text-left text-base shadow-xs outline-none transition-[color,box-shadow] md:text-sm',
            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>{selected?.label ?? placeholder}</span>
          <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align="start" style={{ width: 'var(--radix-popover-trigger-width)' }}>
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-64">
            <CommandEmpty>{emptyText}</CommandEmpty>
            {groups.map(([group, opts]) => (
              <CommandGroup key={group || '_'} heading={group || undefined}>
                {opts.map(o => (
                  <CommandItem
                    key={o.value}
                    // cmdk filters on value + keywords; the id suffix keeps duplicate names distinct.
                    value={`${o.label} ${o.value}`}
                    keywords={o.description ? [o.description] : undefined}
                    onSelect={() => { onChange(o.value); setOpen(false) }}
                    className="cursor-pointer items-start"
                  >
                    <Check className={cn('mt-0.5 size-4 shrink-0', o.value === value ? 'opacity-100' : 'opacity-0')} />
                    <span className="min-w-0">
                      <span className="block truncate">{o.label}</span>
                      {o.description && <span className="block truncate text-[11px] text-muted-foreground">{o.description}</span>}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
