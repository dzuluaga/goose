// A2UI-over-MCP test server (https://a2ui.org/guides/a2ui_over_mcp/).
//
// plan_deploy     Returns fallback text, plus a deploy confirmation surface as an
//                 application/a2ui+json resource when the client advertises A2UI.
// search_flights  Same pattern: flight options the user can book.
// a2ui_action     Handles clicks from either surface (routed by surfaceId). Visible to
//                 apps only. Rebuilds the card with the outcome in place of the buttons.
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const A2UI_MIME_TYPE = 'application/a2ui+json';
const BASIC_CATALOG_ID = 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json';

/** Sent with every surface, so the model neither repeats the card nor asks what it asks. */
const CARD_IS_SOURCE_OF_TRUTH =
  'The user sees an interactive card with these details; it is the source of truth. ' +
  'Do not restate its contents or ask the user to choose. Reply with at most one short sentence.';

export function clientRendersA2ui(meta) {
  const catalogs = meta?.a2ui?.clientCapabilities?.['v0.9']?.supportedCatalogIds;
  return Array.isArray(catalogs) && catalogs.includes(BASIC_CATALOG_ID);
}

function a2uiResource(messages, surfaceId) {
  return {
    type: 'resource',
    resource: {
      uri: `a2ui://${surfaceId}`,
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

function button(id, label, event, { variant, accessibleName } = {}) {
  return [
    {
      id,
      component: 'Button',
      child: `${id}Label`,
      action: { event },
      ...(variant && { variant }),
      ...(accessibleName && { accessibility: { label: accessibleName } }),
    },
    text(`${id}Label`, label),
  ];
}

/** An icon badge beside a title and a muted detail line. */
function iconRow(id, iconName, title, detail, titleVariant = 'h5') {
  return [
    { id, component: 'Row', align: 'center', children: [`${id}Icon`, `${id}Body`] },
    icon(`${id}Icon`, iconName),
    { id: `${id}Body`, component: 'Column', children: [`${id}Title`, `${id}Detail`] },
    text(`${id}Title`, title, titleVariant),
    text(`${id}Detail`, detail, 'caption'),
  ];
}

function surface(surfaceId, theme, children, components, data) {
  return [
    { version: 'v0.9', createSurface: { surfaceId, catalogId: BASIC_CATALOG_ID, theme } },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId,
        components: [
          { id: 'root', component: 'Card', child: 'body' },
          { id: 'body', component: 'Column', children },
          ...components,
        ],
      },
    },
    ...(data ? [{ version: 'v0.9', updateDataModel: { surfaceId, path: '/', value: data } }] : []),
  ];
}

/** A2UI v0.9 can't delete single components, and strict clients reject orphans. */
function replaceSurface(surfaceId, messages) {
  return [{ version: 'v0.9', deleteSurface: { surfaceId } }, ...messages];
}

// ── Deploy ───────────────────────────────────────────────────────────────────────────

const DEPLOY_SURFACE_ID = 'deploy';
const DEPLOY_THEME = { primaryColor: '#6D28D9' };

export function deploySurface({ service, version, environment }) {
  const context = {
    service: { path: '/service' },
    version: { path: '/version' },
    environment: { path: '/environment' },
  };
  return surface(
    DEPLOY_SURFACE_ID,
    DEPLOY_THEME,
    ['header', 'risk', 'tests', 'canary', 'divider', 'actions'],
    [
      ...iconRow(
        'header',
        'upload',
        `Deploy ${service} ${version} to ${environment}?`,
        '3 regions · rollout starts when you confirm',
        'h3'
      ),
      ...iconRow(
        'risk',
        'warning',
        'DB migration · reversible',
        'Adds an index on orders.created_at'
      ),
      ...iconRow('tests', 'check', '412 tests passed', 'Unit and integration · 3 min 12 s'),
      ...iconRow(
        'canary',
        'check',
        'Canary healthy',
        '5% of traffic for 20 min · p95 182 ms · 0 errors'
      ),
      { id: 'divider', component: 'Divider' },
      { id: 'actions', component: 'Row', children: ['confirm', 'cancel'] },
      ...button(
        'confirm',
        `Deploy ${version}`,
        { name: 'confirm', context },
        { variant: 'primary', accessibleName: `Deploy ${service} ${version} to ${environment}` }
      ),
      ...button(
        'cancel',
        'Cancel',
        { name: 'cancel', context },
        { variant: 'borderless', accessibleName: 'Cancel this deploy' }
      ),
    ],
    { service, version, environment }
  );
}

export function deployOutcome(name, { service, version, environment }, at = new Date()) {
  const time = at.toISOString().slice(11, 16);
  const confirmed = name === 'confirm';
  const status = confirmed
    ? `${service} ${version} is live in ${environment}`
    : `Deploy of ${service} ${version} cancelled`;
  const detail = confirmed
    ? `3 regions · ${time} UTC · canary promoted · migration applied`
    : `${time} UTC · nothing was changed`;
  return {
    status,
    messages: replaceSurface(
      DEPLOY_SURFACE_ID,
      surface(
        DEPLOY_SURFACE_ID,
        DEPLOY_THEME,
        ['header'],
        iconRow('header', confirmed ? 'check' : 'close', status, detail, 'h3')
      )
    ),
  };
}

// ── Flights ──────────────────────────────────────────────────────────────────────────

const TRIP_SURFACE_ID = 'trip';
const TRIP_THEME = { primaryColor: '#0F766E' };

/** Sorted by price, cheapest first. */
const FLIGHTS = [
  {
    id: 'NH7',
    airline: 'ANA',
    flight: 'NH 7',
    departs: '13:20',
    arrives: '17:05 +1',
    duration: '11 h 45 m',
    price: '$811',
    tag: 'Cheapest',
  },
  {
    id: 'UA837',
    airline: 'United',
    flight: 'UA 837',
    departs: '09:40',
    arrives: '13:10 +1',
    duration: '11 h 30 m',
    price: '$842',
    tag: 'Earliest arrival',
  },
  {
    id: 'JL1',
    airline: 'JAL',
    flight: 'JL 1',
    departs: '11:15',
    arrives: '14:40 +1',
    duration: '11 h 25 m',
    price: '$879',
    tag: 'Shortest flight',
  },
];

const TRIP_CONTEXT = {
  origin: { path: '/origin' },
  destination: { path: '/destination' },
  date: { path: '/date' },
};

/** Times first (what differs), then who and why, with the price and Book beside them. */
function flightTile(flight) {
  const id = `flight${flight.id}`;
  return [
    { id, component: 'Card', child: `${id}Row` },
    {
      id: `${id}Row`,
      component: 'Row',
      align: 'center',
      children: [`${id}Info`, `${id}Price`, `${id}Book`],
    },
    { id: `${id}Info`, component: 'Column', weight: 1, children: [`${id}Times`, `${id}Meta`] },
    text(`${id}Times`, `${flight.departs} → ${flight.arrives}`, 'h4'),
    text(
      `${id}Meta`,
      `${flight.airline} ${flight.flight} · ${flight.duration} · ${flight.tag}`,
      'caption'
    ),
    text(`${id}Price`, flight.price, 'h3'),
    ...button(
      `${id}Book`,
      'Book',
      { name: 'book', context: { ...TRIP_CONTEXT, flight: flight.id } },
      {
        variant: 'primary',
        accessibleName: `Book ${flight.airline} ${flight.flight}, ${flight.departs} to ${flight.arrives}, ${flight.price}`,
      }
    ),
  ];
}

export function tripSurface({ origin, destination, date }) {
  return surface(
    TRIP_SURFACE_ID,
    TRIP_THEME,
    ['header', 'options'],
    [
      ...iconRow(
        'header',
        'locationOn',
        `${origin} → ${destination} · ${date}`,
        'Nonstop · economy · 1 adult · aisle · taxes included',
        'h3'
      ),
      { id: 'options', component: 'Column', children: FLIGHTS.map((f) => `flight${f.id}`) },
      ...FLIGHTS.flatMap(flightTile),
    ],
    { origin, destination, date }
  );
}

export function booking({ origin, destination, date }, flightId) {
  const flight = FLIGHTS.find((candidate) => candidate.id === flightId) ?? FLIGHTS[0];
  const status = `Booked ${flight.airline} ${flight.flight} · ${flight.price}`;
  return {
    status: `${status} · confirmation 7Q2K8L`,
    messages: replaceSurface(
      TRIP_SURFACE_ID,
      surface(
        TRIP_SURFACE_ID,
        TRIP_THEME,
        ['header', 'confirmation', 'actions'],
        [
          ...iconRow(
            'header',
            'check',
            status,
            `${date} · ${origin} ${flight.departs} → ${destination} ${flight.arrives} · seat 32C (aisle)`,
            'h3'
          ),
          { id: 'confirmation', component: 'Card', child: 'confirmationBody' },
          {
            id: 'confirmationBody',
            component: 'Column',
            children: ['confirmationLabel', 'confirmationCode'],
          },
          text('confirmationLabel', 'Confirmation', 'caption'),
          text('confirmationCode', '7Q2K8L', 'h2'),
          { id: 'actions', component: 'Row', children: ['calendar', 'share'] },
          ...button('calendar', 'Add to calendar', { name: 'calendar' }, { variant: 'borderless' }),
          ...button('share', 'Share', { name: 'share' }, { variant: 'borderless' }),
        ]
      )
    ),
  };
}

// ── MCP server ───────────────────────────────────────────────────────────────────────

const server = new McpServer({ name: 'a2ui-demo', version: '0.5.0' });

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
    const facts =
      `${args.service} ${args.version} → ${args.environment}: 412 tests passed, canary healthy ` +
      '(p95 182 ms, 0 errors), includes a reversible DB migration.';
    if (!clientRendersA2ui(extra._meta)) {
      return { content: [{ type: 'text', text: `${facts} Waiting for the user to confirm.` }] };
    }
    return {
      content: [
        { type: 'text', text: `${facts} ${CARD_IS_SOURCE_OF_TRUTH}` },
        a2uiResource(deploySurface(args), DEPLOY_SURFACE_ID),
      ],
    };
  }
);

server.registerTool(
  'search_flights',
  {
    title: 'Search flights',
    description: 'Find flights for a trip and let the user book one.',
    inputSchema: {
      origin: z.string().describe('Origin airport code, e.g. SFO'),
      destination: z.string().describe('Destination airport code, e.g. HND'),
      date: z.string().describe('Travel date, e.g. Thu, Oct 15'),
    },
  },
  async (args, extra) => {
    const options = FLIGHTS.map(
      (f, i) => `${i + 1}) ${f.flight} ${f.departs} → ${f.arrives}, ${f.price}`
    ).join('; ');
    const facts = `${args.origin} → ${args.destination} on ${args.date}: ${options}.`;
    if (!clientRendersA2ui(extra._meta)) {
      return { content: [{ type: 'text', text: `${facts} Ask the user which one to book.` }] };
    }
    return {
      content: [
        { type: 'text', text: `${facts} ${CARD_IS_SOURCE_OF_TRUTH}` },
        a2uiResource(tripSurface(args), TRIP_SURFACE_ID),
      ],
    };
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
  async ({ name, surfaceId, context }) => {
    const value = (key, fallback = '') => String(context[key] ?? fallback);
    if (surfaceId === TRIP_SURFACE_ID) {
      if (name !== 'book') {
        return { content: [{ type: 'text', text: `${name} isn't available in this demo` }] };
      }
      const trip = {
        origin: value('origin'),
        destination: value('destination'),
        date: value('date'),
      };
      const { status, messages } = booking(trip, value('flight'));
      return {
        content: [{ type: 'text', text: status }, a2uiResource(messages, TRIP_SURFACE_ID)],
      };
    }
    const deploy = {
      service: value('service'),
      version: value('version'),
      environment: value('environment', 'production'),
    };
    const { status, messages } = deployOutcome(name, deploy);
    return {
      content: [{ type: 'text', text: status }, a2uiResource(messages, DEPLOY_SURFACE_ID)],
    };
  }
);

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await server.connect(new StdioServerTransport());
}
