import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { basicCatalog } from '@a2ui/react/v0_9';
import { A2uiSurfaces } from '../A2uiSurfaces';
import type { A2uiMessage } from '../a2uiPayload';

const ticketIsValid = {
  call: 'regex',
  args: { value: { path: '/ticket' }, pattern: '^SEC-\\d{4,}$' },
};

function accessForm(): A2uiMessage[] {
  return [
    { version: 'v0.9', createSurface: { surfaceId: 'access', catalogId: basicCatalog.id } },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId: 'access',
        components: [
          {
            id: 'root',
            component: 'Column',
            children: ['role', 'ttl', 'expiry', 'ticket', 'ack', 'when', 'authorize'],
          },
          {
            id: 'role',
            component: 'ChoicePicker',
            label: 'Role',
            displayStyle: 'chips',
            options: [
              { label: 'Read-only', value: 'read' },
              { label: 'Debug', value: 'debug' },
            ],
            value: { path: '/role' },
          },
          {
            id: 'ttl',
            component: 'Slider',
            label: 'Duration',
            min: 15,
            max: 240,
            value: { path: '/ttl' },
          },
          {
            id: 'expiry',
            component: 'Text',
            text: { call: 'formatString', args: { value: 'Expires in ${/ttl} minutes' } },
          },
          {
            id: 'ticket',
            component: 'TextField',
            label: 'Ticket',
            value: { path: '/ticket' },
            checks: [{ condition: ticketIsValid, message: 'Use a SEC ticket, like SEC-1234' }],
          },
          { id: 'ack', component: 'CheckBox', label: 'I acknowledge', value: { path: '/ack' } },
          {
            id: 'when',
            component: 'DateTimeInput',
            label: 'Pickup',
            enableDate: true,
            value: { path: '/when' },
          },
          {
            id: 'authorize',
            component: 'Button',
            child: 'authorizeLabel',
            checks: [
              {
                condition: { call: 'and', args: { values: [ticketIsValid, { path: '/ack' }] } },
                message: 'Add a ticket and acknowledge',
              },
            ],
            action: {
              event: {
                name: 'authorize',
                context: {
                  role: { path: '/role' },
                  ttl: { path: '/ttl' },
                  ticket: { path: '/ticket' },
                },
              },
            },
          },
          { id: 'authorizeLabel', component: 'Text', text: 'Authorize' },
        ],
      },
    },
    {
      version: 'v0.9',
      updateDataModel: {
        surfaceId: 'access',
        path: '/',
        value: { role: ['read'], ttl: 60, ticket: '', ack: false, when: '2026-10-09' },
      },
    },
  ];
}

describe('goose input components', () => {
  it('keeps the action disabled until its checks pass, then sends the bound values', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<A2uiSurfaces messages={accessForm()} onAction={onAction} fallback="fallback" />);

    const authorize = await screen.findByRole('button', { name: 'Authorize' });
    expect(authorize).toBeDisabled();

    await user.type(screen.getByLabelText('Ticket'), 'SEC-4821');
    expect(authorize).toBeDisabled();
    await user.click(screen.getByLabelText('I acknowledge'));
    expect(authorize).toBeEnabled();

    await user.click(screen.getByRole('radio', { name: 'Debug' }));
    await user.click(authorize);

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({
      name: 'authorize',
      context: { role: ['debug'], ttl: 60, ticket: 'SEC-4821' },
    });
  });

  it('marks the selected chip and moves the selection on click', async () => {
    const user = userEvent.setup();
    render(<A2uiSurfaces messages={accessForm()} fallback="fallback" />);

    const readOnly = await screen.findByRole('radio', { name: 'Read-only' });
    const debug = screen.getByRole('radio', { name: 'Debug' });
    expect(readOnly).toHaveAttribute('aria-checked', 'true');

    await user.click(debug);

    expect(debug).toHaveAttribute('aria-checked', 'true');
    expect(readOnly).toHaveAttribute('aria-checked', 'false');
  });

  it('updates text bound to the slider as it moves', async () => {
    render(<A2uiSurfaces messages={accessForm()} fallback="fallback" />);

    expect(await screen.findByText('Expires in 60 minutes')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '120' } });

    expect(await screen.findByText('Expires in 120 minutes')).toBeInTheDocument();
  });

  it('shows a field error only after the field is left', async () => {
    const user = userEvent.setup();
    render(<A2uiSurfaces messages={accessForm()} fallback="fallback" />);

    const ticket = await screen.findByLabelText('Ticket');
    await user.type(ticket, 'oops');
    expect(screen.queryByText('Use a SEC ticket, like SEC-1234')).not.toBeInTheDocument();

    await user.tab();

    expect(screen.getByText('Use a SEC ticket, like SEC-1234')).toBeInTheDocument();
    expect(ticket).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a date-only input with its bound value', async () => {
    render(<A2uiSurfaces messages={accessForm()} fallback="fallback" />);

    const pickup = await screen.findByLabelText('Pickup');
    expect(pickup).toHaveAttribute('type', 'date');
    expect(pickup).toHaveValue('2026-10-09');
  });
});
