import { describe, expect, it } from 'vitest';
import { contrastWithWhite, resolveAccent } from '../a2uiAccent';

describe('resolveAccent', () => {
  it('honors a readable hex primary color', () => {
    expect(resolveAccent({ primaryColor: '#6D28D9' })).toBe('#6d28d9');
  });

  it.each([
    ['too light for white text', '#FDE047'],
    ['short hex', '#fff'],
    ['named color', 'red'],
    ['css injection', 'red; background: url(x)'],
    ['rgb()', 'rgb(0, 0, 0)'],
    ['non-string', 42],
  ])('ignores %s', (_, primaryColor) => {
    expect(resolveAccent({ primaryColor })).toBeUndefined();
  });

  it('ignores a missing theme', () => {
    expect(resolveAccent(undefined)).toBeUndefined();
  });
});

describe('contrastWithWhite', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastWithWhite('#000000')).toBeCloseTo(21, 1);
    expect(contrastWithWhite('#ffffff')).toBeCloseTo(1, 1);
    expect(contrastWithWhite('#767676')).toBeCloseTo(4.54, 1);
  });
});
