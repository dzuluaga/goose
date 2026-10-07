import { lazy, Suspense, useMemo } from 'react';
import { getToolResultContent } from '../../utils/toolResultContent';
import { extractExtensionName } from '../../utils/toolIconMapping';
import { extractA2uiPayloads } from './a2uiPayload';
import { useA2uiEnabled } from './useA2uiEnabled';

const A2uiToolResult = lazy(() => import('./A2uiToolResult'));

interface A2uiToolResultSlotProps {
  toolCallName: string;
  toolResult: Record<string, unknown>;
  /** Needed to send actions; without it the surfaces render read-only. */
  sessionId?: string;
}

/**
 * Renders the A2UI surfaces in a tool result when the experimental flag is on. Detection is
 * cheap and eager; the renderer and its dependencies load only when a surface is present.
 */
export function A2uiToolResultSlot({
  toolCallName,
  toolResult,
  sessionId,
}: A2uiToolResultSlotProps) {
  const enabled = useA2uiEnabled();

  const { payloads, fallbackText } = useMemo(() => {
    const content = getToolResultContent(toolResult);
    return {
      payloads: extractA2uiPayloads(content),
      fallbackText: content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('\n'),
    };
  }, [toolResult]);

  const extensionName = extractExtensionName(toolCallName);
  const actionTarget = useMemo(
    () => (sessionId && extensionName ? { sessionId, extensionName } : undefined),
    [sessionId, extensionName]
  );

  if (!enabled) {
    return null;
  }

  const accepted = payloads.flatMap((payload) => (payload.status === 'accepted' ? [payload] : []));
  if (accepted.length === 0) {
    return null;
  }

  const fallback = <p className="text-sm whitespace-pre-wrap">{fallbackText}</p>;

  return (
    <Suspense fallback={null}>
      {accepted.map((payload, index) => (
        <A2uiToolResult
          key={`${payload.uri}-${index}`}
          initialMessages={payload.messages}
          fallback={fallback}
          actionTarget={actionTarget}
        />
      ))}
    </Suspense>
  );
}
