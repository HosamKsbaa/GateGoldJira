import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const ts = require('typescript');

// Generated Zod schema factories construct local values. Mark the complete
// initializer so unused endpoint schemas can leave the initial Angular bundle.
// Keep this transformation reproducible; never annotate registry mutations.
for (const relative of ['../frontend/src/app/api/generated/zod.gen.ts', '../frontend/src/app/api/fixture-generated/zod.gen.ts']) {
  const path = new URL(relative, import.meta.url);
  let text = readFileSync(path, 'utf8');
  if (/\.register\(|globalRegistry/.test(text)) throw new Error('Review schema registration before applying purity annotations.');
  const source = ts.createSourceFile(path.pathname, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const edits = [];
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement) || !statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const initializer = declaration.initializer;
      if (!initializer || !ts.isCallExpression(initializer)) continue;
      const start = initializer.getStart(source), end = initializer.getEnd();
      const value = text.slice(start, end);
      if (!/^(z\.|z[A-Z])/.test(value)) throw new Error('Review the new generated initializer before annotating it.');
      edits.push({ start, end, replacement: `/* @__PURE__ */ (() => ${value})()` });
    }
  }
  for (const edit of edits.reverse()) text = text.slice(0, edit.start) + edit.replacement + text.slice(edit.end);
  writeFileSync(path, text);
}
