import { Switch as SwitchPrimitive } from '@base-ui/react/switch'

import { cn } from '@/lib/utils'

/**
 * Switch — wraps Base UI's Switch. Base UI owns the controlled/uncontrolled
 * state, keyboard/ARIA, and the hidden form input (a sibling, not illegally
 * nested inside the button). Style via the `data-[checked]` / `data-[unchecked]`
 * state attributes.
 */
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-7 w-12 shrink-0 cursor-pointer items-center border-4 border-border bg-background',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[checked]:border-primary data-[unchecked]:bg-background',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none block h-4 w-4 data-[checked]:bg-primary data-[unchecked]:bg-muted-foreground',
          'data-[checked]:translate-x-6 data-[unchecked]:translate-x-1',
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
