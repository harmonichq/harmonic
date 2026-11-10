// A drill-down router for the stories, as the app's is (tab-routing.js,
// ADR 594): `open` pushes an entry, `close` goes Back through it and reports
// the return, and `forward` goes Forward onto the entry the last Back left,
// reporting the drill-down it marks (#669). `at`: the drill-down entry the
// story starts on, as a Back from another tab lands on one.
import { fn } from 'storybook/test';

export function historyRouter<D>(at?: D) {
  const returns: (() => void)[] = [];
  const enters: ((drillDown: D) => void)[] = [];
  const entries: D[] = at === undefined ? [] : [at];
  const ahead: D[] = [];
  const listen = <L>(list: L[]) => (listener: L) => {
    list.push(listener);
    return () => { list.splice(list.indexOf(listener), 1); };
  };
  return {
    open: fn((drillDown: D) => { entries.push(drillDown); ahead.length = 0; }),
    close: fn(() => {
      const left = entries.pop();
      if (left !== undefined) ahead.push(left);
      returns.forEach((listener) => listener());
    }),
    onReturn: listen(returns),
    onEnter: listen(enters),
    forward: () => {
      const entered = ahead.pop()!;
      entries.push(entered);
      enters.forEach((listener) => listener(entered));
    },
  };
}
