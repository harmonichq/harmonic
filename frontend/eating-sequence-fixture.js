/** Expand shared values and object field layouts into independent served transports. */
export function expandSequenceFixture(payload) {
  function expand(value) {
    if (Array.isArray(value)) {
      if (value[0] === '$ref') {
        const referenced = payload.shared[value[1]];
        if (value.length === 3) {
          return Object.fromEntries(referenced.map((key, index) => [key, expand(value[2][index])]));
        }
        return expand(referenced);
      }
      return value.map(expand);
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, expand(child)]));
    }
    return value;
  }
  return { ...payload, states: expand(payload.states) };
}
