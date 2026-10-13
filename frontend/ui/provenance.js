// Field paths: how a displayed number names the served field it came from
// (#483). A component renders a sourced number as
// `<span data-source="outcomes.14.window_days">14</span>`, and the story check
// resolves that path against the fixtures and compares it with the text.
//
// A derived number names its formula the same way: the source is fields joined
// by " × " (multiplied), and `data-format` names how the result is printed —
// `round` to the nearest whole number, `clock` as minutes since midnight in
// HH:MM. "Range 1–4 of 6" prints round(wilson.lo × n) and round(wilson.hi × n).
//
// Grammar: dot-separated keys and array indexes; `length` on an array; and one
// equality filter on an array segment, `prompts[answer=null]`, whose value is
// read as JSON (null, true, false, a number) or else as a plain string.
//
// Plain JS so the TypeScript stories and the Node story runner share it.

const SEGMENT = /^([^[\]]*)(?:\[([A-Za-z_][\w]*)=([^\]]*)\])?$/;

function literal(text) {
  try { return JSON.parse(text); } catch { return text; }
}

export function resolveField(root, path) {
  let value = root;
  for (const part of path.split('.')) {
    const match = SEGMENT.exec(part);
    if (!match) throw new Error(`bad field path segment "${part}" in ${path}`);
    const [, key, filterKey, filterValue] = match;
    if (key) {
      if (value === null || typeof value !== 'object' || !(key in value)) {
        throw new Error(`no field "${key}" in ${path}`);
      }
      value = value[key];
    }
    if (filterKey) {
      if (!Array.isArray(value)) throw new Error(`filter on a non-array in ${path}`);
      const want = literal(filterValue);
      value = value.filter((item) => item?.[filterKey] === want);
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
  if (format === 'clock') {
    const pad = (part) => String(part).padStart(2, '0');
    return `${pad(Math.floor(value / 60))}:${pad(value % 60)}`;
  }
  throw new Error(`unknown format "${format}"`);
}
