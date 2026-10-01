import test from 'node:test';
import assert from 'node:assert/strict';
import { extractAmounts, evidenceValues, ungroundedAmounts, redactAmounts, isGrounded } from './public/voice-transcript.js';

const evidence = evidenceValues({ savingsBalance: 326400, accounts: [{ name: 'Lønkonto', available: 75388, booked: 75563.5 }], asOf: '2026-09-12', budget: { monthly: { expenses: 40972.26 } }, entries: [{ amount: 1890, intervalMonths: 3 }] });

test('amounts are read in English and Danish formats, digits and number words, excluding years, times and percentages', () => {
  assert.deepEqual(extractAmounts('Savings 326,400 DKK; Lønkonto 75.388 kr.; 1,5 mio. kr.; 184 tusind kroner').map(x => x.value), [326400, 75388, 1500000, 184000]);
  assert.deepEqual(extractAmounts('Du har tre hundrede seksogtyve tusind fire hundrede kroner').map(x => x.value), [326400]);
  assert.deepEqual(extractAmounts('On 12 September 2026 at 10:20, 45.7% was retained on ****1234 and 3 accounts'), []);
});

test('grounded figures include exact, rounded, monthly-equivalent and two-figure totals; invented figures are not', () => {
  assert.deepEqual(ungroundedAmounts('326,400 DKK saved, about 75,000 DKK available, 75,564 booked, 40,972 DKK planned, 630 DKK per month for water.', evidence), []);
  assert.ok(isGrounded(401788, evidence), 'savings plus available is a derivable total');
  assert.deepEqual(ungroundedAmounts('You have 184,000 DKK in savings and 32,500 DKK on your salary account.', evidence), ['184,000 DKK', '32,500 DKK']);
  assert.deepEqual(ungroundedAmounts('Roughly 300,000 DKK', evidence), ['300,000 DKK'], 'rounding must keep two significant digits');
});

test('redaction removes earlier amounts but keeps dates and percentages', () => {
  assert.equal(redactAmounts('I said 184,000 DKK and 32.500 kr. on 12 September 2026 (45%).'), 'I said [amount] and [amount] on 12 September 2026 (45%).');
});