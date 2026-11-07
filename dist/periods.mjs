export const periods = [
  ['3m', '３分後'], ['1d', '１日後'], ['1w', '１週間後'], ['1mo', '１カ月後'],
  ['1y', '１年後'], ['5y', '５年後'], ['10y', '10年後'], ['random', '潮まかせ']
];

export function arrivalTime(now, period, random = Math.random) {
  if (period === 'random') {
    const count = periods.length - 1;
    period = periods[Math.floor(random() * count)][0];
  }

  const minute = 60_000;
  if (period === '3m') return now + 3 * minute;
  if (period === '1d') return now + 24 * 60 * minute;
  if (period === '1w') return now + 7 * 24 * 60 * minute;

  const months = { '1mo': 1, '1y': 12, '5y': 60, '10y': 120 }[period];
  if (!Number.isInteger(months)) throw new Error('Unknown period');
  const jst = 9 * 60 * minute;
  const date = new Date(now + jst);
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(lastDay, originalDay));
  return date.getTime() - jst;
}
