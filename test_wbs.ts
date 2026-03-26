import { compareWBS } from './src/lib/wbs-utils';

const tests = [
  { a: '1.9', b: '1.10', expected: -1 },
  { a: '1.10.1', b: '1.9.5', expected: 1 },
  { a: '1.1', b: '1.1.0', expected: 0 },
  { a: '2.1', b: '1.9.9.9', expected: 1 },
  { a: '1.9', b: '1.9', expected: 0 }
];

console.log('--- WBS Comparison Tests ---');
tests.forEach(({ a, b, expected }) => {
  const result = compareWBS(a, b);
  const sign = result === 0 ? 0 : result / Math.abs(result);
  const pass = sign === expected;
  console.log(`Comparing "${a}" vs "${b}": Result=${result} | Expected=${expected} | ${pass ? '✅ PASS' : '❌ FAIL'}`);
});
