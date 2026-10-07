/** Minimum contrast between the accent and white text drawn on it (WCAG AA, normal text). */
export const MIN_ACCENT_CONTRAST = 4.5;

const HEX_COLOR = /^#([0-9a-f]{6})$/i;

function channel(value: number): number {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const rgb = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff];
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

/**
 * The surface accent from an A2UI `createSurface.theme`, or undefined to use goose's own
 * colors. Only `#rrggbb` values readable under white text are honored, so a server can't make
 * controls illegible or inject arbitrary CSS through the theme.
 */
export function resolveAccent(theme: Record<string, unknown> | undefined): string | undefined {
  const color = theme?.primaryColor;
  if (typeof color !== 'string' || !HEX_COLOR.test(color)) {
    return undefined;
  }
  return contrastWithWhite(color) >= MIN_ACCENT_CONTRAST ? color.toLowerCase() : undefined;
}
