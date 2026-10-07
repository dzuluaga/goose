import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { basicCatalog } from '@a2ui/react/v0_9';
import { A2uiSurfaces } from '../A2uiSurfaces';
import { gooseCatalog } from '../gooseCatalog';
import { confirmationSurface } from './fixtures';

describe('gooseCatalog', () => {
  it('keeps the basic catalog id and every basic component', () => {
    expect(gooseCatalog.id).toBe(basicCatalog.id);
    expect([...gooseCatalog.components.keys()].sort()).toEqual(
      [...basicCatalog.components.keys()].sort()
    );
  });

  it('replaces only Button and Text with goose implementations', () => {
    const replaced = [...gooseCatalog.components.keys()].filter(
      (name) => gooseCatalog.components.get(name) !== basicCatalog.components.get(name)
    );

    expect(replaced.sort()).toEqual(['Button', 'Text']);
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
    expect(screen.getByText('Confirm deploy').className).not.toContain('text-text-primary');
  });
});
