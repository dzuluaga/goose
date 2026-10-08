// A2UI-over-MCP test server (https://a2ui.org/guides/a2ui_over_mcp/).
//
// plan_deploy     Returns fallback text, plus a deploy confirmation surface as an
//                 application/a2ui+json resource when the client advertises A2UI.
// search_flights     Same pattern: flight options the user can book.
// request_db_access  A form: access level, duration, ticket, acknowledgment. The grant
//                    button stays disabled until the ticket and acknowledgment are valid.
// start_return       A form: items, reason, refund method, pickup date, label email.
// a2ui_action        Handles clicks from every surface (routed by surfaceId). Visible to
//                    apps only. Rebuilds the card with the outcome in place of the buttons.
//
// All data is sample data.
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const A2UI_MIME_TYPE = 'application/a2ui+json';
const BASIC_CATALOG_ID = 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json';

/**
 * The fallback text is read by the model and, through the client's Text view, by people, so it
 * states facts only. Guidance for the model lives in the server instructions instead.
 */
const SHOWN_AS_CARD = 'Shown to the user as an interactive card.';

const SERVER_INSTRUCTIONS =
  'When a tool result says it is shown to the user as an interactive card, the user already ' +
  'sees every detail and acts in the card. Do not restate the details or ask the user to ' +
  'choose; reply with at most one short sentence.';

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

/** A tinted tile holding an inline glyph and one line of (possibly bound) text. */
function noteTile(id, iconName, value, variant = 'body') {
  return [
    { id, component: 'Card', child: `${id}Row` },
    { id: `${id}Row`, component: 'Row', align: 'center', children: [`${id}Icon`, `${id}Text`] },
    icon(`${id}Icon`, iconName),
    text(`${id}Text`, value, variant),
  ];
}

function boundText(template) {
  return { call: 'formatString', args: { value: template }, returnType: 'string' };
}

function chips(id, label, options, path) {
  return {
    id,
    component: 'ChoicePicker',
    label,
    displayStyle: 'chips',
    options: options.map(([value, optionLabel]) => ({ value, label: optionLabel ?? value })),
    value: { path },
  };
}

/** A button that stays disabled until `condition` holds. */
function gatedButton(id, label, event, options, condition, message) {
  const [control, labelText] = button(id, label, event, options);
  return [{ ...control, checks: [{ condition, message }] }, labelText];
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

// ── Production DB access ─────────────────────────────────────────────────────────────

const ACCESS_SURFACE_ID = 'db-access';
const ACCESS_THEME = { primaryColor: '#B91C1C' };
const ACCESS_LEVELS = [
  ['replica', 'Read-only replica'],
  ['debug', 'Debug session'],
  ['schema', 'Schema only'],
];
const TICKET_IS_VALID = {
  call: 'regex',
  args: { value: { path: '/ticket' }, pattern: '^SEC-\\d{4,}$' },
  returnType: 'boolean',
};

export function accessSurface({ database, purpose }) {
  return surface(
    ACCESS_SURFACE_ID,
    ACCESS_THEME,
    ['header', 'level', 'ttl', 'expiry', 'ticket', 'ack', 'divider', 'actions'],
    [
      ...iconRow(
        'header',
        'lock',
        `Temporary access to ${database} (production)`,
        `${purpose} · every query is recorded in the audit log`,
        'h3'
      ),
      chips('level', 'Access level', ACCESS_LEVELS, '/level'),
      {
        id: 'ttl',
        component: 'Slider',
        label: 'Duration (minutes)',
        min: 15,
        max: 240,
        value: { path: '/ttl' },
      },
      ...noteTile(
        'expiry',
        'lockOpen',
        boundText('Access ends ${/ttl} minutes after you grant it, then is revoked automatically')
      ),
      {
        id: 'ticket',
        component: 'TextField',
        label: 'Security ticket',
        value: { path: '/ticket' },
        checks: [{ condition: TICKET_IS_VALID, message: 'Use a security ticket, like SEC-4821' }],
      },
      {
        id: 'ack',
        component: 'CheckBox',
        label: 'I will handle customer PII under the data-handling policy',
        value: { path: '/ack' },
      },
      { id: 'divider', component: 'Divider' },
      { id: 'actions', component: 'Row', children: ['grant', 'cancel'] },
      ...gatedButton(
        'grant',
        'Grant access',
        {
          name: 'grant',
          context: {
            database: { path: '/database' },
            level: { path: '/level' },
            ttl: { path: '/ttl' },
            ticket: { path: '/ticket' },
          },
        },
        { variant: 'primary', accessibleName: `Grant temporary access to ${database}` },
        {
          call: 'and',
          args: { values: [TICKET_IS_VALID, { path: '/ack' }] },
          returnType: 'boolean',
        },
        'Add a security ticket and accept the data-handling policy'
      ),
      ...button(
        'cancel',
        'Cancel',
        { name: 'cancel', context: { database: { path: '/database' } } },
        { variant: 'borderless', accessibleName: 'Cancel this access request' }
      ),
    ],
    { database, level: ['replica'], ttl: 60, ticket: '', ack: false }
  );
}

function clockTime(at) {
  return at.toISOString().slice(11, 16);
}

export function accessOutcome(name, context, at = new Date()) {
  const database = String(context.database ?? 'orders-db');
  if (name !== 'grant') {
    const status =
      name === 'revoke'
        ? `Access to ${database} revoked`
        : `Access request for ${database} cancelled`;
    return {
      status,
      messages: replaceSurface(
        ACCESS_SURFACE_ID,
        surface(
          ACCESS_SURFACE_ID,
          ACCESS_THEME,
          ['header'],
          iconRow(
            'header',
            'close',
            status,
            `${clockTime(at)} UTC · logged to the audit trail`,
            'h3'
          )
        )
      ),
    };
  }
  const levelValue = Array.isArray(context.level) ? context.level[0] : context.level;
  const level = (ACCESS_LEVELS.find(([value]) => value === levelValue) ?? ACCESS_LEVELS[0])[1];
  const ttl = Number(context.ttl ?? 60);
  const ticket = String(context.ticket ?? '');
  const expires = clockTime(new Date(at.getTime() + ttl * 60_000));
  return {
    status: `${level} access to ${database} granted until ${expires} UTC`,
    messages: replaceSurface(
      ACCESS_SURFACE_ID,
      surface(
        ACCESS_SURFACE_ID,
        ACCESS_THEME,
        ['header', 'session', 'audit', 'actions'],
        [
          ...iconRow(
            'header',
            'check',
            `Access granted · ${level}`,
            `${database} · ${ttl} min · revoked automatically at ${expires} UTC`,
            'h3'
          ),
          { id: 'session', component: 'Card', child: 'sessionBody' },
          { id: 'sessionBody', component: 'Column', children: ['sessionLabel', 'sessionValue'] },
          text('sessionLabel', 'Session', 'caption'),
          text('sessionValue', 'prod-tmp-8419', 'h2'),
          ...iconRow(
            'audit',
            'info',
            `Linked to ${ticket}`,
            'Audit entry AUD-20931 · on-call lead notified'
          ),
          { id: 'actions', component: 'Row', children: ['revoke'] },
          ...button(
            'revoke',
            'Revoke now',
            { name: 'revoke', context: { database } },
            { accessibleName: `Revoke access to ${database} now` }
          ),
        ]
      )
    ),
  };
}

// ── Order return ─────────────────────────────────────────────────────────────────────

const RETURN_SURFACE_ID = 'order-return';
const RETURN_THEME = { primaryColor: '#1D4ED8' };
const ORDER = {
  id: 'A-48213',
  delivered: 'Sep 30',
  items: [
    { id: 'headphones', name: 'Sony WH-1000XM5 · Black', price: 348 },
    { id: 'cable', name: 'USB-C cable · 2 m', price: 19 },
  ],
};
const REASONS = [['Defective'], ['Wrong item'], ['No longer needed']];
const RESOLUTIONS = [['Refund to Visa ••4421'], ['Store credit'], ['Exchange']];

function dollars(amount) {
  return `$${amount.toFixed(2)}`;
}

function itemTile(item) {
  const id = `item_${item.id}`;
  return [
    { id, component: 'Card', child: `${id}Row` },
    { id: `${id}Row`, component: 'Row', align: 'center', children: [`${id}Check`, `${id}Price`] },
    {
      id: `${id}Check`,
      component: 'CheckBox',
      label: item.name,
      value: { path: `/items/${item.id}` },
      weight: 1,
    },
    text(`${id}Price`, dollars(item.price), 'h4'),
  ];
}

export function returnSurface({ item }) {
  const wanted = item.toLowerCase();
  const selected = Object.fromEntries(
    ORDER.items.map((candidate) => [
      candidate.id,
      candidate.name.toLowerCase().includes(wanted) || wanted.includes(candidate.id),
    ])
  );
  const ready = {
    call: 'and',
    args: {
      values: [
        {
          call: 'or',
          args: { values: ORDER.items.map((i) => ({ path: `/items/${i.id}` })) },
          returnType: 'boolean',
        },
        { call: 'required', args: { value: { path: '/reason' } }, returnType: 'boolean' },
        { call: 'email', args: { value: { path: '/email' } }, returnType: 'boolean' },
      ],
    },
    returnType: 'boolean',
  };
  return surface(
    RETURN_SURFACE_ID,
    RETURN_THEME,
    ['header', 'items', 'reason', 'resolution', 'logistics', 'summary', 'divider', 'actions'],
    [
      ...iconRow(
        'header',
        'shoppingCart',
        `Return items from order #${ORDER.id}`,
        `Delivered ${ORDER.delivered} · free returns until Oct 30`,
        'h3'
      ),
      { id: 'items', component: 'Column', children: ORDER.items.map((i) => `item_${i.id}`) },
      ...ORDER.items.flatMap(itemTile),
      chips('reason', 'Reason', REASONS, '/reason'),
      chips('resolution', 'Resolution', RESOLUTIONS, '/resolution'),
      { id: 'logistics', component: 'Row', children: ['pickup', 'email'] },
      {
        id: 'pickup',
        component: 'DateTimeInput',
        label: 'Courier pickup',
        enableDate: true,
        value: { path: '/pickup' },
        min: '2026-10-08',
        weight: 1,
      },
      {
        id: 'email',
        component: 'TextField',
        label: 'Email the label to',
        value: { path: '/email' },
        weight: 1,
        checks: [
          {
            condition: {
              call: 'email',
              args: { value: { path: '/email' } },
              returnType: 'boolean',
            },
            message: 'Enter an email address',
          },
        ],
      },
      ...noteTile(
        'summary',
        'event',
        boundText(
          "${/resolution/0} · pickup ${formatDate(value: ${/pickup}, format: 'E, MMM d')} · label to ${/email}"
        )
      ),
      { id: 'divider', component: 'Divider' },
      { id: 'actions', component: 'Row', children: ['start', 'cancel'] },
      ...gatedButton(
        'start',
        'Start return',
        {
          name: 'start',
          context: {
            items: { path: '/items' },
            reason: { path: '/reason' },
            resolution: { path: '/resolution' },
            pickup: { path: '/pickup' },
            email: { path: '/email' },
          },
        },
        { variant: 'primary', accessibleName: `Start the return for order ${ORDER.id}` },
        ready,
        'Pick an item and a reason, and add an email'
      ),
      ...button(
        'cancel',
        'Cancel',
        { name: 'cancel' },
        { variant: 'borderless', accessibleName: 'Cancel this return' }
      ),
    ],
    {
      items: selected,
      reason: [],
      resolution: [RESOLUTIONS[0][0]],
      pickup: '2026-10-09',
      email: 'dana@example.com',
    }
  );
}

function shortDate(isoDate) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  return Number.isNaN(date.getTime())
    ? isoDate
    : date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
}

export function returnOutcome(name, context) {
  if (name === 'cancel') {
    const status = `Return for order #${ORDER.id} cancelled`;
    return {
      status,
      messages: replaceSurface(
        RETURN_SURFACE_ID,
        surface(
          RETURN_SURFACE_ID,
          RETURN_THEME,
          ['header'],
          iconRow('header', 'close', status, 'Nothing was changed', 'h3')
        )
      ),
    };
  }
  if (name !== 'start') {
    return { status: `${name} isn't available in this demo` };
  }
  const chosen = ORDER.items.filter((item) => context.items?.[item.id] === true);
  const total = chosen.reduce((sum, item) => sum + item.price, 0);
  const resolution = Array.isArray(context.resolution) ? context.resolution[0] : RESOLUTIONS[0][0];
  const pickup = shortDate(String(context.pickup ?? ''));
  const email = String(context.email ?? '');
  return {
    status: `Return approved: RMA-77310 · ${dollars(total)} · ${resolution}`,
    messages: replaceSurface(
      RETURN_SURFACE_ID,
      surface(
        RETURN_SURFACE_ID,
        RETURN_THEME,
        ['header', 'refund', 'pickup', 'label', 'packing', 'actions'],
        [
          ...iconRow(
            'header',
            'check',
            'Return approved · RMA-77310',
            chosen.map((item) => item.name).join(', '),
            'h3'
          ),
          { id: 'refund', component: 'Card', child: 'refundBody' },
          { id: 'refundBody', component: 'Column', children: ['refundLabel', 'refundValue'] },
          text('refundLabel', `${resolution} · within 5 business days`, 'caption'),
          text('refundValue', dollars(total), 'h2'),
          ...iconRow(
            'pickup',
            'event',
            `Courier pickup ${pickup}`,
            '9 am – 5 pm · leave the box at the door'
          ),
          ...iconRow('label', 'mail', `Label sent to ${email}`, 'Print it and tape it to the box'),
          ...iconRow(
            'packing',
            'warning',
            'Pack everything in the original box',
            'Include the case and all cables'
          ),
          { id: 'actions', component: 'Row', children: ['download', 'reschedule'] },
          ...button('download', 'Download label', { name: 'download' }, { variant: 'borderless' }),
          ...button(
            'reschedule',
            'Change pickup',
            { name: 'reschedule' },
            { variant: 'borderless' }
          ),
        ]
      )
    ),
  };
}

// ── MCP server ───────────────────────────────────────────────────────────────────────

const server = new McpServer(
  { name: 'a2ui-demo', version: '0.7.0' },
  { instructions: SERVER_INSTRUCTIONS }
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
    const facts =
      `${args.service} ${args.version} → ${args.environment}: 412 tests passed, canary healthy ` +
      '(p95 182 ms, 0 errors), includes a reversible DB migration.';
    if (!clientRendersA2ui(extra._meta)) {
      return { content: [{ type: 'text', text: `${facts} Waiting for the user to confirm.` }] };
    }
    return {
      content: [
        { type: 'text', text: `${facts} ${SHOWN_AS_CARD}` },
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
        { type: 'text', text: `${facts} ${SHOWN_AS_CARD}` },
        a2uiResource(tripSurface(args), TRIP_SURFACE_ID),
      ],
    };
  }
);

server.registerTool(
  'request_db_access',
  {
    title: 'Request production database access',
    description: 'Request temporary, audited access to a production database.',
    inputSchema: {
      database: z.string().default('orders-db').describe('Database name, e.g. orders-db'),
      purpose: z.string().describe('Why access is needed, in a few words'),
    },
  },
  async (args, extra) => {
    const levels = ACCESS_LEVELS.map(([, label]) => label).join(', ');
    const facts =
      `Temporary access to ${args.database} (production) needs an access level (${levels}), ` +
      'a duration of 15–240 minutes, a security ticket like SEC-1234, and acknowledgment of ' +
      'the PII data-handling policy.';
    if (!clientRendersA2ui(extra._meta)) {
      return { content: [{ type: 'text', text: `${facts} Collect these from the user.` }] };
    }
    return {
      content: [
        { type: 'text', text: `${facts} ${SHOWN_AS_CARD}` },
        a2uiResource(accessSurface(args), ACCESS_SURFACE_ID),
      ],
    };
  }
);

server.registerTool(
  'start_return',
  {
    title: 'Start a return',
    description: "Start a return for items in the user's most recent order.",
    inputSchema: {
      item: z.string().describe('The item to return, e.g. headphones'),
    },
  },
  async (args, extra) => {
    const items = ORDER.items.map((i) => `${i.name} (${dollars(i.price)})`).join(', ');
    const facts =
      `Order #${ORDER.id}, delivered ${ORDER.delivered}: ${items}. A return needs the items, ` +
      `a reason (${REASONS.flat().join(', ')}), a resolution (${RESOLUTIONS.flat().join(', ')}), ` +
      'a courier pickup date, and an email for the label.';
    if (!clientRendersA2ui(extra._meta)) {
      return { content: [{ type: 'text', text: `${facts} Collect these from the user.` }] };
    }
    return {
      content: [
        { type: 'text', text: `${facts} ${SHOWN_AS_CARD}` },
        a2uiResource(returnSurface(args), RETURN_SURFACE_ID),
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
    if (surfaceId === ACCESS_SURFACE_ID || surfaceId === RETURN_SURFACE_ID) {
      const outcome =
        surfaceId === ACCESS_SURFACE_ID
          ? accessOutcome(name, context)
          : returnOutcome(name, context);
      return {
        content: [
          { type: 'text', text: outcome.status },
          ...(outcome.messages ? [a2uiResource(outcome.messages, surfaceId)] : []),
        ],
      };
    }
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
