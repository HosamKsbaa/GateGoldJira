import { describe, expect, it } from 'vitest';
import { csvColumns, withoutCSVHeader } from './csv-columns';

describe('CSV header mapping and page concatenation', () => {
  it('accepts UTF-8 BOM, Arabic, escaped quotes, commas and CRLF', () => {
    expect(
      csvColumns('\uFEFFTitle,"وصف, عربي","Source ""key"""\r\nWork,Description,OLD-1\r\n'),
    ).toEqual(['Title', 'وصف, عربي', 'Source "key"']);
  });
  it('retains quoted line breaks and strips exactly one header during export paging', () => {
    expect(csvColumns('"Title\nالعنوان",Key\nwork,OLD-1')).toEqual(['Title\nالعنوان', 'Key']);
    expect(withoutCSVHeader('"Title\nالعنوان",Key\r\n"work\nشرح",OLD-1\r\n')).toBe(
      '"work\nشرح",OLD-1\r\n',
    );
  });
  it('rejects empty, repeated or malformed headers before sending a preview', () => {
    for (const invalid of ['', ',Title\nwork', 'Title,Title\nwork', '"Title,Key'])
      expect(() => csvColumns(invalid)).toThrow();
  });
  it('handles empty later pages without adding duplicate header lines', () => {
    expect(withoutCSVHeader('Title,Key\r\n')).toBe('');
    expect(withoutCSVHeader('Title,Key')).toBe('');
  });
});
