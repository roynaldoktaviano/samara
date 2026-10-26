import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Native <select> styled like <Input>. Same API as a plain <select> (value / onChange /
 * <option> children), so it is a drop-in replacement for hand-styled selects. Use the
 * Radix <Select> from ./select only when you need custom option rendering.
 */
function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div data-slot="native-select-wrapper" className={cn("relative w-full min-w-0", className?.match(/\b(w-\S+|flex-\S+|shrink-\S+|min-w-\S+|max-w-\S+)/g)?.join(" "))}>
      <select
        data-slot="native-select"
        className={cn(
          "border-input dark:bg-input/30 flex h-9 w-full min-w-0 appearance-none rounded-md border bg-transparent py-1 pl-3 pr-8 text-base shadow-xs outline-none transition-[color,box-shadow] md:text-sm",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
          "[&>option]:bg-popover [&>option]:text-popover-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

export { NativeSelect }
