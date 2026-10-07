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
import { A2uiActionPending } from './a2uiActionState';
import { ICONS, toneOf, type IconTone } from './gooseIcons';

const BUTTON_VARIANTS = {
  primary: 'default',
  borderless: 'ghost',
} as const;

/** Disabled while an action is pending, so a second click can't send it twice. */
const GooseButton = createComponentImplementation(ButtonApi, ({ props, buildChild }) => {
  const pending = useContext(A2uiActionPending);
  const label =
    typeof props.accessibility?.label === 'string' ? props.accessibility.label : undefined;
  return (
    <Button
      size="sm"
      variant={BUTTON_VARIANTS[props.variant as keyof typeof BUTTON_VARIANTS] ?? 'outline'}
      className={cn('h-7 px-3 text-[13px]', props.variant === 'primary' && 'a2ui-button-primary')}
      onClick={props.action}
      disabled={props.isValid === false || pending}
      aria-label={label}
    >
      {props.child ? buildChild(props.child) : null}
    </Button>
  );
});

const TEXT_STYLES: Record<string, string> = {
  h1: 'text-2xl font-semibold tracking-tight',
  h2: 'text-xl font-semibold tracking-tight',
  h3: 'text-base font-semibold',
  h4: 'text-sm font-semibold',
  h5: 'text-[13px] font-medium',
  caption: 'text-xs text-text-secondary',
  body: 'text-sm',
};

/** Renders text literally: A2UI payloads are untrusted, so no Markdown or HTML. */
const GooseText = createComponentImplementation(TextApi, ({ props }) => {
  const text = typeof props.text === 'string' ? props.text : String(props.text ?? '');
  const style = TEXT_STYLES[props.variant ?? 'body'] ?? TEXT_STYLES.body;
  return <span className={cn('tabular-nums', style)}>{text}</span>;
});

type CardLevel = 'top' | 'card' | 'tile';
const CardLevelContext = createContext<CardLevel>('top');

/**
 * A top-level card carries the surface accent: a top band, and a variable its children use.
 * A card inside a card renders as a tinted tile, so servers can group content without
 * stacking bordered cards.
 */
const GooseCard = createComponentImplementation(CardApi, ({ props, buildChild, context }) => {
  const level = useContext(CardLevelContext);
  const child = props.child ? buildChild(props.child) : null;
  const weight: CSSProperties | undefined =
    typeof props.weight === 'number' ? { flex: props.weight, minWidth: 0 } : undefined;
  if (level !== 'top') {
    return (
      <div className="a2ui-tile rounded-lg px-3 py-2.5" style={weight}>
        <CardLevelContext.Provider value="tile">{child}</CardLevelContext.Provider>
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
      <div className="a2ui-card-band h-[3px]" />
      <div className="p-4">
        <CardLevelContext.Provider value="card">{child}</CardLevelContext.Provider>
      </div>
    </div>
  );
});

/** Solid badges: goose's semantic colors are pastels, so glyphs are dark for contrast. */
const BADGE_TONES: Record<IconTone, string> = {
  success: 'bg-background-success text-[#18181b]',
  warning: 'bg-background-warning text-[#18181b]',
  danger: 'bg-background-danger text-[#18181b]',
  info: 'bg-background-info text-[#18181b]',
  accent: 'a2ui-icon-accent',
};

/** Inside tiles, icons sit inline with text as plain glyphs instead of badges. */
const GLYPH_TONES: Record<IconTone, string> = {
  success: 'text-text-success',
  warning: 'text-text-warning',
  danger: 'text-text-danger',
  info: 'text-text-info',
  accent: 'a2ui-glyph-accent',
};

const GooseIcon = createComponentImplementation(IconApi, ({ props }) => {
  const inTile = useContext(CardLevelContext) === 'tile';
  const name = typeof props.name === 'string' ? props.name : '';
  const Glyph = ICONS[name];
  if (!Glyph) {
    return null;
  }
  const tone = toneOf(name);
  if (inTile) {
    return <Glyph className={cn('size-3.5 shrink-0', GLYPH_TONES[tone])} aria-hidden />;
  }
  return (
    <span
      className={cn(
        'inline-flex size-6 shrink-0 items-center justify-center rounded-full',
        BADGE_TONES[tone]
      )}
    >
      <Glyph className="size-3.5" aria-hidden />
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
