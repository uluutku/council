import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(process.cwd(), 'src');
const forbiddenServerVariables = [
  ['OPENROUTER', 'API', 'KEY'].join('_'),
  ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_'),
  ['SUPABASE', 'DB', 'URL'].join('_'),
];

function listSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listSourceFiles(path) : [path];
  });
}

describe('frontend secret boundary', () => {
  it('does not reference server-only environment variable names', () => {
    const sourceFiles = listSourceFiles(sourceRoot).filter((path) =>
      ['.js', '.jsx'].includes(extname(path)),
    );

    for (const sourceFile of sourceFiles) {
      const contents = readFileSync(sourceFile, 'utf8');

      for (const variableName of forbiddenServerVariables) {
        expect(contents, `${variableName} found in ${sourceFile}`).not.toContain(variableName);
      }
    }
  });
});
