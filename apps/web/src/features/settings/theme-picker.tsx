import { type LucideIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group.tsx"
import { THEMES, type Theme } from "../../theme/theme.ts"
import { useTheme } from "../../theme/use-theme.ts"

const LABELS = {
  system: { label: "System", Icon: MonitorIcon },
  light: { label: "Light", Icon: SunIcon },
  dark: { label: "Dark", Icon: MoonIcon },
} as const satisfies Record<Theme, { label: string; Icon: LucideIcon }>

const isTheme = (value: string | undefined): value is Theme => THEMES.some((theme) => theme === value)

export const ThemePicker = () => {
  const { theme, chooseTheme } = useTheme()
  return (
    <ToggleGroup
      aria-labelledby="theme-label"
      value={[theme]}
      onValueChange={([next]) => isTheme(next) && chooseTheme(next)}
      variant="outline"
      size="lg"
      className="w-full"
    >
      {THEMES.map((option) => {
        const { label, Icon } = LABELS[option]
        return (
          <ToggleGroupItem key={option} value={option} className="flex-1">
            <Icon aria-hidden="true" data-icon="inline-start" />
            {label}
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )
}
