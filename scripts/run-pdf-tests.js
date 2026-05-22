#!/usr/bin/env node
/**
 * PDF Test Runner
 * 
 * This script runs all PDF-related tests and provides detailed output.
 * Use it to verify PDF functionality works correctly.
 * 
 * Usage:
 *   node scripts/run-pdf-tests.js
 * 
 * Or run individual test suites:
 *   npx vitest run tests/unit/pdfDatabase.test.ts
 *   npx vitest run tests/unit/pdfExport.test.ts
 *   npx vitest run tests/unit/SignatureModal.test.tsx
 *   npx vitest run tests/unit/pdfIntegration.test.ts
 */

const { execSync } = require('child_process');
const path = require('path');

const tests = [
  { name: 'Database Operations', file: 'tests/unit/pdfDatabase.test.ts' },
  { name: 'Export Utilities', file: 'tests/unit/pdfExport.test.ts' },
  { name: 'Signature Modal', file: 'tests/unit/SignatureModal.test.tsx' },
  { name: 'Integration Tests', file: 'tests/unit/pdfIntegration.test.ts' },
];

console.log('='.repeat(60));
console.log('PDF Functionality Test Suite');
console.log('='.repeat(60));
console.log();

let allPassed = true;

for (const test of tests) {
  console.log(`\nRunning: ${test.name}`);
  console.log('-'.repeat(40));
  
  try {
    execSync(`npx vitest run ${test.file} --reporter=verbose`, {
      cwd: path.dirname(__dirname),
      stdio: 'inherit',
    });
    console.log(`✓ ${test.name} passed`);
  } catch (error) {
    console.error(`✗ ${test.name} failed`);
    allPassed = false;
  }
}

console.log('\n' + '='.repeat(60));
if (allPassed) {
  console.log('✓ All PDF tests passed!');
  process.exit(0);
} else {
  console.log('✗ Some tests failed. See above for details.');
  process.exit(1);
}
