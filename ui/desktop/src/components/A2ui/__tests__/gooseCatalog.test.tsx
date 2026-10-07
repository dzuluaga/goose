import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { basicCatalog } from '@a2ui/react/v0_9';
import { A2uiSurfaces } from '../A2uiSurfaces';
import type { A2uiMessage } from '../a2uiPayload';
import { gooseCatalog } from '../gooseCatalog';
import { confirmationSurface } from './fixtures';

function themedCard(theme: Record<string, unknown> | undefined): A2uiMessage[] {
  return [
    {
      version: 'v0.9',
      createSurface: { surfaceId: 'card', catalogId: basicCatalog.id, ...(theme && { theme }) },
    },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId: 'card',
        components: [
          { id: 'root', component: 'Card', child: 'body' },
          { id: 'body', component: 'Row', children: ['ok', 'warn', 'other'] },
          { id: 'ok', component: 'Icon', name: 'check' },
          { id: 'warn', component: 'Icon', name: 'warning' },
          { id: 'other', component: 'Icon', name: 'upload' },
        ],
      },
    },
  ];
}

describe('gooseCatalog', () => {
  it('keeps the basic catalog id and every basic component', () => {
    expect(gooseCatalog.id).toBe(basicCatalog.id);
    expect([...gooseCatalog.components.keys()].sort()).toEqual(
      [...basicCatalog.components.keys()].sort()
    );
  });

  it('replaces Button, Card, Icon and Text with goose implementations', () => {
    const replaced = [...gooseCatalog.components.keys()].filter(
      (name) => gooseCatalog.components.get(name) !== basicCatalog.components.get(name)
    );

    expect(replaced.sort()).toEqual(['Button', 'Card', 'Icon', 'Text']);
  });

  it('renders a primary button with goose styling and an inheriting label', async () => {
    const messages = confirmationSurface('Ship v2.3?');
    const update = messages[1].updateComponents as { components: Record<string, unknown>[] };
    update.components = update.components.map((component) =>
      component.id === 'confirm' ? { ...component, variant: 'primary' } : component
    );

    render(<A2uiSurfaces messages={messages} fallback="fallback" />);

    const button = await screen.findByRole('button', { name: 'Confirm deploy' });
    expect(button.className).toContain('bg-background-inverse');
    expect(button.className).toContain('a2ui-button-primary');
    expect(screen.getByText('Confirm deploy').className).not.toContain('text-text-primary');
  });

  it('gives the card a readable theme accent', () => {
    const { container } = render(
      <A2uiSurfaces messages={themedCard({ primaryColor: '#6D28D9' })} fallback="fallback" />
    );

    const card = container.querySelector<HTMLElement>('.a2ui-card');
    expect(card?.dataset.accent).toBe('');
    expect(card?.style.getPropertyValue('--a2ui-accent')).toBe('#6d28d9');
  });

  it('ignores an unreadable theme color', () => {
    const { container } = render(
      <A2uiSurfaces messages={themedCard({ primaryColor: '#FDE047' })} fallback="fallback" />
    );

    const card = container.querySelector<HTMLElement>('.a2ui-card');
    expect(card?.dataset.accent).toBeUndefined();
    expect(card?.style.getPropertyValue('--a2ui-accent')).toBe('');
  });

  it('draws a card inside a card as a weighted tile without its own band', () => {
    const messages: A2uiMessage[] = [
      { version: 'v0.9', createSurface: { surfaceId: 'tiles', catalogId: basicCatalog.id } },
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: 'tiles',
          components: [
            { id: 'root', component: 'Card', child: 'row' },
            { id: 'row', component: 'Row', children: ['tile'] },
            { id: 'tile', component: 'Card', weight: 2, child: 'value' },
            { id: 'value', component: 'Text', text: '412' },
          ],
        },
      },
    ];

    const { container } = render(<A2uiSurfaces messages={messages} fallback="fallback" />);

    expect(container.querySelectorAll('.a2ui-card')).toHaveLength(1);
    expect(container.querySelectorAll('.a2ui-card-band')).toHaveLength(1);
    const tile = container.querySelector<HTMLElement>('.a2ui-tile');
    expect(tile?.textContent).toBe('412');
    expect(tile?.style.flexGrow).toBe('2');
  });

  it('uses the accessibility label as the button name', async () => {
    const messages = confirmationSurface('Ship v2.3?');
    const update = messages[1].updateComponents as { components: Record<string, unknown>[] };
    update.components = update.components.map((component) =>
      component.id === 'confirm'
        ? { ...component, accessibility: { label: 'Deploy api-gateway v2.3 to production' } }
        : component
    );

    render(<A2uiSurfaces messages={messages} fallback="fallback" />);

    expect(
      await screen.findByRole('button', { name: 'Deploy api-gateway v2.3 to production' })
    ).toBeInTheDocument();
  });

  it('draws icons inside tiles as plain glyphs, not badges', () => {
    const messages: A2uiMessage[] = [
      { version: 'v0.9', createSurface: { surfaceId: 'tiles', catalogId: basicCatalog.id } },
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: 'tiles',
          components: [
            { id: 'root', component: 'Card', child: 'tile' },
            { id: 'tile', component: 'Card', child: 'tag' },
            { id: 'tag', component: 'Icon', name: 'star' },
          ],
        },
      },
    ];

    const { container } = render(<A2uiSurfaces messages={messages} fallback="fallback" />);

    expect(container.querySelector('.a2ui-tile svg')).not.toBeNull();
    expect(container.querySelector('.a2ui-tile span.rounded-full')).toBeNull();
  });

  it('tints icons by meaning', () => {
    const { container } = render(
      <A2uiSurfaces messages={themedCard(undefined)} fallback="fallback" />
    );

    const badges = [...container.querySelectorAll('.a2ui-card span.rounded-full')];
    expect(badges.map((badge) => badge.className)).toEqual([
      expect.stringContaining('bg-background-success'),
      expect.stringContaining('bg-background-warning'),
      expect.stringContaining('a2ui-icon-accent'),
    ]);
  });
});
