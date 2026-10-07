import { createContext, useContext, type CSSProperties } from 'react';
import {
  basicCatalog,
  createComponentImplementation,
  type ReactComponentImplementation,
} from '@a2ui/react/v0_9';
import { Catalog } from '@a2ui/web_core/v0_9';
import { ButtonApi, CardApi, IconApi, TextApi } from '@a2ui/web_core/v0_9/basic_catalog';
import { cn } from '../../utils';
import { Button } from '../ui/button';
import { resolveAccent } from './a2uiAccent';
import { ICONS, toneOf, type IconTone } from './gooseIcons';

const BUTTON_VARIANTS = {
  primary: 'default',
  borderless: 'ghost',
} as const;

const GooseButton = createComponentImplementation(ButtonApi, ({ props, buildChild }) => (
  <Button
    size="sm"
    variant={BUTTON_VARIANTS[props.variant as keyof typeof BUTTON_VARIANTS] ?? 'outline'}
    className={cn(props.variant === 'primary' && 'a2ui-button-primary')}
    onClick={props.action}
    disabled={props.isValid === false}
  >
    {props.child ? buildChild(props.child) : null}
  </Button>
));

const TEXT_STYLES: Record<string, string> = {
  h1: 'text-3xl font-semibold tracking-tight',
  h2: 'text-2xl font-semibold tracking-tight',
  h3: 'text-lg font-semibold',
  h4: 'text-base font-semibold',
  h5: 'text-sm font-medium',
  caption: 'text-xs text-text-secondary',
  body: 'text-sm',
};

/** Renders text literally: A2UI payloads are untrusted, so no Markdown or HTML. */
const GooseText = createComponentImplementation(TextApi, ({ props }) => {
  const text = typeof props.text === 'string' ? props.text : String(props.text ?? '');
  return <span className={TEXT_STYLES[props.variant ?? 'body'] ?? TEXT_STYLES.body}>{text}</span>;
});

const InsideCard = createContext(false);

/**
 * A top-level card carries the surface accent: a top band, and a variable its children use.
 * A card inside a card renders as a tinted tile, so servers can group content without
 * stacking bordered cards.
 */
const GooseCard = createComponentImplementation(CardApi, ({ props, buildChild, context }) => {
  const nested = useContext(InsideCard);
  const child = props.child ? buildChild(props.child) : null;
  const weight: CSSProperties | undefined =
    typeof props.weight === 'number' ? { flex: props.weight, minWidth: 0 } : undefined;
  if (nested) {
    return (
      <div className="a2ui-tile rounded-lg p-3" style={weight}>
        {child}
      </div>
    );
  }
  const accent = resolveAccent(context.theme);
  return (
    <div
      className="a2ui-card relative overflow-hidden rounded-xl border border-border-primary bg-background-primary shadow-sm"
      style={{ ...weight, ...(accent && ({ '--a2ui-accent': accent } as CSSProperties)) }}
      data-accent={accent ? '' : undefined}
    >
      <div className="a2ui-card-band h-1" />
      <div className="p-5">
        <InsideCard.Provider value>{child}</InsideCard.Provider>
      </div>
    </div>
  );
});

/** Solid badges: goose's semantic colors are pastels, so glyphs are dark for contrast. */
const TONE_STYLES: Record<IconTone, string> = {
  success: 'bg-background-success text-[#18181b]',
  warning: 'bg-background-warning text-[#18181b]',
  danger: 'bg-background-danger text-[#18181b]',
  info: 'bg-background-info text-[#18181b]',
  accent: 'a2ui-icon-accent',
};

const GooseIcon = createComponentImplementation(IconApi, ({ props }) => {
  const name = typeof props.name === 'string' ? props.name : '';
  const Glyph = ICONS[name];
  if (!Glyph) {
    return null;
  }
  return (
    <span
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-full',
        TONE_STYLES[toneOf(name)]
      )}
    >
      <Glyph className="size-4" aria-hidden />
    </span>
  );
});

const OVERRIDES = new Map<string, ReactComponentImplementation>([
  [ButtonApi.name, GooseButton],
  [CardApi.name, GooseCard],
  [IconApi.name, GooseIcon],
  [TextApi.name, GooseText],
]);

/**
 * The A2UI basic catalog drawn with goose components. It keeps the basic catalog's id, so
 * servers target it exactly as they would the reference renderer.
 */
export const gooseCatalog = new Catalog<ReactComponentImplementation>(
  basicCatalog.id,
  basicCatalog.protocolVersion,
  [...basicCatalog.components.values()].map(
    (component) => OVERRIDES.get(component.name) ?? component
  ),
  [...basicCatalog.functions.values()],
  basicCatalog.themeSchema,
  basicCatalog.instructions
);
