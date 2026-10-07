import { useCallback, useState, type ReactNode } from 'react';
import { callMcpAppTool } from '../../acp/mcp-apps';
import { defineMessages, useIntl } from '../../i18n';
import type { ContentBlock } from '../../types/message';
import { A2uiSurfaces, type A2uiActionHandler } from './A2uiSurfaces';
import { extractA2uiPayloads, type A2uiMessage } from './a2uiPayload';

export const A2UI_ACTION_TOOL = 'a2ui_action';

const i18n = defineMessages({
  actionFailed: {
    id: 'a2uiToolResult.actionFailed',
    defaultMessage: 'The action failed: {reason}',
  },
});

interface A2uiToolResultProps {
  /** Messages from one accepted A2UI resource in the tool result. */
  initialMessages: A2uiMessage[];
  /** Shown when the surfaces can't be rendered. */
  fallback: ReactNode;
  /** Present when actions can reach the extension that produced the surface. */
  actionTarget?: { sessionId: string; extensionName: string };
}

/**
 * One A2UI resource from a tool result: its surfaces, plus the round trip that sends a user
 * action to the originating extension and applies the A2UI messages it returns.
 */
export default function A2uiToolResult({
  initialMessages,
  fallback,
  actionTarget,
}: A2uiToolResultProps) {
  const intl = useIntl();
  const [messages, setMessages] = useState(initialMessages);
  const [actionError, setActionError] = useState<string | null>(null);

  const sendAction = useCallback<A2uiActionHandler>(
    async (action) => {
      if (!actionTarget) {
        return;
      }
      setActionError(null);
      try {
        const { name, surfaceId, sourceComponentId, timestamp, context } = action;
        const result = await callMcpAppTool(
          actionTarget.sessionId,
          actionTarget.extensionName,
          A2UI_ACTION_TOOL,
          { name, surfaceId, sourceComponentId, timestamp, context }
        );
        if (result.isError) {
          setActionError(textOf(result.content as ContentBlock[]) || action.name);
          return;
        }
        const updates = extractA2uiPayloads(result.content as ContentBlock[]).flatMap((payload) =>
          payload.status === 'accepted' ? payload.messages : []
        );
        if (updates.length > 0) {
          setMessages((current) => [...current, ...updates]);
        }
      } catch (error) {
        setActionError(error instanceof Error ? error.message : String(error));
      }
    },
    [actionTarget]
  );

  return (
    <div className="mt-3 rounded-lg border border-border-primary p-4">
      <A2uiSurfaces
        messages={messages}
        onAction={actionTarget ? sendAction : undefined}
        fallback={fallback}
      />
      {actionError && (
        <p role="alert" className="mt-3 text-sm text-text-danger">
          {intl.formatMessage(i18n.actionFailed, { reason: actionError })}
        </p>
      )}
    </div>
  );
}

function textOf(content: ContentBlock[]): string {
  return content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('\n')
    .trim();
}
