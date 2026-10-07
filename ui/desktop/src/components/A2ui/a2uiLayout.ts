import type { CSSProperties } from 'react';

/** A2UI `weight` is flex-grow within a Row or Column; components that override the
 * basic catalog apply it themselves. */
export function weightStyle(weight: unknown): CSSProperties | undefined {
  return typeof weight === 'number' ? { flex: weight, minWidth: 0 } : undefined;
}
