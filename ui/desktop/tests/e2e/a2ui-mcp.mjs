// A2UI-over-MCP test server (https://a2ui.org/guides/a2ui_over_mcp/).
//
// plan_deploy  Returns fallback text, plus a deploy confirmation surface as an
//              application/a2ui+json resource when the client advertises A2UI.
// a2ui_action  Handles clicks from that surface. Visible to apps only.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const A2UI_MIME_TYPE = 'application/a2ui+json';
const BASIC_CATALOG_ID = 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json';
const SURFACE_ID = 'deploy';

export function clientRendersA2ui(meta) {
  const catalogs = meta?.a2ui?.clientCapabilities?.['v0.9']?.supportedCatalogIds;
  return Array.isArray(catalogs) && catalogs.includes(BASIC_CATALOG_ID);
}

function a2uiResource(messages) {
  return {
    type: 'resource',
    resource: {
      uri: `a2ui://${SURFACE_ID}`,
      mimeType: A2UI_MIME_TYPE,
      text: JSON.stringify(messages),
    },
    annotations: { audience: ['user'] },
  };
}

export function deploySurface({ service, version, environment }) {
  const text = (id, value, extra = {}) => ({ id, component: 'Text', text: value, ...extra });
  const button = (id, label, event, extra = {}) => [
    { id, component: 'Button', child: `${id}Label`, action: { event }, ...extra },
    text(`${id}Label`, label),
  ];
  return [
    { version: 'v0.9', createSurface: { surfaceId: SURFACE_ID, catalogId: BASIC_CATALOG_ID } },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [
          { id: 'root', component: 'Card', child: 'body' },
          { id: 'body', component: 'Column', children: ['title', 'checks', 'status', 'actions'] },
          text('title', { path: '/title' }, { variant: 'h3' }),
          { id: 'checks', component: 'Column', children: ['tests', 'canary', 'risk'] },
          text('tests', '✓ 412 tests passed'),
          text('canary', '✓ Canary healthy · p95 182 ms'),
          text('risk', '⚠ Risk: medium · includes a DB migration'),
          text('status', { path: '/status' }),
          { id: 'actions', component: 'Row', children: ['confirm', 'reject'] },
          ...button(
            'confirm',
            'Confirm deploy',
            { name: 'confirm', context: { version: { path: '/version' } } },
            { variant: 'primary' }
          ),
          ...button('reject', 'Reject', { name: 'reject' }),
        ],
      },
    },
    {
      version: 'v0.9',
      updateDataModel: {
        surfaceId: SURFACE_ID,
        path: '/',
        value: {
          title: `${service} ${version} → ${environment}`,
          version,
          status: 'Waiting for confirmation',
        },
      },
    },
  ];
}

function statusUpdate(status) {
  return [
    {
      version: 'v0.9',
      updateDataModel: { surfaceId: SURFACE_ID, path: '/status', value: status },
    },
  ];
}

const server = new McpServer({ name: 'a2ui-demo', version: '0.1.0' });

server.registerTool(
  'plan_deploy',
  {
    title: 'Plan a deploy',
    description: 'Prepare a deploy and ask the user to confirm it.',
    inputSchema: {
      service: z.string().describe('Service to deploy, e.g. api-gateway'),
      version: z.string().describe('Version to deploy, e.g. v2.3'),
      environment: z.string().default('production'),
    },
  },
  async (args, extra) => {
    const summary =
      `${args.service} ${args.version} → ${args.environment}: 412 tests passed, ` +
      'canary healthy, medium risk (DB migration). Waiting for the user to confirm.';
    const content = [{ type: 'text', text: summary }];
    if (clientRendersA2ui(extra._meta)) {
      content.push(a2uiResource(deploySurface(args)));
    }
    return { content };
  }
);

server.registerTool(
  'a2ui_action',
  {
    description: 'Handles user actions from A2UI surfaces rendered by the client.',
    inputSchema: {
      name: z.string(),
      surfaceId: z.string(),
      sourceComponentId: z.string(),
      timestamp: z.string(),
      context: z.record(z.string(), z.unknown()).default({}),
    },
    _meta: { ui: { visibility: ['app'] } },
  },
  async ({ name, context }) => {
    const status =
      name === 'confirm' ? `✓ Deployed ${context.version ?? ''} to production` : 'Deploy cancelled';
    return { content: [{ type: 'text', text: status }, a2uiResource(statusUpdate(status))] };
  }
);

await server.connect(new StdioServerTransport());
