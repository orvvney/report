const { chartScale, fullAmount, shortAmount, updatedTime } = require('../../src/report/chart.cjs');

test.each([
  ['7500000000', '8000000000', ['0', '2000000000', '4000000000', '6000000000', '8000000000']],
  ['8000000000', '8000000000', ['0', '2000000000', '4000000000', '6000000000', '8000000000']],
  ['8000000001', '9000000000', ['0', '2250000000', '4500000000', '6750000000', '9000000000']],
  ['750000000', '800000000', ['0', '200000000', '400000000', '600000000', '800000000']],
  ['7500000', '8000000', ['0', '2000000', '4000000', '6000000', '8000000']],
  ['999', '1000', ['0', '250', '500', '750', '1000']],
  ['35.2', '40', ['0', '10', '20', '30', '40']],
  ['0.31', '0.4', ['0', '0.1', '0.2', '0.3', '0.4']],
  ['0.3', '0.3', ['0', '0.075', '0.15', '0.225', '0.3']],
  ['0', '1', ['0', '0.25', '0.5', '0.75', '1']],
  ['0.3000', '0.3', ['0', '0.075', '0.15', '0.225', '0.3']],
  ['8000000000000000000.01', '9000000000000000000', ['0', '2250000000000000000', '4500000000000000000', '6750000000000000000', '9000000000000000000']],
])('scale for %s rounds the maximum upward with four equal intervals', (amount, maximum, ticks) => {
  expect(chartScale(['0', amount, '0'])).toEqual({ maximum, step: ticks[1], ticks });
});
test('empty scale and selection of the largest category', () => {
  expect(chartScale([])).toEqual({ maximum: '1', step: '0.25', ticks: ['0', '0.25', '0.5', '0.75', '1'] });
  expect(chartScale(['7500000000', '5000000000', '1000000000']).maximum).toBe('8000000000');
});
test('labels retain exact full decimals and format clean Armenian scale marks', () => {
  expect(fullAmount('1234567890.123456')).toBe('1 234 567 890.123456');
  expect(fullAmount('0.3')).toBe('0.3');
  expect(['0', '2000000000', '4000000000', '6000000000', '8000000000'].map(shortAmount))
    .toEqual(['0', '2 մլրդ', '4 մլրդ', '6 մլրդ', '8 մլրդ']);
  expect(chartScale(['0.31']).ticks.map(shortAmount)).toEqual(['0', '0,1', '0,2', '0,3', '0,4']);
  expect(shortAmount('0.075')).toBe('0,075');
  expect(shortAmount('8000000')).toBe('8 մլն');
  expect(shortAmount('1000')).toBe('1 հազ.');
});
test('update time uses Yerevan and fixed day/month/year with seconds, including date rollover', () => {
  expect(updatedTime(new Date('2026-10-23T10:05:09Z'))).toBe('23.10.2026 14:05:09');
  expect(updatedTime(new Date('2026-12-31T20:00:00Z'))).toBe('01.01.2027 00:00:00');
});
