import { zSaveIssueFieldsRequest } from '../../../../api/generated/zod.gen';
import type { FailurePayload } from '../../../../core/api/api-result';
import type { SaveIssueFieldsRequest, FieldAssignment, FieldDefinition } from '../../../../api/generated/types.gen';
export type FieldValue = FieldAssignment['value'];
export function fieldText(value: FieldValue): string {
  if (!value) return '';
  switch (value.kind) {
    case 'text':
      return value.text;
    case 'number':
      return value.number;
    case 'date':
      return value.date;
    case 'choice':
      return value.optionId;
    case 'user':
      return value.userId;
  }
}
export function fieldValue(kind: FieldDefinition['kind'], text: string): FieldValue {
  if (!text) return null;
  switch (kind) {
    case 'text':
      return { kind, text };
    case 'number':
      return { kind, number: text };
    case 'date':
      return { kind, date: text };
    case 'choice':
      return { kind, optionId: text };
    case 'user':
      return { kind, userId: text };
  }
}

export function fieldDraftFailure(
  body: SaveIssueFieldsRequest,
  definitions: FieldDefinition[],
): FailurePayload | null {
  const result = zSaveIssueFieldsRequest.safeParse(body);
  if (result.success) return null;
  const fieldErrors = result.error.issues.slice(0, 100).map(issue => {
    const index = issue.path[0] === 'values' ? issue.path[1] : undefined;
    const assignment = typeof index === 'number' ? body.values[index] : undefined;
    const definition = definitions.find(field => field.id === assignment?.fieldId);
    return {
      field: definition?.name ?? 'Custom fields',
      message: assignment?.value?.kind === 'number'
        ? 'Use decimal digits, for example 12.5. Exponent notation is not supported.'
        : assignment
          ? 'Enter a valid value for this field.'
          : 'Save between one and 100 valid field values at a time.',
    };
  });
  return {
    error: {
      code: 'validation_failed',
      message: 'Check the custom field values before saving.',
      fieldErrors,
      nextAction: 'review_fields',
      retryable: false,
    },
    current: null,
    unfinished: null,
  };
}
