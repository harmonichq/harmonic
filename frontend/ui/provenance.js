// Field paths: how a displayed number names the served field it came from
// (#483). A component renders a sourced number as
// `<span data-source="outcomes.14.window_days">14</span>`, and the story check
// resolves that path against the fixtures and compares it with the text.
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
