'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../..');
const scannedRoots = ['src', 'tests', 'docs', 'prisma'];
const forbiddenPatterns = [
  new RegExp(`\\$${'query'}${'Raw'}\\b`),
  new RegExp(`\\$${'execute'}${'Raw'}\\b`),
  new RegExp(`\\b${'query'}${'Raw'}\\b`),
  new RegExp(`\\b${'execute'}${'Raw'}\\b`),
  new RegExp(`\\b${'SEL'}${'ECT'}\\s+`, 'i'),
  new RegExp(`\\b${'FOR'}\\s+${'UPDATE'}\\b`, 'i'),
];

function collectFiles(dir, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'coverage') continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, result);
    } else if (/\.(js|sql|md|yaml|yml|prisma)$/.test(entry.name)) {
      result.push(fullPath);
    }
  }
  return result;
}

describe('ORM-only database access policy', () => {
  test('project files do not contain raw SQL patterns', () => {
    const offenders = [];

    for (const relativeRoot of scannedRoots) {
      const scanRoot = path.join(root, relativeRoot);
      for (const file of collectFiles(scanRoot)) {
        if (file === __filename) continue;
        const content = fs.readFileSync(file, 'utf8');
        for (const pattern of forbiddenPatterns) {
          if (pattern.test(content)) {
            offenders.push(path.relative(root, file));
            break;
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
