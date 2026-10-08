import { useCallback, useState, type ReactNode } from 'react';
import { LayoutTemplate } from 'lucide-react';
import { callMcpAppTool } from '../../acp/mcp-apps';
import { defineMessages, useIntl } from '../../i18n';
import type { ContentBlock } from '../../types/message';
import { cn } from '../../utils';
import { A2uiActionPending } from './a2uiActionState';
import { A2uiSurfaces, type A2uiActionHandler } from './A2uiSurfaces';
import { extractA2uiPayloads, type A2uiMessage } from './a2uiPayload';

export const A2UI_ACTION_TOOL = 'a2ui_action';

const i18n = defineMessages({
  actionFailed: {
    id: 'a2uiToolResult.actionFailed',
    defaultMessage: 'The action failed: {reason}',
  },
  actionPending: {
    id: 'a2uiToolResult.actionPending',
    defaultMessage: 'Working…',
  },
  source: {
    id: 'a2uiToolResult.source',
    defaultMessage: 'Interactive card from {source}',
  },
  sourceUnknown: {
    id: 'a2uiToolResult.sourceUnknown',
    defaultMessage: 'Interactive card',
  },
  viewAs: {
    id: 'a2uiToolResult.viewAs',
    defaultMessage: 'Show as',
  },
  viewCard: {
    id: 'a2uiToolResult.viewCard',
    defaultMessage: 'Card',
  },
  viewText: {
    id: 'a2uiToolResult.viewText',
    defaultMessage: 'Text',
  },
  afterAction: {
    id: 'a2uiToolResult.afterAction',
    defaultMessage: 'After your action',
  },
});

type View = 'card' | 'text';

interface A2uiToolResultProps {
  /** Messages from one accepted A2UI resource in the tool result. */
  initialMessages: A2uiMessage[];
  /** The tool result's text, which is also what the model received. */
  fallbackText: string;
  /** Shown when the surfaces can't be rendered. */
  fallback: ReactNode;
  /** The extension that produced the surface, named in goose-owned chrome above the card. */
  source?: string;
  /** Present when actions can reach the extension that produced the surface. */
  actionTarget?: { sessionId: string; extensionName: string };
}

/**
 * One A2UI resource from a tool result: its surfaces, plus the round trip that sends a user
 * action to the originating extension and applies the A2UI messages it returns.
 *
 * The header above the card belongs to goose, not the server, so it can say where the card
 * came from and switch to the text the model saw. The card stays mounted while hidden, so
 * switching views keeps what the user has typed.
 */
export default function A2uiToolResult({
  initialMessages,
  fallbackText,
  fallback,
  source,
  actionTarget,
}: A2uiToolResultProps) {
  const intl = useIntl();
  const [messages, setMessages] = useState(initialMessages);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionResults, setActionResults] = useState<string[]>([]);
  const [view, setView] = useState<View>('card');

  const sendAction = useCallback<A2uiActionHandler>(
    async (action) => {
      if (!actionTarget) {
        return;
      }
      setActionError(null);
      setPending(true);
      try {
        const { name, surfaceId, sourceComponentId, timestamp, context } = action;
        const result = await callMcpAppTool(
          actionTarget.sessionId,
          actionTarget.extensionName,
          A2UI_ACTION_TOOL,
          { name, surfaceId, sourceComponentId, timestamp, context }
        );
        const content = result.content as ContentBlock[];
        if (result.isError) {
          setActionError(textOf(content) || name);
          return;
        }
        const updates = extractA2uiPayloads(content).flatMap((payload) =>
          payload.status === 'accepted' ? payload.messages : []
        );
        if (updates.length > 0) {
          setMessages((current) => [...current, ...updates]);
        }
        const resultText = textOf(content);
        if (resultText) {
          setActionResults((current) => [...current, resultText]);
        }
      } catch (error) {
        setActionError(error instanceof Error ? error.message : String(error));
      } finally {
        setPending(false);
      }
    },
    [actionTarget]
  );

  const views: { value: View; label: string }[] = [
    { value: 'card', label: intl.formatMessage(i18n.viewCard) },
    { value: 'text', label: intl.formatMessage(i18n.viewText) },
  ];

  return (
    <div className="mt-3 max-w-[600px]" aria-busy={pending}>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-text-secondary">
        <span className="flex min-w-0 items-center gap-1.5">
          <LayoutTemplate className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {source
              ? intl.formatMessage(i18n.source, { source })
              : intl.formatMessage(i18n.sourceUnknown)}
          </span>
        </span>
        <div
          role="group"
          aria-label={intl.formatMessage(i18n.viewAs)}
          className="inline-flex shrink-0 rounded-md border border-border-primary p-0.5"
        >
          {views.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className={cn(
                'rounded px-2 py-0.5 transition-colors',
                view === value
                  ? 'bg-background-secondary font-medium text-text-primary'
                  : 'hover:text-text-primary'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div hidden={view !== 'card'}>
        <A2uiActionPending.Provider value={pending}>
          <A2uiSurfaces
            messages={messages}
            onAction={actionTarget ? sendAction : undefined}
            fallback={fallback}
          />
        </A2uiActionPending.Provider>
      </div>
      {view === 'text' && (
        <div className="rounded-xl border border-border-primary p-4 text-sm">
          <p className="whitespace-pre-wrap">{fallbackText}</p>
          {actionResults.map((resultText, index) => (
            <div key={index} className="mt-3 border-t border-border-primary pt-3">
              <p className="text-xs text-text-secondary">{intl.formatMessage(i18n.afterAction)}</p>
              <p className="whitespace-pre-wrap">{resultText}</p>
            </div>
          ))}
        </div>
      )}
      {pending && (
        <p className="mt-2 text-xs text-text-secondary">{intl.formatMessage(i18n.actionPending)}</p>
      )}
      {actionError && (
        <p role="alert" className="mt-2 text-sm text-text-danger">
          {intl.formatMessage(i18n.actionFailed, { reason: actionError })}
        </p>
      )}
      <p role="status" className="sr-only">
        {actionResults.at(-1) ?? ''}
      </p>
    </div>
  );
}

function textOf(content: ContentBlock[]): string {
  return content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('\n')
    .trim();
}
