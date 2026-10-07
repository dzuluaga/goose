// A2UI-over-MCP test server (https://a2ui.org/guides/a2ui_over_mcp/).
//
// plan_deploy     Returns fallback text, plus a deploy confirmation surface as an
//                 application/a2ui+json resource when the client advertises A2UI.
// search_flights  Same pattern: flight options the user can select and book.
// a2ui_action     Handles clicks from either surface (routed by surfaceId). Visible to
//                 apps only. Rebuilds the card with the outcome in place of the buttons.
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

function a2uiResource(messages, surfaceId = SURFACE_ID) {
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

const TRIP_SURFACE_ID = 'trip';
const TRIP_THEME = { primaryColor: '#0F766E' };

const FLIGHTS = [
  {
    id: 'JL1',
    airline: 'Japan Airlines',
    flight: 'JL 1',
    departs: '11:15',
    arrives: '14:40 +1',
    duration: '11 h 25 m · nonstop',
    price: '$879',
    tag: 'Best timing',
    tagIcon: 'star',
  },
  {
    id: 'NH7',
    airline: 'ANA',
    flight: 'NH 7',
    departs: '13:20',
    arrives: '17:05 +1',
    duration: '11 h 45 m · nonstop',
    price: '$811',
    tag: 'Cheapest',
    tagIcon: 'payment',
  },
  {
    id: 'UA837',
    airline: 'United',
    flight: 'UA 837',
    departs: '09:40',
    arrives: '13:10 +1',
    duration: '11 h 30 m · nonstop',
    price: '$842',
    tag: 'Earliest arrival',
    tagIcon: 'event',
  },
];

const TRIP_CONTEXT = {
  origin: { path: '/origin' },
  destination: { path: '/destination' },
  date: { path: '/date' },
};

/** One flight as a tile: route and times, a tag, the price, and a Select button. */
function flightTile(flight) {
  const id = `flight${flight.id}`;
  return [
    { id, component: 'Card', child: `${id}Row` },
    {
      id: `${id}Row`,
      component: 'Row',
      align: 'center',
      children: [`${id}Info`, `${id}Price`, `${id}Select`],
    },
    {
      id: `${id}Info`,
      component: 'Column',
      weight: 1,
      children: [`${id}Name`, `${id}Times`, `${id}Tag`],
    },
    text(`${id}Name`, `${flight.airline} · ${flight.flight}`, 'h4'),
    text(`${id}Times`, `${flight.departs} → ${flight.arrives} · ${flight.duration}`, 'caption'),
    {
      id: `${id}Tag`,
      component: 'Row',
      align: 'center',
      children: [`${id}TagIcon`, `${id}TagText`],
    },
    icon(`${id}TagIcon`, flight.tagIcon),
    text(`${id}TagText`, flight.tag, 'caption'),
    text(`${id}Price`, flight.price, 'h2'),
    ...button(
      `${id}Select`,
      'Select',
      { name: 'book', context: { ...TRIP_CONTEXT, flight: flight.id } },
      'primary'
    ),
  ];
}

/** Flight options, or with a `booking`, the booked flight in place of the options. */
export function tripSurface({ origin, destination, date }, booking) {
  const options = booking ? [] : FLIGHTS;
  const confirmation = booking
    ? [
        ...iconRow('booked', 'check', booking.status, booking.detail),
        {
          id: 'bookedActions',
          component: 'Row',
          children: ['addCalendar', 'shareTrip'],
        },
        ...button('addCalendar', 'Add to calendar', { name: 'calendar' }),
        ...button('shareTrip', 'Share itinerary', { name: 'share' }),
      ]
    : [];
  return [
    {
      version: 'v0.9',
      createSurface: { surfaceId: TRIP_SURFACE_ID, catalogId: BASIC_CATALOG_ID, theme: TRIP_THEME },
    },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId: TRIP_SURFACE_ID,
        components: [
          { id: 'root', component: 'Card', child: 'body' },
          {
            id: 'body',
            component: 'Column',
            children: booking
              ? ['header', 'divider', 'booked', 'bookedActions']
              : ['header', 'divider', 'options', 'footnote'],
          },
          ...iconRow('header', 'locationOn', { path: '/route' }, { path: '/criteria' }, 'h3'),
          { id: 'divider', component: 'Divider' },
          ...(booking
            ? confirmation
            : [
                {
                  id: 'options',
                  component: 'Column',
                  children: options.map((flight) => `flight${flight.id}`),
                },
                ...options.flatMap(flightTile),
                text('footnote', 'Prices include taxes · economy · 1 adult', 'caption'),
              ]),
        ],
      },
    },
    {
      version: 'v0.9',
      updateDataModel: {
        surfaceId: TRIP_SURFACE_ID,
        path: '/',
        value: {
          route: `${origin} → ${destination}`,
          criteria: `${date} · nonstop only · aisle seat · under $900`,
          origin,
          destination,
          date,
        },
      },
    },
  ];
}

/** Rebuilds the trip card with the booked flight; v0.9 can't delete single components. */
export function booking(trip, flightId) {
  const flight = FLIGHTS.find((candidate) => candidate.id === flightId) ?? FLIGHTS[0];
  const result = {
    status: `Booked ${flight.airline} ${flight.flight} · ${flight.price}`,
    detail: `${trip.date} · ${flight.departs} → ${flight.arrives} · seat 32C (aisle) · confirmation 7Q2K8L`,
  };
  return {
    status: result.status,
    messages: [
      { version: 'v0.9', deleteSurface: { surfaceId: TRIP_SURFACE_ID } },
      ...tripSurface(trip, result),
    ],
  };
}

const server = new McpServer({ name: 'a2ui-demo', version: '0.4.0' });

server.registerTool(
  'search_flights',
  {
    title: 'Search flights',
    description: 'Find flights for a trip and let the user pick one to book.',
    inputSchema: {
      origin: z.string().describe('Origin airport code, e.g. SFO'),
      destination: z.string().describe('Destination airport code, e.g. HND'),
      date: z.string().describe('Travel date, e.g. Thu, Oct 15'),
    },
  },
  async (args, extra) => {
    const summary = FLIGHTS.map(
      (flight, index) =>
        `${index + 1}) ${flight.flight} ${flight.departs} → ${flight.arrives}, ${flight.price}`
    ).join('; ');
    const content = [
      {
        type: 'text',
        text: `${args.origin} → ${args.destination} on ${args.date}: ${summary}. Ask the user which one to book.`,
      },
    ];
    if (clientRendersA2ui(extra._meta)) {
      content.push(a2uiResource(tripSurface(args), TRIP_SURFACE_ID));
    }
    return { content };
  }
);

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
  async ({ name, surfaceId, context }) => {
    if (surfaceId === TRIP_SURFACE_ID) {
      if (name !== 'book') {
        return { content: [{ type: 'text', text: `${name}: not available in this demo` }] };
      }
      const trip = {
        origin: String(context.origin ?? ''),
        destination: String(context.destination ?? ''),
        date: String(context.date ?? ''),
      };
      const { status, messages } = booking(trip, String(context.flight ?? ''));
      return {
        content: [{ type: 'text', text: status }, a2uiResource(messages, TRIP_SURFACE_ID)],
      };
    }
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
