import { useId, useState, type ReactNode } from 'react';
import { createComponentImplementation } from '@a2ui/react/v0_9';
import {
  CheckBoxApi,
  ChoicePickerApi,
  DateTimeInputApi,
  SliderApi,
  TextFieldApi,
} from '@a2ui/web_core/v0_9/basic_catalog';
import { cn } from '../../utils';
import { Input } from '../ui/input';
import { weightStyle } from './a2uiLayout';

const LABEL = 'text-xs font-medium text-text-secondary';
const CONTROL = 'h-8 text-sm';

function firstError(errors: string[] | undefined): string | undefined {
  return errors && errors.length > 0 ? errors[0] : undefined;
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <span id={id} className="text-xs text-text-danger">
      {children}
    </span>
  );
}

/** Errors wait until the field is left, so an empty form doesn't open in red. */
export const GooseTextField = createComponentImplementation(TextFieldApi, ({ props }) => {
  const id = useId();
  const errorId = `${id}-error`;
  const [touched, setTouched] = useState(false);
  const error = touched ? firstError(props.validationErrors) : undefined;
  const shared = {
    id,
    value: props.value ?? '',
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
    onBlur: () => setTouched(true),
  };
  return (
    <div className="flex min-w-0 flex-col gap-1" style={weightStyle(props.weight)}>
      {props.label && (
        <label htmlFor={id} className={LABEL}>
          {props.label}
        </label>
      )}
      {props.variant === 'longText' ? (
        <textarea
          {...shared}
          rows={3}
          onChange={(event) => props.setValue(event.target.value)}
          className={cn(
            'w-full rounded-md border bg-background-primary px-3 py-1.5 text-sm focus:border-border-secondary focus-visible:outline-none',
            error && 'border-border-danger'
          )}
        />
      ) : (
        <Input
          {...shared}
          type={
            props.variant === 'number'
              ? 'number'
              : props.variant === 'obscured'
                ? 'password'
                : 'text'
          }
          onChange={(event) => props.setValue(event.target.value)}
          className={cn(CONTROL, error && 'border-border-danger')}
        />
      )}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
});

export const GooseCheckBox = createComponentImplementation(CheckBoxApi, ({ props }) => {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2 text-sm"
      style={weightStyle(props.weight)}
    >
      <input
        id={id}
        type="checkbox"
        checked={props.value === true}
        onChange={(event) => props.setValue(event.target.checked)}
        className="a2ui-check mt-0.5 size-4 shrink-0 cursor-pointer"
      />
      <span>{props.label}</span>
    </label>
  );
});

/**
 * Options render as chips: one tap selects, and the whole choice set stays visible.
 * Mutually exclusive pickers are radio groups for assistive technology.
 */
export const GooseChoicePicker = createComponentImplementation(ChoicePickerApi, ({ props }) => {
  const labelId = useId();
  const selected = Array.isArray(props.value) ? props.value : [];
  const exclusive = props.variant !== 'multipleSelection';
  const toggle = (value: string) => {
    if (exclusive) {
      props.setValue([value]);
    } else {
      props.setValue(
        selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]
      );
    }
  };
  return (
    <div className="flex min-w-0 flex-col gap-1.5" style={weightStyle(props.weight)}>
      {props.label && (
        <span id={labelId} className={LABEL}>
          {props.label}
        </span>
      )}
      <div
        role={exclusive ? 'radiogroup' : 'group'}
        aria-labelledby={props.label ? labelId : undefined}
        className="flex flex-wrap gap-1.5"
      >
        {(props.options ?? []).map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              role={exclusive ? 'radio' : 'checkbox'}
              aria-checked={isSelected}
              onClick={() => toggle(option.value)}
              className={cn(
                'a2ui-chip h-7 rounded-full border px-3 text-[13px] transition-colors',
                isSelected && 'a2ui-chip-selected'
              )}
            >
              {typeof option.label === 'string' ? option.label : option.value}
            </button>
          );
        })}
      </div>
    </div>
  );
});

export const GooseSlider = createComponentImplementation(SliderApi, ({ props }) => {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1" style={weightStyle(props.weight)}>
      <div className="flex items-baseline justify-between">
        {props.label && (
          <label htmlFor={id} className={LABEL}>
            {props.label}
          </label>
        )}
        <span className="text-xs tabular-nums text-text-secondary">{props.value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={props.min ?? 0}
        max={props.max}
        value={props.value ?? 0}
        onChange={(event) => props.setValue(Number(event.target.value))}
        className="a2ui-range w-full cursor-pointer"
      />
    </div>
  );
});

function inputType(enableDate: boolean | undefined, enableTime: boolean | undefined) {
  if (enableDate && enableTime) return 'datetime-local';
  return enableDate ? 'date' : 'time';
}

function toInputValue(value: string | undefined, type: string): string {
  if (!value) return '';
  const [datePart, timePart = ''] = value.includes('T') ? value.split('T') : [value, value];
  if (type === 'date') return datePart.slice(0, 10);
  if (type === 'time') return timePart.slice(0, 5);
  return `${datePart.slice(0, 10)}T${timePart.slice(0, 5)}`;
}

export const GooseDateTimeInput = createComponentImplementation(DateTimeInputApi, ({ props }) => {
  const id = useId();
  if (!props.enableDate && !props.enableTime) {
    return null;
  }
  const type = inputType(props.enableDate, props.enableTime);
  return (
    <div className="flex min-w-0 flex-col gap-1" style={weightStyle(props.weight)}>
      {props.label && (
        <label htmlFor={id} className={LABEL}>
          {props.label}
        </label>
      )}
      <Input
        id={id}
        type={type}
        value={toInputValue(props.value, type)}
        min={typeof props.min === 'string' ? props.min : undefined}
        max={typeof props.max === 'string' ? props.max : undefined}
        onChange={(event) => props.setValue(event.target.value)}
        className={cn(CONTROL, 'a2ui-date')}
      />
    </div>
  );
});
