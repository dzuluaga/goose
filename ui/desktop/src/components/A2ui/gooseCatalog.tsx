import {
  basicCatalog,
  createComponentImplementation,
  type ReactComponentImplementation,
} from '@a2ui/react/v0_9';
import { Catalog } from '@a2ui/web_core/v0_9';
import { ButtonApi, TextApi } from '@a2ui/web_core/v0_9/basic_catalog';
import { Button } from '../ui/button';

const BUTTON_VARIANTS = {
  primary: 'default',
  borderless: 'ghost',
} as const;

const GooseButton = createComponentImplementation(ButtonApi, ({ props, buildChild }) => (
  <Button
    size="sm"
    variant={BUTTON_VARIANTS[props.variant as keyof typeof BUTTON_VARIANTS] ?? 'outline'}
    onClick={props.action}
    disabled={props.isValid === false}
  >
    {props.child ? buildChild(props.child) : null}
  </Button>
));

const TEXT_STYLES: Record<string, string> = {
  h1: 'text-2xl font-semibold',
  h2: 'text-xl font-semibold',
  h3: 'text-lg font-semibold',
  h4: 'text-base font-semibold',
  h5: 'text-sm font-semibold',
  caption: 'text-xs text-text-secondary',
  body: 'text-sm',
};

/** Renders text literally: A2UI payloads are untrusted, so no Markdown or HTML. */
const GooseText = createComponentImplementation(TextApi, ({ props }) => {
  const text = typeof props.text === 'string' ? props.text : String(props.text ?? '');
  return <span className={TEXT_STYLES[props.variant ?? 'body'] ?? TEXT_STYLES.body}>{text}</span>;
});

const OVERRIDES = new Map<string, ReactComponentImplementation>([
  [ButtonApi.name, GooseButton],
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
