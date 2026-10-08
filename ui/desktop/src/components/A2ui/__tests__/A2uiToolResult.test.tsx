import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { basicCatalog } from '@a2ui/react/v0_9';
import { IntlTestWrapper } from '../../../i18n/test-utils';
import A2uiToolResult from '../A2uiToolResult';
import type { A2uiMessage } from '../a2uiPayload';
import { a2uiResource, confirmationSurface, titleUpdate } from './fixtures';

const callMcpAppTool = vi.fn();
vi.mock('../../../acp/mcp-apps', () => ({
  callMcpAppTool: (...args: unknown[]) => callMcpAppTool(...args),
}));

const ACTION_TARGET = { sessionId: 'session-1', extensionName: 'deploys' };

const FALLBACK_TEXT = 'Ship v2.3? Waiting for the user to confirm.';

function renderResult({
  actionTarget,
  messages = confirmationSurface('Ship v2.3?'),
}: {
  actionTarget?: typeof ACTION_TARGET;
  messages?: A2uiMessage[];
}) {
  render(
    <IntlTestWrapper>
      <A2uiToolResult
        initialMessages={messages}
        fallbackText={FALLBACK_TEXT}
        fallback="fallback text"
        source="deploys"
        actionTarget={actionTarget}
      />
    </IntlTestWrapper>
  );
}

function noteSurface(): A2uiMessage[] {
  return [
    { version: 'v0.9', createSurface: { surfaceId: 'note', catalogId: basicCatalog.id } },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId: 'note',
        components: [
          { id: 'root', component: 'TextField', label: 'Note', value: { path: '/note' } },
        ],
      },
    },
  ];
}

function showAs(view: 'Card' | 'Text') {
  fireEvent.click(screen.getByRole('button', { name: view }));
}

async function clickConfirm() {
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm deploy' }));
}

describe('A2uiToolResult', () => {
  beforeEach(() => {
    callMcpAppTool.mockReset();
  });

  it('sends the action to the originating extension with the spec fields only', async () => {
    callMcpAppTool.mockResolvedValue({ content: [], isError: false });
    renderResult({ actionTarget: ACTION_TARGET });

    await clickConfirm();

    await vi.waitFor(() => expect(callMcpAppTool).toHaveBeenCalledTimes(1));
    const [sessionId, extensionName, tool, args] = callMcpAppTool.mock.calls[0];
    expect([sessionId, extensionName, tool]).toEqual(['session-1', 'deploys', 'a2ui_action']);
    expect(Object.keys(args).sort()).toEqual([
      'context',
      'name',
      'sourceComponentId',
      'surfaceId',
      'timestamp',
    ]);
    expect(args).toMatchObject({ name: 'confirm', context: { release: 'v2.3' } });
  });

  it('applies the A2UI messages returned by the action', async () => {
    callMcpAppTool.mockResolvedValue({
      content: [a2uiResource([titleUpdate('Deployed v2.3')])],
      isError: false,
    });
    renderResult({ actionTarget: ACTION_TARGET });

    await clickConfirm();

    expect(await screen.findByText('Deployed v2.3')).toBeInTheDocument();
  });

  it('shows an inline error when the action is rejected', async () => {
    callMcpAppTool.mockRejectedValue(new Error('app tool calls require auto mode'));
    renderResult({ actionTarget: ACTION_TARGET });

    await clickConfirm();

    expect(await screen.findByRole('alert')).toHaveTextContent('app tool calls require auto mode');
    expect(screen.getByRole('button', { name: 'Confirm deploy' })).toBeInTheDocument();
  });

  it('disables actions and shows progress until the server replies', async () => {
    let reply: (value: unknown) => void = () => {};
    callMcpAppTool.mockReturnValue(new Promise((resolve) => (reply = resolve)));
    renderResult({ actionTarget: ACTION_TARGET });

    await clickConfirm();

    expect(await screen.findByText('Working…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm deploy' })).toBeDisabled();

    reply({ content: [{ type: 'text', text: 'Deployed v2.3' }], isError: false });

    await waitFor(() => expect(screen.queryByText('Working…')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Confirm deploy' })).toBeEnabled();
  });

  it('announces the outcome to assistive technology', async () => {
    callMcpAppTool.mockResolvedValue({
      content: [{ type: 'text', text: 'Deployed v2.3' }, a2uiResource([titleUpdate('Live')])],
      isError: false,
    });
    renderResult({ actionTarget: ACTION_TARGET });

    await clickConfirm();

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Deployed v2.3'));
  });

  it('names the source in goose chrome and starts on the card', async () => {
    renderResult({});

    expect(await screen.findByText('Interactive card from deploys')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Card' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText(FALLBACK_TEXT)).not.toBeInTheDocument();
  });

  it('switches to the text the model received and back', async () => {
    renderResult({});
    await screen.findByRole('button', { name: 'Confirm deploy' });

    showAs('Text');

    expect(screen.getByText(FALLBACK_TEXT)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Confirm deploy' })).not.toBeInTheDocument();

    showAs('Card');

    expect(screen.getByRole('button', { name: 'Confirm deploy' })).toBeVisible();
    expect(screen.queryByText(FALLBACK_TEXT)).not.toBeInTheDocument();
  });

  it('keeps what the user typed when switching views', async () => {
    const user = userEvent.setup();
    renderResult({ messages: noteSurface() });
    await user.type(await screen.findByLabelText('Note'), 'half-written');

    showAs('Text');
    showAs('Card');

    expect(screen.getByLabelText('Note')).toHaveValue('half-written');
  });

  it('adds action results to the text view', async () => {
    callMcpAppTool.mockResolvedValue({
      content: [
        { type: 'text', text: 'api-gateway v2.3 is live' },
        a2uiResource([titleUpdate('Live')]),
      ],
      isError: false,
    });
    renderResult({ actionTarget: ACTION_TARGET });
    await clickConfirm();
    await screen.findByText('Live');

    showAs('Text');

    expect(screen.getByText('After your action')).toBeInTheDocument();
    expect(screen.getAllByText('api-gateway v2.3 is live').length).toBeGreaterThan(0);
  });

  it('sends nothing without an action target', async () => {
    renderResult({});

    await clickConfirm();

    expect(callMcpAppTool).not.toHaveBeenCalled();
  });
});
