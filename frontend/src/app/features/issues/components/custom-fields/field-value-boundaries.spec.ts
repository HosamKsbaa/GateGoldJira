import { describe, expect, it } from 'vitest';
import type { FieldAssignment, FieldDefinition, SaveIssueFieldsRequest } from '../../../../api/generated/types.gen';
import { fieldDraftFailure, fieldText, fieldValue } from './field-value';
const fieldId = '40000000-0000-4000-8000-000000000001';
const projectId = '20000000-0000-4000-8000-000000000001';
const definition: FieldDefinition = { id: fieldId, projectId, key: 'acceptance', name: 'دليل القبول', kind: 'text', required: false, retired: false, defaultValue: null };
const body = (value: FieldAssignment['value']): SaveIssueFieldsRequest => ({ expectedRevision: '9007199254740993', values: [{ fieldId, value }] });
describe('typed field draft round trips', () => {
    it.each([
        { kind: 'date', text: '2028-02-29', expected: { kind: 'date', date: '2028-02-29' } },
        { kind: 'choice', text: '50000000-0000-4000-8000-000000000001', expected: { kind: 'choice', optionId: '50000000-0000-4000-8000-000000000001' } },
        { kind: 'user', text: '10000000-0000-4000-8000-000000000003', expected: { kind: 'user', userId: '10000000-0000-4000-8000-000000000003' } },
    ] as const)('keeps the exact $kind identity when reopening a draft', ({ kind, text, expected }) => {
        const value = fieldValue(kind, text);
        expect(value).toEqual(expected);
        expect(fieldText(value)).toBe(text);
        expect(fieldDraftFailure(body(value), [{ ...definition, kind }])).toBeNull();
    });
    it.each(['text', 'number', 'date', 'choice', 'user'] as const)('distinguishes an explicit cleared %s from an omitted assignment', kind => {
        const assignment = body(fieldValue(kind, ''));
        expect(assignment.values).toEqual([{ fieldId, value: null }]);
        expect(fieldText(assignment.values[0]!.value)).toBe('');
        expect(fieldDraftFailure(assignment, [{ ...definition, kind }])).toBeNull();
    });
    it('does not trim meaningful author text or coerce a decimal through a JavaScript number', () => {
        const text = '  قبول 😀 مرحبا  ';
        expect(fieldText(fieldValue('text', text))).toBe(text);
        const decimal = '9999999999999999999999999999.1234567890';
        const value = fieldValue('number', decimal);
        expect(fieldText(value)).toBe(decimal);
        expect(fieldDraftFailure(body(value), [{ ...definition, kind: 'number' }])).toBeNull();
    });
});
describe('field errors preserve editable intentions before HTTP dispatch', () => {
    it.each(['1e6', '+12', '.5', '00.2', '12,5', 'NaN', 'Infinity', '1.12345678901'])('reports malformed decimal %s against its friendly definition', number => {
        const request = body({ kind: 'number', number });
        const before = structuredClone(request);
        const failure = fieldDraftFailure(request, [{ ...definition, kind: 'number' }]);
        expect(failure?.error).toMatchObject({ code: 'validation_failed', nextAction: 'review_fields', retryable: false, fieldErrors: [{ field: definition.name, message: expect.stringContaining('decimal digits') }] });
        expect(failure?.current).toBeNull();
        expect(failure?.unfinished).toBeNull();
        expect(request).toEqual(before);
    });
    it('uses a safe generic field name when no matching definition was loaded', () => {
        const failure = fieldDraftFailure(body({ kind: 'user', userId: 'not-a-user-id' }), []);
        expect(failure?.error.fieldErrors).toEqual([{ field: 'Custom fields', message: 'Enter a valid value for this field.' }]);
    });
    it('keeps a named calendar draft after an impossible date is rejected', () => {
        const request = body({ kind: 'date', date: '2027-02-29' });
        const failure = fieldDraftFailure(request, [{ ...definition, kind: 'date' }]);
        expect(failure?.error.fieldErrors).toEqual([{ field: definition.name, message: 'Enter a valid value for this field.' }]);
        expect(request.values[0]?.value).toEqual({ kind: 'date', date: '2027-02-29' });
    });
    it('describes an empty batch without pretending it is an uncertain network write', () => {
        const failure = fieldDraftFailure({ expectedRevision: '1', values: [] }, [definition]);
        expect(failure?.error.fieldErrors).toEqual([{ field: 'Custom fields', message: 'Save between one and 100 valid field values at a time.' }]);
        expect(failure?.error.nextAction).toBe('review_fields');
        expect(failure?.error.retryable).toBe(false);
    });
    it('rejects a missing revision even when every draft field is individually valid', () => {
        const failure = fieldDraftFailure({ ...body({ kind: 'text', text: 'Keep this value' }), expectedRevision: '0' }, [definition]);
        expect(failure?.error.fieldErrors).toEqual([{ field: 'Custom fields', message: 'Save between one and 100 valid field values at a time.' }]);
    });
    it('bounds an invalid batch error summary while keeping every unsent value untouched', () => {
        const values = Array.from({ length: 101 }, (_, index): FieldAssignment => ({ fieldId, value: { kind: 'number', number: 'invalid-' + index } }));
        const request = { expectedRevision: '1', values };
        const before = structuredClone(request);
        const failure = fieldDraftFailure(request, [{ ...definition, kind: 'number' }]);
        expect(failure?.error.fieldErrors).toHaveLength(100);
        expect(failure?.error.fieldErrors.every(error => error.field === definition.name)).toBe(true);
        expect(request).toEqual(before);
    });
    it('counts supplementary Unicode characters consistently with the published text limit', () => {
        const accepted = '😀'.repeat(5000);
        expect(fieldDraftFailure(body({ kind: 'text', text: accepted }), [definition])).toBeNull();
        const failure = fieldDraftFailure(body({ kind: 'text', text: accepted + 'ع' }), [definition]);
        expect(failure?.error.fieldErrors).toEqual([{ field: definition.name, message: 'Enter a valid value for this field.' }]);
    });
});
