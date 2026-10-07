import type { ContentBlock } from '../../types/message';

export const A2UI_MIME_TYPE = 'application/a2ui+json';

export const A2UI_LIMITS = {
  maxPayloadBytes: 64 * 1024,
  maxComponents: 200,
} as const;

const SUPPORTED_VERSIONS: ReadonlySet<string> = new Set(['v0.9', 'v0.9.1']);

export type A2uiMessage = Record<string, unknown> & { version: string };

export type A2uiRejection =
  'tooLarge' | 'invalidJson' | 'notMessageList' | 'unsupportedVersion' | 'tooManyComponents';

export type A2uiPayload =
  | { status: 'accepted'; uri: string; messages: A2uiMessage[] }
  | { status: 'rejected'; uri: string; reason: A2uiRejection };

type A2uiTextResource = { uri: string; text: string };

function asA2uiTextResource(block: ContentBlock): A2uiTextResource | null {
  if (block.type !== 'resource') {
    return null;
  }
  const { resource } = block;
  if (resource.mimeType !== A2UI_MIME_TYPE || !('text' in resource)) {
    return null;
  }
  return { uri: resource.uri, text: resource.text };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isA2uiMessage(value: unknown): value is A2uiMessage {
  return isRecord(value) && typeof value.version === 'string';
}

function countComponents(messages: readonly A2uiMessage[]): number {
  return messages.reduce((total, message) => {
    const update = message.updateComponents;
    if (!isRecord(update) || !Array.isArray(update.components)) {
      return total;
    }
    return total + update.components.length;
  }, 0);
}

/**
 * Applies goose's size, shape, version and component-count limits. Schema and
 * catalog validation happen later, in the A2UI message processor.
 */
export function parseA2uiPayload(resource: A2uiTextResource): A2uiPayload {
  const reject = (reason: A2uiRejection): A2uiPayload => ({
    status: 'rejected',
    uri: resource.uri,
    reason,
  });

  if (new TextEncoder().encode(resource.text).byteLength > A2UI_LIMITS.maxPayloadBytes) {
    return reject('tooLarge');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(resource.text);
  } catch {
    return reject('invalidJson');
  }

  const candidates = Array.isArray(parsed) ? parsed : [parsed];
  if (candidates.length === 0 || !candidates.every(isA2uiMessage)) {
    return reject('notMessageList');
  }
  if (!candidates.every((message) => SUPPORTED_VERSIONS.has(message.version))) {
    return reject('unsupportedVersion');
  }
  if (countComponents(candidates) > A2UI_LIMITS.maxComponents) {
    return reject('tooManyComponents');
  }

  return { status: 'accepted', uri: resource.uri, messages: candidates };
}

export function extractA2uiPayloads(content: readonly ContentBlock[]): A2uiPayload[] {
  return content.flatMap((block) => {
    const resource = asA2uiTextResource(block);
    return resource ? [parseA2uiPayload(resource)] : [];
  });
}
