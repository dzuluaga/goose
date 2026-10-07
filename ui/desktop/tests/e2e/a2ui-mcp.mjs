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
const THEME = { primaryColor: '#6D28D9' };

const STATS = [
  { id: 'statTests', value: '412', label: 'Tests passed' },
  { id: 'statLatency', value: '182 ms', label: 'Canary p95' },
  { id: 'statErrors', value: '0', label: 'Errors in 20 min' },
];

const CHECKS = [
  {
    id: 'tests',
    icon: 'check',
    label: 'All tests green',
    detail: 'Unit and integration · 3 min 12 s',
  },
  {
    id: 'canary',
    icon: 'check',
    label: 'Canary healthy',
    detail: '5% of traffic for 20 min · no regressions',
  },
  {
    id: 'migration',
    icon: 'warning',
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

function icon(id, name) {
  return { id, component: 'Icon', name };
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

/** An icon badge beside a label and a muted detail line. */
function iconRow(id, iconName, label, detail, labelVariant = 'h5') {
  return [
    { id, component: 'Row', align: 'center', children: [`${id}Icon`, `${id}Body`] },
    icon(`${id}Icon`, iconName),
    { id: `${id}Body`, component: 'Column', children: [`${id}Label`, `${id}Detail`] },
    text(`${id}Label`, label, labelVariant),
    text(`${id}Detail`, detail, 'caption'),
  ];
}

/** A nested Card, which clients may draw as a tile. */
function stat({ id, value, label }) {
  return [
    { id, component: 'Card', weight: 1, child: `${id}Body` },
    { id: `${id}Body`, component: 'Column', children: [`${id}Value`, `${id}Label`] },
    text(`${id}Value`, value, 'h2'),
    text(`${id}Label`, label, 'caption'),
  ];
}

function statusAndActions(result) {
  const status = result
    ? iconRow('status', result.icon, result.status, result.detail)
    : iconRow(
        'status',
        'info',
        'Waiting for your confirmation',
        'Rollout starts as soon as you confirm'
      );
  const actions = result
    ? []
    : [
        { id: 'actions', component: 'Row', children: ['confirm', 'reject'] },
        ...button(
          'confirm',
          'Confirm deploy',
          { name: 'confirm', context: DEPLOY_CONTEXT },
          'primary'
        ),
        ...button('reject', 'Reject', { name: 'reject', context: DEPLOY_CONTEXT }),
      ];
  return {
    children: result ? ['status'] : ['status', 'actions'],
    components: [...status, ...actions],
  };
}

/** The whole deploy card. With a `result`, the actions are replaced by the outcome. */
export function deploySurface({ service, version, environment }, result) {
  const footer = statusAndActions(result);
  return [
    {
      version: 'v0.9',
      createSurface: { surfaceId: SURFACE_ID, catalogId: BASIC_CATALOG_ID, theme: THEME },
    },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [
          { id: 'root', component: 'Card', child: 'body' },
          {
            id: 'body',
            component: 'Column',
            children: ['header', 'stats', 'divider1', 'checks', 'divider2', 'footer'],
          },
          ...iconRow('header', 'upload', { path: '/title' }, { path: '/subtitle' }, 'h3'),
          { id: 'stats', component: 'Row', children: STATS.map((s) => s.id) },
          ...STATS.flatMap(stat),
          { id: 'divider1', component: 'Divider' },
          { id: 'checks', component: 'Column', children: CHECKS.map((check) => check.id) },
          ...CHECKS.flatMap((check) => iconRow(check.id, check.icon, check.label, check.detail)),
          { id: 'divider2', component: 'Divider' },
          { id: 'footer', component: 'Column', children: footer.children },
          ...footer.components,
        ],
      },
    },
    {
      version: 'v0.9',
      updateDataModel: {
        surfaceId: SURFACE_ID,
        path: '/',
        value: {
          title: `Deploy ${service} ${version} to ${environment}`,
          subtitle: `Requested via goose · ${environment} · 3 regions`,
          service,
          version,
          environment,
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
          icon: 'check',
          status: `Deployed ${deploy.version} to ${deploy.environment}`,
          detail: `Rolled out to 3 regions at ${time} UTC · canary promoted · migration applied`,
        }
      : {
          icon: 'close',
          status: 'Deploy cancelled',
          detail: `Cancelled at ${time} UTC · nothing was changed`,
        };
  return {
    status: result.status,
    messages: [
      { version: 'v0.9', deleteSurface: { surfaceId: SURFACE_ID } },
      ...deploySurface(deploy, result),
    ],
  };
}

const server = new McpServer({ name: 'a2ui-demo', version: '0.3.0' });

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
