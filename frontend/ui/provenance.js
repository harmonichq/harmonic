// Field paths: how a displayed number names the served field it came from
// (#483). A component renders a sourced number as
// `<span data-source="outcomes.14.window_days">14</span>`, and the story check
// resolves that path against the fixtures and compares it with the text.
//
// A derived number names its formula the same way: the source is fields joined
// by " − " (subtracted), applied left to right to each field as its format
// prints it, and
// `data-format` names how the result is printed — `round` to the nearest whole
// number, `fixed1` or `fixed2` to one or two decimals, `pct1` a served
// proportion as a percentage to one decimal, `clock` as minutes since
// midnight in HH:MM, `day` as the day of the month of a YYYY-MM-DD date,
// `date` as the day and month of a served date or time ("19 May"), `time` as
// the HH:MM of a served "YYYY-MM-DD HH:MM:SS" time, `until` as the date
// fourteen days after a served time (§1.5 Snooze: "for 14 days"), `signed1`
// one decimal with its sign ("+0.6", "−3.1"), and `share` a whole percent of a
// quotient whose operands print to one decimal, as a day's insulin parts do.
// The 54–69 band prints tbr_lvl1 − tbr_lvl2 as fixed1; a part's share of the
// day's insulin is part ÷ total as share. The operators are − and ÷.
//
// Grammar: dot-separated keys and array indexes; `length` on an array; and one
// filter on an array segment: equality, `prompts[answer=null]`, whose value is
// read as JSON (null, true, false, a number) or else as a plain string; or a
// numeric bound, `night_roster[delivered_rate<0.6]`.
//
// Plain JS so the TypeScript stories and the Node story runner share it.

const SEGMENT = /^([^[\]]*)(?:\[([A-Za-z_][\w]*)([=<>])([^\]]*)\])?$/;
const COMPARE = {
  '=': (a, b) => a === b,
  '<': (a, b) => typeof a === 'number' && a < b,
  '>': (a, b) => typeof a === 'number' && a > b,
};

function literal(text) {
  try { return JSON.parse(text); } catch { return text; }
}

export function resolveField(root, path) {
  let value = root;
  // Split on dots outside brackets, so a filter bound may carry a decimal.
  for (const part of path.match(/(?:[^.[\]]|\[[^\]]*\])+/g) ?? []) {
    const match = SEGMENT.exec(part);
    if (!match) throw new Error(`bad field path segment "${part}" in ${path}`);
    const [, key, filterKey, operator, filterValue] = match;
    if (key) {
      if (value === null || typeof value !== 'object' || !(key in value)) {
        throw new Error(`no field "${key}" in ${path}`);
      }
      value = value[key];
    }
    if (filterKey) {
      if (!Array.isArray(value)) throw new Error(`filter on a non-array in ${path}`);
      const want = literal(filterValue);
      value = value.filter((item) => COMPARE[operator](item?.[filterKey], want));
    }
  }
  return value;
}

const OPERATORS = { '−': (a, b) => a - b, '÷': (a, b) => a / b };

// A number as its format prints it, back in the field's own scale: a formula
// works on the values the reader sees, so a change printed beside 25.5 and
// 23.3 is 2.2, never the 2.3 of their unrounded difference.
const PRINTED = {
  round: (v) => Math.round(v),
  fixed1: (v) => Number(v.toFixed(1)),
  fixed2: (v) => Number(v.toFixed(2)),
  pct1: (v) => Number((v * 100).toFixed(1)) / 100,
  signed1: (v) => Number(v.toFixed(1)),
  share: (v) => Number(v.toFixed(1)),
};

export function resolveSource(root, source, format) {
  const [first, ...rest] = source.split(/ ([−÷]) /);
  if (rest.length === 0) return resolveField(root, first);
  const printed = PRINTED[format] ?? ((v) => v);
  let value = printed(resolveField(root, first));
  for (let i = 0; i < rest.length; i += 2) {
    value = OPERATORS[rest[i]](value, printed(resolveField(root, rest[i + 1])));
  }
  return value;
}

const SNOOZE_DAYS = 14;
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatValue(value, format) {
  if (!format) return String(value);
  if (format === 'round') return String(Math.round(value));
  if (format === 'fixed1') return value.toFixed(1);
  if (format === 'fixed2') return value.toFixed(2);
  if (format === 'pct1') return (value * 100).toFixed(1);
  if (format === 'share') return String(Math.round(value * 100));
  if (format === 'signed1') {
    const rounded = Number(value.toFixed(1));
    if (rounded === 0) return '0.0';
    return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(1)}`;
  }
  if (format === 'day') return String(Number(value.slice(8, 10)));
  if (format === 'date') return `${Number(value.slice(8, 10))} ${MONTHS[Number(value.slice(5, 7)) - 1]}`;
  if (format === 'time') return value.slice(11, 16);
  if (format === 'until') {
    const day = new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)) + SNOOZE_DAYS));
    return `${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}`;
  }
  if (format === 'clock') {
    const pad = (part) => String(part).padStart(2, '0');
    return `${pad(Math.floor(value / 60))}:${pad(value % 60)}`;
  }
  throw new Error(`unknown format "${format}"`);
}
