// A live write for the stories (#495): it fails the first time and saves on
// every call after, so a play can press it, see "Not saved", and Retry. It
// changes no served answer: what the screen shows once it saves is the
// fixture's.
export function failsOnce<A extends unknown[], R>(saved: R) {
  let calls = 0;
  return async (..._args: A): Promise<R> => {
    calls += 1;
    if (calls === 1) throw new Error('not saved');
    return saved;
  };
}
