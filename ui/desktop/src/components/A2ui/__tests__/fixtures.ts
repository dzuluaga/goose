import { basicCatalog } from '@a2ui/react/v0_9';
import type { ContentBlock } from '../../../types/message';
import { A2UI_MIME_TYPE, type A2uiMessage } from '../a2uiPayload';

export function confirmationSurface(title: string): A2uiMessage[] {
  return [
    {
      version: 'v0.9',
      createSurface: { surfaceId: 'deploy', catalogId: basicCatalog.id },
    },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId: 'deploy',
        components: [
          { id: 'root', component: 'Column', children: ['title', 'confirm'] },
          { id: 'title', component: 'Text', text: { path: '/title' } },
          {
            id: 'confirm',
            component: 'Button',
            child: 'confirmLabel',
            action: { event: { name: 'confirm', context: { release: { path: '/release' } } } },
          },
          { id: 'confirmLabel', component: 'Text', text: 'Confirm deploy' },
        ],
      },
    },
    titleUpdate(title),
  ];
}

export function titleUpdate(title: string): A2uiMessage {
  return {
    version: 'v0.9',
    updateDataModel: { surfaceId: 'deploy', path: '/', value: { title, release: 'v2.3' } },
  };
}

export function a2uiResource(messages: A2uiMessage[]): ContentBlock {
  return {
    type: 'resource',
    resource: { uri: 'a2ui://deploy', mimeType: A2UI_MIME_TYPE, text: JSON.stringify(messages) },
  };
}
