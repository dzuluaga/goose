// A2UI-over-MCP test server (https://a2ui.org/guides/a2ui_over_mcp/).
//
// plan_deploy  Returns fallback text, plus a deploy confirmation surface as an
//              application/a2ui+json resource when the client advertises A2UI.
// a2ui_action  Handles clicks from that surface. Visible to apps only. Rebuilds the
//              card with the outcome in place of the buttons.
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const A2UI_MIME_TYPE = 'application/a2ui+json';
const BASIC_CATALOG_ID = 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json';
const SURFACE_ID = 'deploy';

const CHECKS = [
  {
    id: 'tests',
    mark: '✓',
    label: '412 tests passed',
    detail: 'Unit and integration · 3 min 12 s',
  },
  {
    id: 'canary',
    mark: '✓',
    label: 'Canary healthy',
    detail: '5% of traffic for 20 min · p95 182 ms · 0 errors',
  },
  {
    id: 'migration',
    mark: '⚠',
    label: 'Includes a DB migration',
    detail: 'Adds an index on orders.created_at · reversible',
  },
];

const DEPLOY_CONTEXT = {
  service: { path: '/service' },
  version: { path: '/version' },
  environment: { path: '/environment' },
};

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

function text(id, value, variant) {
  return { id, component: 'Text', text: value, ...(variant && { variant }) };
}

function button(id, label, event, variant) {
  return [
    {
      id,
      component: 'Button',
      child: `${id}Label`,
      action: { event },
      ...(variant && { variant }),
    },
    text(`${id}Label`, label),
  ];
}

function checkRow({ id, mark, label, detail }) {
  return [
    { id, component: 'Row', align: 'start', children: [`${id}Mark`, `${id}Body`] },
    text(`${id}Mark`, mark, 'h5'),
    { id: `${id}Body`, component: 'Column', children: [`${id}Label`, `${id}Detail`] },
    text(`${id}Label`, label, 'h5'),
    text(`${id}Detail`, detail, 'caption'),
  ];
}

function actionComponents(result) {
  if (result) {
    return [
      { id: 'actions', component: 'Column', children: ['outcomeDetail'] },
      text('outcomeDetail', result.detail, 'caption'),
    ];
  }
  return [
    { id: 'actions', component: 'Row', children: ['confirm', 'reject'] },
    ...button('confirm', 'Confirm deploy', { name: 'confirm', context: DEPLOY_CONTEXT }, 'primary'),
    ...button('reject', 'Reject', { name: 'reject', context: DEPLOY_CONTEXT }),
  ];
}

/** The whole deploy card. With a `result`, the actions are replaced by the outcome. */
export function deploySurface({ service, version, environment }, result) {
  return [
    { version: 'v0.9', createSurface: { surfaceId: SURFACE_ID, catalogId: BASIC_CATALOG_ID } },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [
          { id: 'root', component: 'Card', child: 'body' },
          {
            id: 'body',
            component: 'Column',
            children: ['header', 'divider1', 'checks', 'divider2', 'status', 'actions'],
          },
          { id: 'header', component: 'Column', children: ['title', 'subtitle'] },
          text('title', { path: '/title' }, 'h3'),
          text('subtitle', { path: '/subtitle' }, 'caption'),
          { id: 'divider1', component: 'Divider' },
          { id: 'checks', component: 'Column', children: CHECKS.map((check) => check.id) },
          ...CHECKS.flatMap(checkRow),
          { id: 'divider2', component: 'Divider' },
          { id: 'status', component: 'Column', children: ['statusLabel', 'statusValue'] },
          text('statusLabel', 'Status', 'caption'),
          text('statusValue', { path: '/status' }, 'h5'),
          ...actionComponents(result),
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
          subtitle: `Requested via goose · ${environment} · 3 regions`,
          service,
          version,
          environment,
          status: result?.status ?? 'Waiting for your confirmation',
        },
      },
    },
  ];
}

/**
 * Rebuilds the card in its final state. A2UI v0.9 can't delete single components, and
 * strict clients reject orphaned ones, so the surface is replaced as a whole.
 */
export function outcome(name, deploy, at = new Date()) {
  const time = at.toISOString().slice(11, 16);
  const result =
    name === 'confirm'
      ? {
          status: `✓ Deployed ${deploy.version} to ${deploy.environment}`,
          detail: `Rolled out to 3 regions at ${time} UTC · canary promoted · migration applied`,
        }
      : { status: 'Deploy cancelled', detail: `Cancelled at ${time} UTC · nothing was changed` };
  return {
    status: result.status,
    messages: [
      { version: 'v0.9', deleteSurface: { surfaceId: SURFACE_ID } },
      ...deploySurface(deploy, result),
    ],
  };
}

const server = new McpServer({ name: 'a2ui-demo', version: '0.2.0' });

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
      'canary healthy, includes a reversible DB migration. Waiting for the user to confirm.';
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
    const { status, messages } = outcome(name, {
      service: String(context.service ?? ''),
      version: String(context.version ?? ''),
      environment: String(context.environment ?? 'production'),
    });
    return { content: [{ type: 'text', text: status }, a2uiResource(messages)] };
  }
);

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await server.connect(new StdioServerTransport());
}
