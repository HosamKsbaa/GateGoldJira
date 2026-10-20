import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export function unicodeLength(maximum: number): ValidatorFn {
  return (control: AbstractControl<string>): ValidationErrors | null =>
    Array.from(control.value.trim()).length > maximum ? { unicodeLength: { maximum } } : null;
}
