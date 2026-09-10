/** Expand the generator's shared JSON values into independent served transports. */
export function expandSequenceFixture(payload) {
  function expand(value) {
    if (Array.isArray(value)) return value.map(expand);
    if (value && typeof value === 'object') {
      if (Object.keys(value).length === 1 && Object.hasOwn(value, '$ref')) {
        return expand(payload.shared[value.$ref]);
      }
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, expand(child)]));
    }
    return value;
  }
  return { ...payload, states: expand(payload.states) };
}
