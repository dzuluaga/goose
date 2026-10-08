import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntlTestWrapper } from '../../../i18n/test-utils';
import type { ContentBlock } from '../../../types/message';
import { A2uiToolResultSlot } from '../A2uiToolResultSlot';
import { resetA2uiFlagForTests } from '../useA2uiEnabled';
import { a2uiResource, confirmationSurface } from './fixtures';

const acpReadConfig = vi.fn();
vi.mock('../../../acp/config', () => ({
  acpReadConfig: (...args: unknown[]) => acpReadConfig(...args),
}));

function successResult(content: ContentBlock[]) {
  return { status: 'success', value: { content, isError: false } };
}

function renderSlot(content: ContentBlock[]) {
  render(
    <IntlTestWrapper>
      <A2uiToolResultSlot
        toolCallName="deploys__plan"
        toolResult={successResult(content)}
        sessionId="session-1"
      />
    </IntlTestWrapper>
  );
}

const A2UI_CONTENT: ContentBlock[] = [
  { type: 'text', text: 'Reply YES to deploy' },
  a2uiResource(confirmationSurface('Ship v2.3?')),
];

describe('A2uiToolResultSlot', () => {
  beforeEach(() => {
    resetA2uiFlagForTests();
    acpReadConfig.mockReset();
  });

  it('renders the surface when the flag is on', async () => {
    acpReadConfig.mockResolvedValue(true);
    renderSlot(A2UI_CONTENT);

    // The renderer is lazy-loaded, so the first render waits on a dynamic import.
    expect(await screen.findByText('Ship v2.3?', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(acpReadConfig).toHaveBeenCalledWith('GOOSE_EXPERIMENTAL_A2UI');
  });

  it('renders nothing when the flag is off', async () => {
    acpReadConfig.mockResolvedValue(false);
    renderSlot(A2UI_CONTENT);

    await vi.waitFor(() => expect(acpReadConfig).toHaveBeenCalled());
    expect(screen.queryByText('Ship v2.3?')).not.toBeInTheDocument();
  });

  it('renders nothing when the flag cannot be read', async () => {
    acpReadConfig.mockRejectedValue(new Error('offline'));
    renderSlot(A2UI_CONTENT);

    await vi.waitFor(() => expect(acpReadConfig).toHaveBeenCalled());
    expect(screen.queryByText('Ship v2.3?')).not.toBeInTheDocument();
  });

  it('renders nothing for a result without A2UI', async () => {
    acpReadConfig.mockResolvedValue(true);
    renderSlot([{ type: 'text', text: 'plain result' }]);

    await vi.waitFor(() => expect(acpReadConfig).toHaveBeenCalled());
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('skips A2UI resources the server marked for the assistant only', async () => {
    acpReadConfig.mockResolvedValue(true);
    const assistantOnly = {
      ...a2uiResource(confirmationSurface('Hidden')),
      annotations: { audience: ['assistant'] },
    } as ContentBlock;
    renderSlot([assistantOnly]);

    await vi.waitFor(() => expect(acpReadConfig).toHaveBeenCalled());
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });
});
