import { describe, expect, it } from 'vitest';
import type { ContentBlock } from '../../../types/message';
import { A2UI_LIMITS, A2UI_MIME_TYPE, extractA2uiPayloads } from '../a2uiPayload';

const URI = 'a2ui://booking';

const createSurface = {
  version: 'v0.9',
  createSurface: { surfaceId: 'booking', catalogId: 'basic' },
};

function a2uiResource(text: string, mimeType = A2UI_MIME_TYPE): ContentBlock {
  return { type: 'resource', resource: { uri: URI, mimeType, text } };
}

function componentsMessage(count: number) {
  return {
    version: 'v0.9',
    updateComponents: {
      surfaceId: 'booking',
      components: Array.from({ length: count }, (_, i) => ({
        id: `c${i}`,
        component: 'Text',
        text: 'x',
      })),
    },
  };
}

describe('extractA2uiPayloads', () => {
  it('accepts a message list and a single message', () => {
    const content: ContentBlock[] = [
      a2uiResource(JSON.stringify([createSurface])),
      a2uiResource(JSON.stringify(createSurface)),
    ];

    expect(extractA2uiPayloads(content)).toEqual([
      { status: 'accepted', uri: URI, messages: [createSurface] },
      { status: 'accepted', uri: URI, messages: [createSurface] },
    ]);
  });

  it('ignores content that is not an A2UI resource', () => {
    const content: ContentBlock[] = [
      { type: 'text', text: 'fallback text' },
      a2uiResource('{}', 'text/html;profile=mcp-app'),
      { type: 'resource', resource: { uri: URI, mimeType: A2UI_MIME_TYPE, blob: 'AAAA' } },
    ];

    expect(extractA2uiPayloads(content)).toEqual([]);
  });

  it.each([
    ['tooLarge', 'x'.repeat(A2UI_LIMITS.maxPayloadBytes + 1)],
    ['invalidJson', '{not json'],
    ['notMessageList', JSON.stringify([])],
    ['notMessageList', JSON.stringify([{ createSurface: {} }])],
    ['unsupportedVersion', JSON.stringify([{ ...createSurface, version: 'v1.0' }])],
    [
      'tooManyComponents',
      JSON.stringify([createSurface, componentsMessage(A2UI_LIMITS.maxComponents + 1)]),
    ],
  ])('rejects %s payloads', (reason, text) => {
    expect(extractA2uiPayloads([a2uiResource(text)])).toEqual([
      { status: 'rejected', uri: URI, reason },
    ]);
  });

  it('accepts exactly the component limit', () => {
    const text = JSON.stringify([createSurface, componentsMessage(A2UI_LIMITS.maxComponents)]);

    expect(extractA2uiPayloads([a2uiResource(text)])[0]?.status).toBe('accepted');
  });
});
