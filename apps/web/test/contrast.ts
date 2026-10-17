type Rgb = readonly [number, number, number]
export type Theme = 0 | 1

const encode = (linear: number) =>
  linear <= 0.003_130_8 ? 12.92 * linear : 1.055 * Math.max(linear, 0) ** (1 / 2.4) - 0.055

const decode = (channel: number) => (channel <= 0.040_45 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)

const clamp = (channel: number) => Math.min(Math.max(channel, 0), 1)

export const srgbOfOklch = (lightness: number, chroma: number, hue: number): Rgb => {
  const a = chroma * Math.cos((hue * Math.PI) / 180)
  const b = chroma * Math.sin((hue * Math.PI) / 180)
  const l = (lightness + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3
  const m = (lightness - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3
  const s = (lightness - 0.089_484_177_5 * a - 1.291_485_548 * b) ** 3
  return [
    clamp(encode(4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s)),
    clamp(encode(-1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s)),
    clamp(encode(-0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_614_701 * s)),
  ]
}

const luminance = ([red, green, blue]: Rgb) => 0.2126 * decode(red) + 0.7152 * decode(green) + 0.0722 * decode(blue)

export const over = (top: Rgb, alpha: number, under: Rgb): Rgb => [
  alpha * top[0] + (1 - alpha) * under[0],
  alpha * top[1] + (1 - alpha) * under[1],
  alpha * top[2] + (1 - alpha) * under[2],
]

export const contrast = (one: Rgb, other: Rgb) => {
  const [lighter, darker] = [luminance(one), luminance(other)].toSorted((a, b) => b - a)
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05)
}

const oklchOf = (values: string) => {
  const [lightness = 0, chroma = 0, hue = 0] = values.split(/\s+/u).map(Number)
  return srgbOfOklch(lightness, chroma, hue)
}

const COLOUR = /--([a-z-]+):\s*light-dark\(oklch\(([^)]+)\),\s*oklch\(([^)]+)\)\)/gu
const ALIAS = /--([a-z-]+):\s*var\(--([a-z-]+)\)/gu

export const themeTokens = (css: string) => {
  const colours = new Map(
    [...css.matchAll(COLOUR)].map(
      ([, name = "", light = "", dark = ""]) => [name, [oklchOf(light), oklchOf(dark)]] as const,
    ),
  )
  const aliases = new Map([...css.matchAll(ALIAS)].map(([, name = "", alias = ""]) => [name, alias]))
  return (name: string, theme: Theme): Rgb => {
    const colour = colours.get(aliases.get(name) ?? name)
    if (colour === undefined) throw new Error(`No colour token --${name}`)
    return colour[theme]
  }
}
