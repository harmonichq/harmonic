// Field paths: how a displayed number names the served field it came from
// (#483). A component renders a sourced number as
// `<span data-source="outcomes.14.window_days">14</span>`, and the story check
// resolves that path against the fixtures and compares it with the text.
//
// A derived number names its formula the same way: the source is fields joined
// by " × " (multiplied), and `data-format` names how the result is printed —
// `round` to the nearest whole number, `fixed2` to two decimals, `clock` as
// minutes since midnight in HH:MM. "Range 1–4 of 6" prints round(wilson.lo × n) and round(wilson.hi × n).
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

export function resolveSource(root, source) {
  const values = source.split(' × ').map((path) => resolveField(root, path));
  return values.length === 1 ? values[0] : values.reduce((product, value) => product * value);
}

export function formatValue(value, format) {
  if (!format) return String(value);
  if (format === 'round') return String(Math.round(value));
  if (format === 'fixed2') return value.toFixed(2);
  if (format === 'clock') {
    const pad = (part) => String(part).padStart(2, '0');
    return `${pad(Math.floor(value / 60))}:${pad(value % 60)}`;
  }
  throw new Error(`unknown format "${format}"`);
}
