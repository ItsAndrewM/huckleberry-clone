import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group"
import type { VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { createContext, use } from "react"
import { toggleVariants } from "@/components/ui/toggle"

type ToggleGroupVariants = VariantProps<typeof toggleVariants>

const ToggleGroupContext = createContext<ToggleGroupVariants>({ size: "default", variant: "default" })

function ToggleGroup({
  className,
  variant,
  size,
  children,
  ...props
}: ToggleGroupPrimitive.Props & ToggleGroupVariants) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      className={cn("group/toggle-group flex w-fit flex-row items-center gap-1 rounded-lg", className)}
      {...props}
    >
      <ToggleGroupContext value={{ variant, size }}>{children}</ToggleGroupContext>
    </ToggleGroupPrimitive>
  )
}

function ToggleGroupItem({
  className,
  children,
  variant = "default",
  size = "default",
  ...props
}: TogglePrimitive.Props & ToggleGroupVariants) {
  const context = use(ToggleGroupContext)
  const itemVariant = context.variant ?? variant
  const itemSize = context.size ?? size
  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      data-variant={itemVariant}
      data-size={itemSize}
      className={cn(
        "shrink-0 focus:z-10 focus-visible:z-10",
        toggleVariants({ variant: itemVariant, size: itemSize }),
        className,
      )}
      {...props}
    >
      {children}
    </TogglePrimitive>
  )
}

export { ToggleGroup, ToggleGroupItem }
