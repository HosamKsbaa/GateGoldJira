import { describe, expect, it } from 'vitest';
import { fieldDraftFailure, fieldText, fieldValue } from './field-value';
describe('field values at the browser boundary', () => {
  it('keeps decimal digits beyond JavaScript number precision', () => {
    const value = fieldValue('number', '9007199254740993.1234567890');
    expect(value).toEqual({ kind: 'number', number: '9007199254740993.1234567890' });
    expect(fieldText(value)).toBe('9007199254740993.1234567890');
  });
  it('preserves Arabic content and represents an explicit clear', () => {
    expect(fieldValue('text', 'معيار القبول')).toEqual({ kind: 'text', text: 'معيار القبول' });
    expect(fieldValue('text', '')).toBeNull();
    expect(fieldText(null)).toBe('');
  });
});

describe('custom-field draft validation before dispatch', () => {
  const field = {
    id: '10000000-0000-4000-8000-000000000010',
    projectId: '20000000-0000-4000-8000-000000000001',
    key: 'estimate',
    name: 'Precise estimate',
    kind: 'number' as const,
    required: false,
    retired: false,
    defaultValue: null,
  };
  it('reports the invalid numeric field so the unsent draft can be corrected', () => {
    const failure = fieldDraftFailure({
      expectedRevision: '1',
      values: [{ fieldId: field.id, value: { kind: 'number', number: '1e6' } }],
    }, [field]);
    expect(failure?.error.code).toBe('validation_failed');
    expect(failure?.error.nextAction).toBe('review_fields');
    expect(failure?.error.retryable).toBe(false);
    expect(failure?.error.fieldErrors).toEqual([{
      field: 'Precise estimate',
      message: 'Use decimal digits, for example 12.5. Exponent notation is not supported.',
    }]);
  });
  it('accepts corrected decimal text without changing its precision', () => {
    const body = {
      expectedRevision: '1',
      values: [{ fieldId: field.id, value: { kind: 'number' as const, number: '9007199254740993.1234567890' } }],
    };
    expect(fieldDraftFailure(body, [field])).toBeNull();
    expect(body.values[0]?.value.number).toBe('9007199254740993.1234567890');
  });
});
