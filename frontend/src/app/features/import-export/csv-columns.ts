/** Reads the first CSV record, including quoted commas, escaped quotes and CRLF. */
export function csvColumns(csv: string): string[] {
  const record = firstCSVRecord(csv.replace(/^\uFEFF/u, ''));
  if (!record) throw new Error('Choose a CSV with a header row.');
  const columns: string[] = [];
  let value = '',
    quoted = false;
  for (let index = 0; index < record.length; index++) {
    const char = record[index];
    if (char === '"') {
      if (quoted && record[index + 1] === '"') {
        value += '"';
        index++;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      columns.push(value.trim());
      value = '';
    } else value += char;
  }
  if (quoted) throw new Error('The CSV header has an unfinished quoted value.');
  columns.push(value.trim());
  if (columns.some(column => !column) || new Set(columns).size !== columns.length)
    throw new Error('CSV headers must be nonempty and unique.');
  return columns;
}

export function firstCSVRecord(csv: string): string {
  let quoted = false;
  for (let index = 0; index < csv.length; index++) {
    if (csv[index] === '"') {
      if (quoted && csv[index + 1] === '"') index++;
      else quoted = !quoted;
    }
    if (!quoted && (csv[index] === '\r' || csv[index] === '\n')) return csv.slice(0, index);
  }
  return csv;
}

/** Every bounded export page includes its header; keep it only in the first file chunk. */
export function withoutCSVHeader(csv: string): string {
  const header = firstCSVRecord(csv),
    rest = csv.slice(header.length);
  return rest.replace(/^\r?\n/u, '');
}
