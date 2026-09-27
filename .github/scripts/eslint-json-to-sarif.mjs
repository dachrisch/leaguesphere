#!/usr/bin/env node
// Converts an ESLint JSON report (`eslint --format json`) into SARIF 2.1.0 for
// github/codeql-action/upload-sarif. Dependency-free on purpose: the official
// @microsoft/eslint-formatter-sarif still pins eslint ^8, while the apps use eslint 10.
//
// Usage: node eslint-json-to-sarif.mjs <eslint-report.json> <output.sarif>
// Paths in the SARIF are made relative to the current working directory (run it from the repo root).
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, sep } from 'node:path';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: eslint-json-to-sarif.mjs <eslint-report.json> <output.sarif>');
  process.exit(2);
}

const report = JSON.parse(readFileSync(input, 'utf8'));
const rules = new Map();
const results = [];

for (const file of report) {
  const uri = relative(process.cwd(), file.filePath).split(sep).join('/');
  for (const msg of file.messages) {
    const ruleId = msg.ruleId ?? 'eslint/fatal';
    if (!rules.has(ruleId)) {
      const rule = { id: ruleId, shortDescription: { text: ruleId } };
      // Core rules (no plugin prefix) have a stable docs page.
      if (msg.ruleId && !msg.ruleId.includes('/')) {
        rule.helpUri = `https://eslint.org/docs/latest/rules/${msg.ruleId}`;
      }
      rules.set(ruleId, rule);
    }
    const region = { startLine: msg.line ?? 1, startColumn: msg.column ?? 1 };
    if (msg.endLine) region.endLine = msg.endLine;
    if (msg.endColumn) region.endColumn = msg.endColumn;
    results.push({
      ruleId,
      level: msg.severity === 2 ? 'error' : 'warning',
      message: { text: msg.message },
      locations: [{ physicalLocation: { artifactLocation: { uri }, region } }],
    });
  }
}

const sarif = {
  $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
  version: '2.1.0',
  runs: [
    {
      tool: {
        driver: {
          name: 'ESLint',
          informationUri: 'https://eslint.org',
          rules: [...rules.values()],
        },
      },
      results,
    },
  ],
};

writeFileSync(output, JSON.stringify(sarif, null, 2));
console.log(`Wrote ${results.length} result(s) for ${report.length} file(s) to ${output}`);
