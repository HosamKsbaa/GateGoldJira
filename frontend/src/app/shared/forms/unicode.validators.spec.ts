import '@angular/compiler';
import { FormControl } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import { unicodeLength } from './unicode.validators';

describe('user-visible Unicode field limits', () => {
  it('counts supplementary characters as one code point and ignores surrounding whitespace', () => {
    const validate = unicodeLength(3);
    expect(validate(new FormControl('  ع😀a\n', { nonNullable: true }))).toBeNull();
    expect(validate(new FormControl('ع😀ab', { nonNullable: true }))).toEqual({ unicodeLength: { maximum: 3 } });
  });
  it('allows empty text for required validators to decide separately and counts combining marks consistently with Go rune limits', () => {
    const validate = unicodeLength(1);
    expect(validate(new FormControl('\t\n ', { nonNullable: true }))).toBeNull();
    expect(validate(new FormControl('e\u0301', { nonNullable: true }))).toEqual({ unicodeLength: { maximum: 1 } });
  });
});
