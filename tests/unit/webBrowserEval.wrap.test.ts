import { describe, it, expect } from 'vitest';
import { wrapBrowserEvalCode } from '../../src/renderer/components/WebBrowserViewer';

describe('wrapBrowserEvalCode', () => {
  it('produces an expression wrapper that returns the completion value', () => {
    const { expression, fallback } = wrapBrowserEvalCode('document.body.innerText');

    expect(expression).not.toContain('eval(');
    expect(expression).toContain('return ( document.body.innerText )');
    expect(expression).toMatch(/\(async \(\) => \{ return \( document\.body\.innerText \); \}\)\(\)$/);
    expect(fallback).toContain('document.body.innerText');
    expect(fallback).toMatch(/\(async \(\) => \{\ndocument\.body\.innerText\n\}\)\(\)$/);
  });

  it('strips a trailing semicolon so bare statements become expressions', () => {
    const { expression } = wrapBrowserEvalCode('document.title;');
    expect(expression).toContain('return ( document.title )');
  });

  it('preserves top-level await in the expression wrapper', () => {
    const { expression } = wrapBrowserEvalCode('await document.querySelector("button").textContent');
    expect(expression).toContain('return ( await document.querySelector("button").textContent )');
  });

  it('keeps multi-line statements unchanged in the fallback wrapper', () => {
    const code = 'const x = 1;\nreturn x;';
    const { expression, fallback } = wrapBrowserEvalCode(code);

    // expression wrapper is unusable for declarations, but fallback should be exact.
    expect(expression).toContain('const x = 1;');
    expect(expression).toContain('return x )');
    expect(fallback).toBe('(async () => {\nconst x = 1;\nreturn x;\n})()');
  });

  it('never includes eval(...) in either wrapper', () => {
    const samples = [
      '1 + 1',
      'document.querySelector("button").click()',
      'const el = document.createElement("div")',
      'await fetch("/api")'
    ];
    for (const code of samples) {
      const { expression, fallback } = wrapBrowserEvalCode(code);
      expect(expression).not.toContain('eval(');
      expect(fallback).not.toContain('eval(');
    }
  });
});
