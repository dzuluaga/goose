import type { ContentBlock } from '../types/message';

/** The content of a serialized tool result that is meant for the user. */
export function getToolResultContent(toolResult: Record<string, unknown>): ContentBlock[] {
  if (toolResult.status === 'error') {
    return typeof toolResult.error === 'string' ? [{ type: 'text', text: toolResult.error }] : [];
  }
  if (toolResult.status !== 'success') {
    return [];
  }
  const value = toolResult.value as { content: ContentBlock[] };
  return value.content.filter((item) => {
    const annotations = (item as { annotations?: { audience?: string[] } }).annotations;
    return !annotations?.audience || annotations.audience.includes('user');
  });
}
