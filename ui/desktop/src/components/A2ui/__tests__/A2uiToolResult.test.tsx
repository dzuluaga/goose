import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntlTestWrapper } from '../../../i18n/test-utils';
import A2uiToolResult from '../A2uiToolResult';
import { a2uiResource, confirmationSurface, titleUpdate } from './fixtures';

const callMcpAppTool = vi.fn();
vi.mock('../../../acp/mcp-apps', () => ({
  callMcpAppTool: (...args: unknown[]) => callMcpAppTool(...args),
}));

const ACTION_TARGET = { sessionId: 'session-1', extensionName: 'deploys' };

function renderResult({ actionTarget }: { actionTarget?: typeof ACTION_TARGET }) {
  render(
    <IntlTestWrapper>
      <A2uiToolResult
        initialMessages={confirmationSurface('Ship v2.3?')}
        fallback="fallback text"
        actionTarget={actionTarget}
      />
    </IntlTestWrapper>
  );
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

  it('sends nothing without an action target', async () => {
    renderResult({});

    await clickConfirm();

    expect(callMcpAppTool).not.toHaveBeenCalled();
  });
});
