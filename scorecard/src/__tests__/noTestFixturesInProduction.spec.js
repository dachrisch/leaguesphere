// Production code must not import test fixtures (architecture scan F6).
// eslint does not lint the .jsx files here (flat config defaults to *.js),
// so this test is the guard until that gap is closed.
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '..');
const IMPORT_FROM_TESTS = /^\s*import[^;]*from\s+['"][^'"]*__tests__[^'"]*['"]/m;

const isTestPath = (file) =>
  file.split(path.sep).includes('__tests__') || /\.(spec|test)\.[jt]sx?$/.test(file);

const productionFiles = (dir) =>
  fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return productionFiles(full);
    return /\.[jt]sx?$/.test(entry.name) && !isTestPath(full) ? [full] : [];
  });

describe('production sources', () => {
  it('import nothing from __tests__', () => {
    const offenders = productionFiles(SRC)
        .filter((file) => IMPORT_FROM_TESTS.test(fs.readFileSync(file, 'utf8')))
        .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
