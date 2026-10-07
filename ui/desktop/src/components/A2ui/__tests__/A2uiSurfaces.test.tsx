import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { A2uiSurfaces } from '../A2uiSurfaces';
import type { A2uiMessage } from '../a2uiPayload';
import { confirmationSurface } from './fixtures';

const FALLBACK = 'Interactive content unavailable';

describe('A2uiSurfaces', () => {
  it('renders the surface from the messages', async () => {
    render(<A2uiSurfaces messages={confirmationSurface('Ship v2.3?')} fallback={FALLBACK} />);

    expect(await screen.findByText('Ship v2.3?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm deploy' })).toBeInTheDocument();
    expect(screen.queryByText(FALLBACK)).not.toBeInTheDocument();
  });

  it('reports actions with their resolved context', async () => {
    const onAction = vi.fn();
    render(
      <A2uiSurfaces
        messages={confirmationSurface('Ship v2.3?')}
        onAction={onAction}
        fallback={FALLBACK}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Confirm deploy' }));

    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(onAction.mock.calls[0][0]).toMatchObject({
      name: 'confirm',
      surfaceId: 'deploy',
      sourceComponentId: 'confirm',
      context: { release: 'v2.3' },
      timestamp: expect.any(String),
    });
  });

  it('falls back when a component is not in the catalog', () => {
    const messages: A2uiMessage[] = [
      confirmationSurface('x')[0],
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: 'deploy',
          components: [{ id: 'root', component: 'ScriptRunner', code: 'alert(1)' }],
        },
      },
    ];

    render(<A2uiSurfaces messages={messages} fallback={FALLBACK} />);

    expect(screen.getByText(FALLBACK)).toBeInTheDocument();
  });

  it('renders markup in text as plain text', async () => {
    render(
      <A2uiSurfaces
        messages={confirmationSurface('<img src=x onerror=alert(1)> **bold**')}
        fallback={FALLBACK}
      />
    );

    expect(await screen.findByText('<img src=x onerror=alert(1)> **bold**')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('strong')).toBeNull();
  });
});
