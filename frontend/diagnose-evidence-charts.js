import {
  eventComparisonChartOption,
  eventComparisonGlucoseValues,
  GLUCOSE_ENVELOPE,
  GLUCOSE_STEP,
  glucoseRange,
} from './diagnose-event-comparison.js';
import { mealMemberMarkers, GRID } from './diagnose-workstation-chart.js';

export { eventComparisonGlucoseValues, GLUCOSE_ENVELOPE, GLUCOSE_STEP, glucoseRange };

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const FONT = 'Inter, system-ui, sans-serif';
const FALLBACK_COLORS = {
  signal: '#3f5a3b', basal: '#5d7368', programmed: '#4d5c53',
  line: '#c3bfb4', text: '#141a15', muted: '#3d5848', excluded: '#6b7169',
  high: '#a94f21', low: '#9d3018', sunken: '#e7e4dc', ruleStrong: '#6b7669',
};
const COLOR_TOKENS = {
  signal: '--in-range', basal: '--basal', programmed: '--secondary',
  line: '--line', text: '--text', muted: '--muted', excluded: '--notindata',
  high: '--high', low: '--low', sunken: '--wk-surface-sunken', ruleStrong: '--wk-rule-strong',
};
const chartColors = () => {
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') {
    return { ...FALLBACK_COLORS,
      target: `color-mix(in srgb, ${FALLBACK_COLORS.signal} 8%, transparent)` };
  }
  const styles = getComputedStyle(document.documentElement);
  const colors = Object.fromEntries(Object.entries(COLOR_TOKENS).map(([name, token]) => [
    name, styles.getPropertyValue(token).trim() || FALLBACK_COLORS[name],
  ]));
  return { ...colors,
    target: `color-mix(in srgb, ${colors.signal} 8%, transparent)` };
};
/* Both grids open on the canvas-wide spine, so a tile's numbers and its title
   start where the strip's do. The right inset is not a spine — it is however
   much of the LAST x-axis label hangs past the final tick, which is half a date
   at full rank and half a "1,500" at mini. At 22 and 6 those were being cut. */
const FULL_GRID = Object.freeze({
  left: GRID.left, right: 34, top: 26, bottom: 42, containLabel: false,
});
/* A MINI KEEPS NO AXIS FURNITURE AT ALL, so its grid is inset by nothing but a
   hairline of air. The spine alignment the full grid honours exists so a tile's
   NUMBERS start where the strip's do; a mini has no numbers to align, and the
   32px it was reserving for them was a third of the cell. */
const MINI_GRID = Object.freeze({
  left: 6, right: 6, top: 6, bottom: 6, containLabel: false,
});

const grid = (mini) => ({ ...(mini ? MINI_GRID : FULL_GRID) });
/* An axis NAME was left at ECharts' own defaults — 12px in the chart's own font
   with a 15px gap — so it drew a rank the canvas does not have, and at that gap
   it sat above the grid's own top and was cut off by the tile ("U/h" losing its
   head, "mg/dL" floating clear of its plot). It comes down to the caps rank the
   rest of the metadata uses, and close enough to the axis to belong to it. */
const axis = (colors, mini = false) => ({
  axisLine: { show: false },
  axisTick: { show: false },
  /* AT MINI RANK THERE IS NO AXIS AT ALL — no labels, no split lines and no
     name. Ruled on the built strip: at 8px the tick labels ran together into a
     smear that reads as texture rather than as numbers, and the grid they ruled
     spent most of a 148px cell on furniture nobody can use. A mini's question
     is whether there is a shape here worth opening, which is the one thing the
     plot alone answers; every number it needs is a click away on the stage.

     The name goes for the older reason too: "glucose change (mg/dL)" is wider
     than a cell's whole plot, so it ran off the left edge, and shrinking it
     only made an unreadable thing that still overhung. Every axis object here
     spreads this last, so what a caller set is dropped rather than restyled. */
  axisLabel: { show: !mini, color: colors.muted, fontFamily: MONO, fontSize: 10 },
  nameTextStyle: { color: colors.muted, fontFamily: FONT, fontSize: 9 },
  nameGap: 8,
  splitLine: { show: !mini, lineStyle: { color: colors.line, width: 1 } },
  ...(mini ? { name: undefined } : {}),
});
const chartBase = (description, mini, colors) => ({
  animation: false,
  backgroundColor: 'transparent',
  textStyle: { fontFamily: FONT, color: colors.text },
  aria: { enabled: true, decal: { show: false }, description },
  grid: grid(mini),
});
/* A MINI TILE CARRIES NO LEGEND. It is a thumbnail, and its question is whether
   there is a shape here worth opening — not which series is which, at a size
   where they cannot be told apart anyway. It was spending a third of a ~100px
   plot naming two series the tile's own caption has already introduced. */
const chartLegend = (data, colors, mini = false) => (mini ? { show: false } : {
  show: true, left: GRID.left, right: 22, bottom: 0, selectedMode: false,
  itemWidth: 22, itemHeight: 8, itemGap: 18,
  textStyle: { color: colors.muted, fontFamily: FONT, fontSize: 9 },
  data,
});
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const hhmm = (minute) => {
  const normalized = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
};
const minuteOfDay = (timestamp) => {
  const match = /T(\d\d):(\d\d)/.exec(timestamp || '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
};
const clockFrame = ([start, end] = [0, 1440]) => {
  const full = start === 0 && end >= 1439;
  const span = full ? 1440 : (((end - start) % 1440) + 1440) % 1440 || 1440;
  return {
    span,
    map: (minute) => (((minute - start) % 1440) + 1440) % 1440,
    label: (offset) => hhmm(offset + start),
  };
};

function thumbnail(name, count, series = []) {
  const colors = chartColors();
  return {
    animation: false,
    backgroundColor: 'transparent',
    grid: { left: 4, right: 4, top: 28, bottom: 4 },
    xAxis: { show: false, type: 'category' },
    yAxis: { show: false, type: 'value' },
    graphic: [
      { type: 'text', left: 5, top: 4, silent: true,
        style: { text: name, fill: colors.muted, font: `600 9px ${FONT}` } },
      { type: 'text', right: 5, top: 3, silent: true,
        style: { text: String(count), fill: colors.text, font: `700 10px ${MONO}` } },
    ],
    series,
  };
}

/* The analyzer's verdict, said in the reader's words. `safety_status` is the
   engine's own closed display set (`Status` in `ciq_autotune/safety.py`), so the
   chart renames the verdict it was handed rather than re-deriving one — the
   staging predicate stays the backend's `asserts_move`, and these two names are
   the only thing the tile adds. A status outside the set reads as insufficient,
   which is the safe reading of a verdict this surface does not recognise. */
const BASAL_HELD_STATUSES = Object.freeze(new Set([
  'no change', 'held (recurring-low gate)',
]));
const basalVerdict = (data) => {
  if (data?.asserts_move === true) return 'Supported';
  return BASAL_HELD_STATUSES.has(data?.safety_status) ? 'Held' : 'Insufficient evidence';
};

const basalFacts = (data) => {
  const nights = data?.nights || [];
  const oldestFirst = [...nights].sort((a, b) => (a.date < b.date ? -1 : 1));
  const programmed = oldestFirst.find((night) => finite(night.programmed_rate))?.programmed_rate;
  const ciLo = data?.estimate?.lo;
  const ciHi = data?.estimate?.hi;
  const estimateValue = data?.estimate?.value;
  const delivered = nights.map((night) => night.delivered_rate).filter(finite);
  const sorted = [...delivered].sort((a, b) => a - b);
  const p85 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .85))] : 0;
  return {
    nights, oldestFirst, programmed, ciLo, ciHi, estimateValue, p85,
    above: nights.filter((night) => night.sign === 1).length,
    below: nights.filter((night) => night.sign === -1).length,
    atRate: nights.filter((night) => night.sign === null).length,
  };
};

/* SIXTEEN OF TWENTY — the roster as ONE silhouette instead of twenty marks.
   Every other basal form here plots one mark per night; this one counts, for a
   given rate, how many nights the algorithm ran AT OR ABOVE it. Each night is
   its own 1-night step, so nothing is smoothed and nothing is invented, but the
   roster becomes a single object with a shape read in one glance. The wearer's
   programmed rate is a vertical rule through it, and where the staircase stands
   as it crosses that rule IS the finding: the nights at exactly the programmed
   rate fall as a cliff landing on the rule itself. Everything else — the tally,
   the exclusions, the verdict — is set as type, because only the part carrying
   the argument earns ink. */
/* THREE SEATS, THREE RANKS. The workstation draws this chart at the stage's
   ~950px, in the explorer grid at ~480, and in the dock strip as a thumbnail —
   and it tells the option which by the only signal that is true in all three:
   the host element it is about to mount into, already passed as `surface` for
   every tile. The seat NAME would be the obvious channel (`grid` for explorer
   cells), but `fieldNarrow` shrinks the FOCAL seat too, and a rank chosen by
   name would pour the 950px deck into a 600px stage exactly as it poured into
   the explorer. The box is the fact; the seat is only an intention. */
const EDITORIAL = Object.freeze({
  margin: 28, deckTop: 16, figureTop: 80, footerBand: 80, rail: 206,
});
/* At the middle rank the deck and the rail are gone: a 21px headline needs
   620px to itself and the rail spends 206 of a 480px cell on type. What they
   carried that the figure cannot — the verdict, the estimate and its range, the
   three-way tally and the exclusions — is compressed into two lines above the
   plot, so no fact leaves the tile with them. */
const EDITORIAL_MIDDLE = Object.freeze({
  margin: 14, deckTop: 8, tallyTop: 24, figureTop: 46, footerBand: 54, rail: 0,
});
const MIDDLE_RANK_WIDTH = 780;
/* THE RAIL IS A TABLE, so it is set as one: a numeral column right-aligned to a
   fixed x, a fixed gutter, and a label column left-aligned to a fixed x, with
   one pitch down the whole section. Set as rich-text rows it was neither — each
   row's line box was laid out to its own content, so the numerals staggered
   (11, 4, 5 each finding its own right edge) and a wrapped label centred itself
   under its row. The label column is only as wide as the labels need, so the
   PAIR stays tight and the block of pairs sits against the rail's own margin:
   stretched to the full rail width the numerals ended up marooned a column away
   from the words they belong to, with the white space inside the row. */
const RAIL = Object.freeze({ gutter: 10, label: 132, pitch: 24, lead: 14 });
/* Canvas text has no flow, so a line break is a decision made here. The budget
   is a character count off the font's mean advance — a hairline of slack is
   cheaper than measuring text the layout cannot reflow anyway. */
const editorialWrap = (text, width, size) => {
  const budget = Math.max(8, Math.floor(width / (size * .52)));
  const lines = [];
  for (const word of text.split(' ')) {
    const last = lines.length - 1;
    if (last >= 0 && `${lines[last]} ${word}`.length <= budget) lines[last] += ` ${word}`;
    else lines.push(word);
  }
  return lines.join('\n');
};

function basalEditorialOption(data, mini, colors, surface) {
  const seatWidth = surface?.clientWidth || surface?.getBoundingClientRect?.().width || 0;
  const compact = !mini && seatWidth > 0 && seatWidth < MIDDLE_RANK_WIDTH;
  const L = compact ? EDITORIAL_MIDDLE : EDITORIAL;
  const facts = basalFacts(data);
  const { ciLo, ciHi, estimateValue } = facts;
  /* ONE DERIVATION, EVERY COPY, AND IT IS THE ANALYZER'S. `analyze_basal` stamps
     a night's direction from that night's own median departure against the rate
     in force THAT NIGHT (`night_signs`, basal.py), and the projection copies it
     verbatim. This chart used to re-derive direction from pixels — was the cell's
     end right of the rule — against one programmed value lifted off the oldest
     night, so a roster spanning a profile change drew, counted and read aloud a
     rate half its nights never had, and the geometry could contradict the served
     verdict outright. The served sign decides colour and every count; the night's
     own `programmed_rate` decides where its cell is anchored.
     A NIGHT WITH NO SIGN IS TWO DIFFERENT NIGHTS. `night_signs` records only
     nonzero departures, so `sign: null` is either a true tie — Control-IQ
     delivering the profile, "exactly as set" — or a night the analyzer could not
     compare at all, because it had no programmed samples ("missing as-of rates
     make that night unavailable"). The roster carries the distinguisher: the
     unavailable night has no `programmed_rate` either, and claiming it ran
     exactly as set would credit a rate that was never on file. */
  const nightKind = (night) => (night.sign === 1 ? 'more'
    : night.sign === -1 ? 'less'
      : finite(night.programmed_rate) ? 'as-set' : 'unpaired');
  /* ONE DENOMINATOR TOO. A night without a delivered rate cannot be drawn, so it
     is not in the stack; counting it in the tally beside a stack that omits it
     made the two disagree by construction. The roster the chart draws IS the
     roster it counts. */
  const roster = facts.nights.filter((night) => finite(night.delivered_rate));
  const departure = (night) => (finite(night.programmed_rate)
    ? night.delivered_rate - night.programmed_rate : null);
  /* Sorted largest-more first, through the nights that ran exactly as set, to
     largest-less last, so a night's row is its rank BY DEPARTURE — which is the
     order the sort always meant and only equalled delivered rate while every
     night shared one programmed value. Nights the analyzer could not compare
     have no departure to rank, so they settle at the foot of the stack. */
  roster.sort((a, b) => {
    const left = departure(a);
    const right = departure(b);
    if (left === null || right === null) {
      return (left === null ? 1 : 0) - (right === null ? 1 : 0)
        || b.delivered_rate - a.delivered_rate;
    }
    return right - left;
  });
  const kinds = roster.map(nightKind);
  const above = kinds.filter((kind) => kind === 'more').length;
  const below = kinds.filter((kind) => kind === 'less').length;
  const atRate = kinds.filter((kind) => kind === 'as-set').length;
  const unpaired = kinds.filter((kind) => kind === 'unpaired').length;
  const rates = roster.map((night) => night.delivered_rate).sort((a, b) => a - b);
  const anchors = roster.map((night) => night.programmed_rate).filter(finite);
  const total = rates.length;
  /* THE RULE IS TODAY'S RATE, not a night's. The analyzer publishes the value in
     force now as `current`; the nights carry their own. Where an older payload
     serves no `current`, the newest night's programmed rate is the closest thing
     on file to it — and it is the same number whenever the profile has not
     moved, which is every roster but the interesting one. */
  const programmed = finite(data?.current) ? data.current
    : [...facts.nights].sort((a, b) => (a.date < b.date ? 1 : -1))
      .find((night) => finite(night.programmed_rate))?.programmed_rate;
  const hasRule = finite(programmed);
  const hasBand = finite(ciLo) && finite(ciHi);
  const round2 = (value) => Math.round(value * 100) / 100;
  /* THE ARGUMENT SETS THE SCALE, NOT THE OUTLIERS. A single tall night can
     stretch the domain until the whole finding is crushed into a corner of
     the tile; the ceiling rides the roster's own 85th percentile and the
     interval instead,
     and the nights past it leave by a caret carrying their true value, never
     silently clipped. The step ladder holds no quarter: a .25 tick prints as
     "0.3" at one decimal and prints as a lie. */
  /* EVERY ANCHOR IS IN THE DOMAIN, outlier rule or not: a cell is drawn FROM its
     own programmed rate, so a scale that clipped one would draw that night's
     delta from nowhere. Deliveries still answer to the 85th percentile. */
  const ceiling = Math.max(ciHi || 0, estimateValue || 0, programmed || 0,
    facts.p85, ...anchors) || 1;
  const lo = Math.min(...[rates[0], programmed, ciLo, ...anchors].filter(finite), ceiling);
  const pad = Math.max((ceiling - lo) * .12, .05);
  const xSpan = (ceiling - lo) + pad * 2;
  const xStep = xSpan > 2 ? .5 : xSpan > .8 ? .2 : xSpan > .4 ? .1 : .05;
  const xMin = Math.max(0, round2(Math.floor((lo - pad) / xStep) * xStep));
  const xMax = round2(Math.ceil((ceiling + pad) / xStep) * xStep);
  const tickStep = compact && (xMax - xMin) / xStep > 6 ? xStep * 2 : xStep;
  const yMax = Math.max(total, 1);
  /* The staircase is never drawn. Sorted by rate and stacked one to a row, the
     nights' own right-hand ends land in a descending flight — the silhouette is
     implied by arrangement, which is all this roster supports. A path through
     those ends would assert that the nights are a series, and they are not: they
     are independent observations, which is the argument that retired the line
     chart this form replaced. Nothing here spans more than one night. */
  const overflow = rates.filter((rate) => rate > xMax).length;
  /* The crossing is counted, not measured: the nights at or above the rate
     programmed for them are the ones the analyzer signed `more` plus the true
     ties, and under the departure sort they are exactly the rows above the
     boundary. Reading it off the pixels asked the geometry a question only the
     served sign can answer. */
  const crossing = above + atRate;
  /* A slot the payload did not number has no window to print, and printing one
     anyway is how `NaN:NaN` reaches a tile. */
  const slotLabel = finite(data?.slot) ? hhmm(data.slot * 30) : null;
  const slotWindow = slotLabel ? `${slotLabel}–${hhmm(data.slot * 30 + 30)}` : null;
  const ink = (percent) => `color-mix(in srgb, ${colors.text} ${percent}%, transparent)`;
  const rustFill = `color-mix(in srgb, ${colors.high} 34%, transparent)`;
  const greyFill = `color-mix(in srgb, ${colors.basal} 24%, transparent)`;
  const hair = ink(18);
  const shadow = ink(26);
  /* ONE NIGHT, ONE CELL, ANCHORED ON THE RULE. A night is the row it occupies
     and the distance it ran from the rate the wearer set: rust to the right when
     it ran more, grey-green to the left when it ran less, and a short tick
     standing ON the rule when it ran exactly as set. There is no common baseline
     at the plot's edge for the cells to grow from, so no cell shares an edge
     with another and nothing spans two nights — the descending silhouette is
     what the sorted ends make, not something drawn through them. The far end of
     each cell carries a 2px tick in that night's own colour at full strength;
     the fills carry the mass. At mini rank the rows abut, and only the as-set
     nights keep a mark of their own, because at that size a night that ran the
     programmed rate exactly has no width to be seen by. */
  const nightCells = (gap, tick) => ({
    type: 'custom', id: 'nights', animation: false, clip: false, z: 3,
    data: roster.map((night, index) => ({
      value: [Math.min(night.delivered_rate, xMax), index + 1], name: night.date,
      /* The cell can be pinned to the ceiling; the number it reports may never
         be — and the rate it reports as programmed is the one THIS night was
         measured against, never today's schedule standing in for it. */
      delivered: night.delivered_rate,
      programmed: night.programmed_rate,
    })),
    renderItem: (params, api) => {
      const night = roster[params.dataIndex];
      const upper = api.coord([xMin, api.value(1) - 1])[1];
      const lower = api.coord([xMin, api.value(1)])[1];
      const row = Math.abs(lower - upper);
      const held = Math.min(gap, row * .28);
      const y = Math.min(upper, lower) + held / 2;
      const cell = Math.max(mini ? .5 : 1.5, row - held);
      /* Anchored on the rate programmed for THAT night. Where the profile never
         moved this is the rule for every row and the stack reads as one datum;
         where it did move, the off-rule anchors are the honest picture of a
         roster spanning the change, not a defect to hide. */
      const kind = nightKind(night);
      const anchorRate = finite(night.programmed_rate) ? night.programmed_rate : programmed;
      const anchor = finite(anchorRate) ? api.coord([anchorRate, 0])[0] : params.coordSys.x;
      const end = api.coord([Math.min(night.delivered_rate, xMax), 0])[0];
      const children = [];
      if (kind === 'more' || kind === 'less') {
        /* The served sign paints it; the two rates only measure it. Drawing the
           span from whichever end is left keeps the mark from inverting should a
           payload ever disagree with itself. */
        children.push({ type: 'rect',
          shape: { x: Math.min(anchor, end), y,
            width: Math.max(Math.abs(end - anchor), 1.5), height: cell },
          style: { fill: kind === 'more' ? rustFill : greyFill } });
      } else if (kind === 'as-set') {
        children.push({ type: 'rect',
          shape: { x: anchor - (mini ? 1.5 : 4.5), y, width: mini ? 3 : 9, height: cell },
          style: { fill: colors.programmed } });
      } else {
        /* No programmed rate on file for this night: there is no delta to draw,
           so it is marked where it ran, in the ink the app keeps for what is not
           in the data. */
        children.push({ type: 'rect',
          shape: { x: end - (mini ? 1.5 : 4.5), y, width: mini ? 3 : 9, height: cell },
          style: { fill: colors.excluded } });
      }
      if (tick && (kind === 'more' || kind === 'less')) {
        children.push({ type: 'rect',
          shape: { x: end > anchor ? end - 2 : end, y, width: 2, height: cell },
          style: { fill: kind === 'more' ? colors.high : colors.basal } });
      }
      /* A night past the ceiling leaves by its own caret: an advisory chart may
         cap a scale, never hide a big night. */
      if (tick && night.delivered_rate > xMax) {
        children.push({ type: 'polygon',
          shape: { points: [[end + 7, y + cell / 2], [end + 1, y + cell / 2 - 3.5],
            [end + 1, y + cell / 2 + 3.5]] },
          style: { fill: colors.high } });
      }
      return { type: 'group', children };
    },
    tooltip: { formatter: (params) => `${params.name} — delivered ${params.data.delivered} U/h`
      + (finite(params.data.programmed)
        ? ` · programmed ${params.data.programmed.toFixed(2)}`
        : ' · no programmed rate on file') },
  });
  /* A staircase read aloud is its crossing and its tally — the standing kind
     description ("N nights of steady data") names the roster this form is not
     drawing. */
  const description = [
    `${total} steady night${total === 1 ? '' : 's'}${slotLabel ? ` at ${slotLabel}` : ''}`,
    /* Said the way the analyzer meant it: each night is measured against the
       rate programmed for that night, so the reading may not name one value as
       though every night shared it. Today's rate is named separately, as the
       rule the figure draws. */
    `the pump ran at or above the rate programmed for that night on ${crossing} of them`,
    `${above} more, ${below} less, ${atRate} exactly as set`
      + (unpaired ? `, ${unpaired} with no programmed rate on file` : ''),
    ...(hasRule ? [`programmed now ${programmed.toFixed(2)} U/h`] : []),
    ...(finite(estimateValue)
      ? [`estimate ${estimateValue.toFixed(2)} U/h`
        + (hasBand ? `, range ${ciLo.toFixed(2)} to ${ciHi.toFixed(2)}` : '')] : []),
    `${data?.excluded_night_count ?? 0} night${(data?.excluded_night_count ?? 0) === 1 ? '' : 's'} excluded`,
  ].join('; ');
  if (mini) {
    /* THE THUMBNAIL IS ONE SENTENCE: a lopsided hill with a line through it and
       most of the mass on the far side. Axis, ticks and every word but the slot
       go; the nights abut into that hill, and the rule and a 3px shadow stay. */
    return {
      ...chartBase(description, true, colors),
      legend: { show: false },
      grid: { left: 4, right: 4, top: 16, bottom: 12 },
      xAxis: { type: 'value', min: xMin, max: xMax, show: false },
      yAxis: { type: 'value', min: 0, max: yMax, show: false, inverse: true },
      graphic: slotLabel ? [{ type: 'text', left: 5, top: 3, silent: true,
        style: { text: slotLabel, fill: colors.muted, font: `500 9px ${FONT}` } }] : [],
      series: [
        nightCells(0, false),
        { type: 'custom', id: 'furniture', animation: false, silent: true, clip: false, data: [0],
          renderItem: (params, api) => {
            const base = params.coordSys.y + params.coordSys.height;
            const children = [];
            if (hasRule) {
              children.push({ type: 'rect',
                shape: { x: api.coord([programmed, 0])[0] - .5, y: params.coordSys.y,
                  width: 1, height: base - params.coordSys.y },
                style: { fill: colors.basal } });
            }
            if (hasBand) {
              children.push({ type: 'rect',
                shape: { x: api.coord([ciLo, 0])[0], y: base + 4,
                  width: api.coord([ciHi, 0])[0] - api.coord([ciLo, 0])[0], height: 3 },
                style: { fill: shadow } });
            }
            return { type: 'group', children };
          } },
      ],
    };
  }
  const verdict = basalVerdict(data);
  const maxRate = total ? rates[total - 1] : null;
  /* ONE FACT, ONE HOME. The reader chose this slot, so nothing here re-sets the
     scene: the headline states the finding and its support, the rail holds the
     tally and the exclusions, the slug holds the estimate and its range, the
     footer holds the window. Two things that were said twice are gone with the
     saying — the standfirst repeated the rail's three counts, and the interval
     caption repeated the slug's range and then its verdict word. What a mark
     already shows is not captioned either: the cliff of nights sitting on the
     rule was labelled "5 nights ran exactly as programmed" beside a rail row
     reading "5 exactly as set", and that label was also the text the collision
     audit caught running off the plot into the rail. */
  /* The denominator is the drawn roster, and the direction is the served sign's
     majority — the same counts the rail prints and the reading speaks. */
  const headline = above > below
    ? `Pump ran above the programmed rate on ${above} of ${total} nights`
    : below > above
      ? `Pump ran below the programmed rate on ${below} of ${total} nights`
      : atRate
        ? `Pump ran at the programmed rate on ${atRate} of ${total} nights`
        : `${total} nights, counted by the rate the pump ran`;
  const caps = `500 10px ${FONT}`;
  /* THE ROWS ARE PLACED IN PIXELS, not anchored to the rail's margin. A graphic
     element's box is its own text's box: anchor it by `right` and a short label
     lands against the far margin however wide `style.width` says the column is,
     which put the gulf back inside the row ("4 … less"). Measured from the
     canvas instead, the numeral column ends at one x, every label begins one
     10px gutter after it, and each pair is centred on one line — a row is one
     unit, so its count sits against the middle of its label rather than the
     label's first line. */
  /* The tally rows are laid out FROM THE LIST, because the list is no longer a
     fixed three: a roster carrying nights the analyzer could not compare owes
     the reader that count rather than filing them under "exactly as set", which
     would credit a rate that was never on file. Where every night has one — the
     ordinary roster — the rows land exactly where they always did. */
  const tallyRows = [
    [above, 'more than programmed'],
    [below, 'less'],
    [atRate, 'exactly as set'],
    ...(unpaired ? [[unpaired, 'no programmed rate']] : []),
  ];
  const railRule = EDITORIAL.figureTop + 26 + tallyRows.length * RAIL.pitch + 6;
  const railRows = [
    ...tallyRows.map(([count, label], index) =>
      [count, label, EDITORIAL.figureTop + 26 + index * RAIL.pitch]),
    /* One statement, one line: the rail's head already says these are the steady
       nights, so "not steady" carries the reason without reciting the criterion
       and without wrapping into what read as a second data point. */
    [data?.excluded_night_count ?? 0, 'excluded — not steady', railRule + 8],
  ];
  /* The verdict block reads as the table's own head: same right margin, same
     width, so the section has one edge rather than four. */
  const railHead = (style, top) => ({ type: 'text', right: EDITORIAL.margin, top,
    silent: true, style: { align: 'right', width: EDITORIAL.rail, ...style } });
  /* AT THE MIDDLE RANK THE DECK AND THE RAIL SPEAK IN ONE VOICE EACH. The
     verdict line carries what the slug carried — the backend's word, the
     estimate, its range — and the tally line carries the rail's four counts,
     exclusions included, because the count arguing against the finding may never
     be the one that gets dropped for room. */
  const compactVerdict = [verdict.toUpperCase(),
    finite(estimateValue) ? `${estimateValue.toFixed(2)} U/h` : 'no estimate',
    ...(hasBand ? [`(${ciLo.toFixed(2)}–${ciHi.toFixed(2)})`] : []),
    /* The rule loses its flag at this size — the deck's own band is where the
       flag flies and the tally line is standing in it — so the rate the whole
       figure is anchored on is named here instead. */
    ...(hasRule ? [`programmed now ${programmed.toFixed(2)}`] : [])].join(' · ');
  const compactTally = `${total} steady night${total === 1 ? '' : 's'}`
    + ` · ${above} more · ${below} less · ${atRate} as set`
    + (unpaired ? ` · ${unpaired} unpaired` : '')
    + ` · ${data?.excluded_night_count ?? 0} excluded`;
  return {
    ...chartBase(description, false, colors),
    legend: { show: false },
    grid: { left: L.margin, right: L.rail + L.margin + (compact ? 26 : 16),
      top: L.figureTop, bottom: L.footerBand, containLabel: false },
    graphic: compact ? [
      { type: 'text', left: L.margin, top: L.deckTop, silent: true,
        style: { text: compactVerdict, fill: colors.text, font: `600 11px ${MONO}` } },
      { type: 'text', left: L.margin, top: L.tallyTop, silent: true,
        style: { text: compactTally, fill: colors.muted, font: `500 10px ${FONT}` } },
    ] : [
      { type: 'text', left: EDITORIAL.margin, top: EDITORIAL.deckTop, silent: true,
        style: { text: editorialWrap(headline, 620, 21), fill: colors.text,
          font: `600 21px ${FONT}`, lineHeight: 24 } },
      /* The verdict slug wears a warm-grey square, never rust: a hold is not an
         alarm, and the word beside it is the backend's own. */
      railHead({ text: `{sq|}{v|${verdict.toUpperCase()}}`,
        rich: { sq: { backgroundColor: ink(45), width: 6, height: 6 },
          v: { color: colors.muted, fontFamily: FONT, fontSize: 10,
            fontWeight: 500, padding: [0, 0, 0, 6] } } }, 16),
      ...(finite(estimateValue)
        ? [railHead({ text: `${estimateValue.toFixed(2)} U/h`, fill: colors.text,
          font: `600 19px ${MONO}` }, 34)]
        : [railHead({ text: 'no estimate', fill: colors.muted, font: `11px ${FONT}` }, 36)]),
      ...(hasBand ? [railHead({ text: `range ${ciLo.toFixed(2)} – ${ciHi.toFixed(2)}`,
        fill: colors.muted, font: `11px ${MONO}` }, 58)] : []),
      /* The roster as type, not as a chart: three directions, then the nights
         that never qualified, disclosed here rather than cluttering the plot. */
      railHead({ text: `${total} STEADY NIGHT${total === 1 ? '' : 'S'}`,
        fill: colors.muted, font: caps }, EDITORIAL.figureTop),
      /* The footer is the window and nothing else: the exclusion rule it used to
         recite is the rail's last row. */
      ...(slotWindow ? [{ type: 'text', left: EDITORIAL.margin, bottom: 10, silent: true,
        style: { text: slotWindow, fill: colors.muted, font: caps } }] : []),
    ],
    /* THE AXIS SAYS WHAT IT MEASURES, UNDER ITS OWN NUMBERS. A unit hung after
       the last tick is read after the scale, not with it: a bare ladder of
       0.0–1.8 under a chart about nights was first read as a count of days.
       The name is set below the labels, where the eye arrives on it while it is
       still reading the scale. */
    /* A NARROW SEAT TAKES HALF THE TICKS. The explorer's cell fused its labels
       into one smear — the ladder was drawn for a 950px plot and handed 200px —
       so the step doubles when the ticks would crowd. */
    xAxis: { type: 'value', min: xMin, max: xMax, interval: tickStep,
      name: 'basal rate, U/h', nameLocation: 'middle',
      ...axis(colors), splitLine: { show: false }, nameGap: 26,
      nameTextStyle: { color: colors.muted, fontFamily: FONT, fontSize: 10, fontWeight: 500 },
      axisTick: { show: true, length: 4, lineStyle: { color: hair } },
      axisLabel: { margin: 6, color: colors.muted, fontFamily: MONO, fontSize: 10,
        formatter: (value) => value.toFixed(tickStep >= .1 ? 1 : 2) } },
    /* The count runs DOWNWARD, because the stack does: the nights at or above
       the programmed rate are the rows the reader counts down through before the
       rule runs out of cells, so the crossing is the 16th night from the top. */
    yAxis: { type: 'value', min: 0, max: yMax, show: false, inverse: true },
    series: [
      nightCells(2, true),
      ...(compact ? [] : [{ type: 'custom', id: 'rail', animation: false, silent: true, clip: false, z: 10, data: [0],
        renderItem: (params, api) => {
          const numeralEnd = api.getWidth() - EDITORIAL.margin - RAIL.label - RAIL.gutter;
          return { type: 'group', children: railRows.flatMap(([count, label, top]) => {
            const middle = top + RAIL.pitch / 2;
            return [
              { type: 'text', style: { text: String(count), x: numeralEnd, y: middle,
                align: 'right', verticalAlign: 'middle',
                fill: colors.text, font: `600 16px ${MONO}` } },
              { type: 'text', style: { text: editorialWrap(label, RAIL.label, 11),
                x: numeralEnd + RAIL.gutter, y: middle, align: 'left', verticalAlign: 'middle',
                lineHeight: RAIL.lead, fill: colors.muted, font: `11px ${FONT}` } },
            ];
          }) };
        } }]),
      { type: 'custom', id: 'furniture', animation: false, silent: true, clip: false, z: 10, data: [0],
        renderItem: (params, api) => {
          const cs = params.coordSys;
          const width = api.getWidth();
          const height = api.getHeight();
          const base = cs.y + cs.height;
          const railLeft = width - EDITORIAL.margin - EDITORIAL.rail;
          const box = (x, y, w, h, fill) => ({ type: 'rect',
            shape: { x, y, width: w, height: h }, style: { fill } });
          const text = (content, x, y, font, fill, extra = {}) => ({ type: 'text',
            style: { text: content, x, y, font, fill, ...extra } });
          /* The tile's own nameplate already rules the top of the page, so the
             only hairlines drawn here are the ones nothing else carries — and at
             the middle rank there is no rail to rule and no footer under it. */
          const children = compact ? [] : [
            box(EDITORIAL.margin, height - 28, width - EDITORIAL.margin * 2, 1, hair),
            box(railLeft, EDITORIAL.figureTop + 18, EDITORIAL.rail, 1, hair),
            box(railLeft, railRule, EDITORIAL.rail, 1, hair),
          ];
          /* A 12px text sets to about .52 of its size per character. Nothing on
             this canvas reflows, so a label that would overrun the plot is
             mirrored to the other side of its mark rather than clipped — the
             collision the audit caught was this label, at a slot whose rule
             sits far enough right that its caption ran into the rail. */
          const roomRight = (x, content, size = 12) =>
            x + content.length * size * .52 < cs.x + cs.width - 4;
          /* The rank ruler: how far down the stack a row is. It is named in the
             margin rather than on the plot, because the cells no longer start at
             the plot's left edge and a number set inside would sit on one. The
             last rank needs no line of its own — the axis is already there. */
          const midRank = compact ? 0 : Math.round(total / 2);
          if (midRank > 0 && midRank < total) {
            const y = api.coord([xMin, midRank])[1];
            children.push({ type: 'line', shape: { x1: cs.x, y1: y, x2: cs.x + cs.width, y2: y },
              style: { stroke: ink(18), lineWidth: 1, lineDash: [1, 3] } });
            children.push(text(String(midRank), cs.x - 6, y, `500 10px ${FONT}`, colors.muted,
              { align: 'right', verticalAlign: 'middle' }));
          }
          /* The ruler goes at the middle rank: its numbers live in the canvas
             margin, and that margin is half as wide there — a "20" set in it
             would hang off the tile. The tally line above says how many nights
             the stack holds. */
          if (total > 0 && !compact) {
            children.push(text(String(total), cs.x - 6, base, `500 10px ${FONT}`, colors.muted,
              { align: 'right', verticalAlign: 'bottom' }));
          }
          /* Uncertainty lives on the ground, under the data — a shadow on the
             floor, not a box drawn around it. It sits BELOW the tick labels: run
             through them it reads as a smudge on the axis rather than a mark. */
          if (hasBand) {
            const xLo = api.coord([ciLo, 0])[0];
            const xHi = api.coord([ciHi, 0])[0];
            children.push(box(xLo, base + 38, xHi - xLo, 6, shadow),
              box(xLo, base + 35, 1, 12, shadow), box(xHi - 1, base + 35, 1, 12, shadow));
            if (finite(estimateValue)) {
              children.push(box(api.coord([estimateValue, 0])[0] - 1, base + 34, 2, 14, colors.basal));
            }
          }
          /* Each clipped night carries its own caret, drawn with its cell. What
             no mark can say is the rate itself, so that is set once, under the
             axis end the carets point past. */
          if (overflow > 0 && finite(maxRate)) {
            children.push(text(`tallest ${maxRate.toFixed(1)} U/h`,
              cs.x + cs.width, base + 22, `500 11px ${FONT}`, colors.high, { align: 'right' }));
          }
          if (hasRule) {
            const ruleX = api.coord([programmed, 0])[0];
            const yCross = api.coord([programmed, crossing])[1];
            const head = compact ? cs.y : cs.y - 14;
            children.push(box(ruleX - .75, head, 1.5, base + 24 - head, colors.basal));
            /* The flag flies ABOVE the plot, on the head of the rule. Inside it
               used to sit in the top row's band, which was empty while the cells
               grew from the left edge and is the widest cell on the tile now
               that they grow from the rule. The deck gave up the room when the
               standfirst went — and at the middle rank the deck IS the two
               compressed lines, so the flag has nowhere to fly and the rate it
               would name is set in the verdict line instead. */
            if (!compact) {
              /* NOW, because the nights carry their own. The rule is today's
                 schedule; a night's cell answers to the rate in force when it
                 ran, and on a roster spanning a profile change the two are not
                 the same number. */
              const flag = `PROGRAMMED NOW ${programmed.toFixed(2)}`;
              const flagLeft = roomRight(ruleX + 7, flag, 10);
              children.push(box(ruleX + (flagLeft ? 1 : -4), cs.y - 15, 3, 3, colors.basal),
                text(flag, ruleX + (flagLeft ? 7 : -9), cs.y - 6, caps, colors.muted,
                  { align: flagLeft ? 'left' : 'right', verticalAlign: 'bottom' }));
            }
            /* The cliff is no longer drawn as one mark spanning its nights: each
               night that ran exactly as programmed stands on the rule as its own
               tick, and the run of them IS the cliff. */
            /* THE ONE NUMBER THE MARKS CANNOT SAY, and it needs no glyph to say
               it. A ring drawn where the rule met the staircase marked a real
               junction while the cells grew from the left edge; anchored on the
               rule they already meet it at every row, so the ring marked nothing
               and read as a stray red circle in the middle of the stack. The
               label anchors to the rule at the crossing height instead — the
               boundary where the rust and the as-set ticks give out.
               The delta arrangement leaves exactly two quadrants empty, and the
               label takes whichever one it fits: BELOW the crossing on the right,
               where every row runs the other way, or ABOVE it on the left, where
               every row runs right. Where the rule sits too near an edge for
               either — every night at or above, on a rule close to the left —
               it drops under the plot, beside the axis, still the only sentence
               on the figure. */
            const atOrAbove = `${crossing} of ${total} night${total === 1 ? '' : 's'} at or above`;
            const span = atOrAbove.length * 12 * .52;
            /* The two empty quadrants exist only while every night is anchored on
               the rule. Once the profile has moved, cells stand off it on both
               sides and there is no quadrant to promise — so the label takes the
               one seat no cell can reach, under the axis. */
            const seat = anchors.some((rate) => rate !== programmed) ? 'axis'
              : roomRight(ruleX + 10, atOrAbove) && yCross + 26 <= base ? 'below'
                : ruleX - 10 - span >= cs.x && yCross - 23 >= cs.y + 20 ? 'above' : 'axis';
            children.push(text(atOrAbove,
              seat === 'below' ? ruleX + 10 : seat === 'above' ? ruleX - 10 : cs.x,
              seat === 'below' ? yCross + 8 : seat === 'above' ? yCross - 8 : base + 22,
              `500 12px ${FONT}`, colors.text,
              { align: seat === 'above' ? 'right' : 'left',
                verticalAlign: seat === 'above' ? 'bottom' : 'top' }));
          }
          return { type: 'group', children };
        } },
    ],
  };
}

/* `surface` is the host the workstation is about to mount this chart into,
   already handed to every tile so the comparison kind can re-resolve its ink on
   a theme change. The editorial mode reads its BOX: mounts run after the tile is
   in the DOM (ADR 215 amendment), so the measurement is the seat's real width. */
function basalOption(_mode, { data, mini = false, surface = null } = {}) {
  const colors = chartColors();
  return basalEditorialOption(data, mini, colors, surface);
}

function isfOption(mode, { data, mini = false } = {}) {
  const colors = chartColors();
  const counts = data?.counts || {};
  const windows = data?.windows || [];
  const steps = data?.steps || [];
  const description = `${counts.detected_windows ?? 0} detected rest windows; ${counts.qualifying_windows ?? 0} qualifying windows; ${counts.qualifying_steps ?? 0} qualifying steps.`;
  if (mode === 'clock') {
    const windowIndex = new Map(windows.map((window, index) => [window.id, index]));
    return {
      ...chartBase(description, mini, colors),
      legend: chartLegend(['Qualifying fasting steps'], colors, mini),
      xAxis: { type: 'category', data: windows.map((window) => window.date),
        ...axis(colors, mini),
        splitLine: { show: false } },
      yAxis: { type: 'value', name: 'glucose change (mg/dL)', ...axis(colors, mini) },
      series: [{ name: 'Qualifying fasting steps', type: 'scatter',
        symbolSize: mini ? 2.5 : 5,
        data: steps.map((step) => [windowIndex.get(step.window_id), step.dbg]),
        itemStyle: { color: colors.signal, opacity: .58 } }],
    };
  }
  return {
    ...chartBase(description, mini, colors),
    legend: chartLegend(['Qualifying fasting steps'], colors, mini),
    xAxis: { type: 'value', min: 0, name: 'insulin acted (U)', ...axis(colors, mini),
      splitLine: { show: false } },
    yAxis: { type: 'value', name: 'glucose change (mg/dL)', ...axis(colors, mini) },
    series: [{ name: 'Qualifying fasting steps', type: 'scatter',
      symbolSize: mini ? 2.5 : 5,
      data: steps.map((step) => [step.insulin_acted, step.dbg]),
      itemStyle: { color: colors.signal, opacity: .58 } }],
  };
}

function carbRatioOption(mode, { data, range, mini = false, window } = {}) {
  const colors = chartColors();
  const block = data?.block || {};
  const runs = data?.runs || [];
  const description = `${block.examined_runs ?? 0} examined meal runs; ${block.support ?? 0} support; ${block.excluded_runs ?? 0} excluded. Support uses solid traces and filled diamonds; directional-only evidence uses dashed traces and open diamonds.`;
  if (mode === 'clock') {
    const frame = clockFrame(window || [block.start_min ?? 0, block.end_min ?? 1440]);
    const points = (inPool) => runs.filter((run) => run.in_pool === inPool && finite(run.true_ic))
      .map((run) => [frame.map(minuteOfDay(run.t)), run.true_ic]);
    return {
      ...chartBase(description, mini, colors),
      legend: chartLegend([
        { name: 'Support run', icon: 'circle' },
        { name: 'Directional-only run', icon: 'emptyCircle' },
      ], colors, mini),
      xAxis: { type: 'value', min: 0, max: frame.span, name: 'meal start',
        ...axis(colors, mini),
        axisLabel: { ...axis(colors, mini).axisLabel, formatter: frame.label },
        splitLine: { show: false } },
      yAxis: { type: 'value', min: 0, name: 'Carb ratio (g/U)', ...axis(colors, mini) },
      series: [
        { name: 'Directional-only run', type: 'scatter', symbol: 'emptyCircle',
          symbolSize: mini ? 3 : 6, data: points(false),
          itemStyle: { color: colors.excluded, opacity: .72 } },
        { name: 'Support run', type: 'scatter', symbol: 'circle',
          symbolSize: mini ? 4 : 8, data: points(true),
          itemStyle: { color: colors.signal, opacity: .88 } },
      ],
    };
  }
  if (!Array.isArray(range) || range.length !== 2
      || !range.every(finite) || range[0] >= range[1]) {
    throw new TypeError('carb-ratio evidence needs one injected field glucose range');
  }
  const runById = new Map(runs.map((run) => [run.run_id, run]));
  const pointsByRun = new Map((data?.series || []).map((series) => [series.run_id, series.points]));
  const members = mealMemberMarkers(runs.map((run) => ({
    ...run, points: pointsByRun.get(run.run_id) || [],
  })), range[0] + 4).map((marker) => ({
    ...marker,
    inPool: Boolean(runById.get(marker.runId)?.in_pool),
    itemStyle: { color: runById.get(marker.runId)?.in_pool ? colors.signal : colors.excluded },
  }));
  return {
    ...chartBase(description, mini, colors),
    legend: chartLegend([
      { name: 'Support run', icon: 'diamond' },
      { name: 'Directional-only run', icon: 'emptyDiamond' },
    ], colors, mini),
    xAxis: { type: 'value', name: 'minutes from first meal', ...axis(colors, mini),
      splitLine: { show: false } },
    yAxis: { type: 'value', min: range[0], max: range[1], name: 'mg/dL',
      ...axis(colors, mini) },
    series: [
      { name: 'Target range', type: 'line', data: [], silent: true,
        markLine: { symbol: 'none', silent: true,
          lineStyle: { type: 'dashed', color: colors.muted, opacity: .6 },
          label: { show: !mini, position: 'insideEndTop', color: colors.muted,
            fontSize: 10, formatter: '{c}' }, data: [{ yAxis: 70 }, { yAxis: 180 }] } },
      ...(data?.series || []).map((series) => ({
        name: runById.get(series.run_id)?.in_pool ? 'Support run' : 'Directional-only run',
        type: 'line', symbol: 'none', connectNulls: true, animation: false,
        data: series.points.map((point) => [point.minute, point.bg]),
        lineStyle: {
          color: runById.get(series.run_id)?.in_pool ? colors.signal : colors.excluded,
          width: mini ? .8 : 1.2,
          opacity: runById.get(series.run_id)?.in_pool ? .34 : .20,
          type: runById.get(series.run_id)?.in_pool ? 'solid' : 'dashed' },
      })),
      { name: 'Support run', type: 'scatter', symbol: 'diamond',
        symbolSize: mini ? 3 : 7, data: members.filter(({ inPool }) => inPool),
        animation: false, emphasis: { disabled: true }, z: 8 },
      { name: 'Directional-only run', type: 'scatter', symbol: 'emptyDiamond',
        symbolSize: mini ? 3 : 7, data: members.filter(({ inPool }) => !inPool),
        animation: false, emphasis: { disabled: true }, z: 8 },
    ],
  };
}

export function carbRatioGlucoseValues(data) {
  return (data?.series || []).flatMap((series) => series.points || [])
    .map((point) => point.bg).filter(finite);
}

/* A PARAMETER TILE CARRIES ITS OWN ROW'S EXTENT, in the queue's words. Basal
   slots and carb-ratio blocks are published several to a window, so a standing
   kind name printed look-alike tiles the reader could not tell apart — the same
   defect the behavioural kind was fixed for. The extent is the row's OWN
   published `span.label`, the very string the queue's row title is built on
   (`_span_label` in `ciq_autotune/findings_projection.py`), never a clock span
   formatted a second time here. The evidence phrase stays the kind's. A row
   arriving off the wire without one keeps the standing name rather than
   printing a hole. */
const spanNamed = (parameter, evidence) => (row) => ({
  title: row.span?.label
    ? `${parameter} ${row.span.label} · ${evidence}`
    : `${parameter} · ${evidence}`,
  meta: null,
});

const entries = [
  {
    kind: 'basal',
    name: 'Basal · delivered vs programmed',
    /* Identity only: the descriptor lives in `meta`, so the findings breadcrumb
       (which renders the title beside a kind label saying the same thing) stays
       "Basal 05:30" instead of repeating and truncating the phrase. */
    nameFor: (row) => ({
      title: row.span?.label ? `Basal ${row.span.label}` : 'Basal',
      meta: null,
    }),
    modes: null,
    meta: () => 'nights at or above each rate · one step per night',
    option: basalOption,
    thumbnail: (data, title) => thumbnail((title || 'Basal · delivered vs programmed').toUpperCase(),
      `${data?.roster_count ?? 0} / ${data?.directional_support_count ?? 0}`,
      [{ type: 'line', symbol: 'none', data: (data?.nights || []).map((night) => night.delivered_rate),
        lineStyle: { color: chartColors().basal, width: 1 } }]),
    coordinateSchema: ['slot'],
    matches: (row) => row.parameter === 'basal_rate',
    coordinates: (row) => ({
      slot: row.slot ?? Math.floor((row.span?.start_min ?? 0) / 30),
    }),
    glucoseValues: null,
  },
  {
    kind: 'isf',
    name: 'Correction factor · rest windows',
    modes: ['event', 'clock'],
    meta: (mode) => mode === 'event'
      ? 'dose acted → glucose change' : 'qualifying steps by rest window',
    option: isfOption,
    thumbnail: (data) => thumbnail('CORRECTION FACTOR · REST',
      `${data?.counts?.detected_windows ?? 0} / ${data?.counts?.qualifying_windows ?? 0} / ${data?.counts?.qualifying_steps ?? 0}`,
      [{ type: 'scatter', symbolSize: 2,
        data: (data?.steps || []).slice(0, 24).map((step) => [step.insulin_acted, step.dbg]),
        itemStyle: { color: chartColors().signal } }]),
    coordinateSchema: [],
    matches: (row) => !row.event_chart && row.parameter === 'isf',
    coordinates: () => ({}),
    glucoseValues: null,
  },
  {
    kind: 'carb-ratio',
    name: 'Carb ratio · meal runs',
    nameFor: spanNamed('Carb ratio', 'meal runs'),
    modes: ['event', 'clock'],
    meta: (mode) => mode === 'event'
      ? 'CGM from first meal' : 'Carb ratio by meal start',
    option: carbRatioOption,
    thumbnail: (data, title) => thumbnail((title || 'Carb ratio · meal runs').toUpperCase(),
      `${data?.block?.examined_runs ?? 0} / ${data?.block?.support ?? 0}`,
      [{ type: 'line', symbol: 'none', connectNulls: true,
        data: data?.series?.[0]?.points?.map((point) => point.bg) || [],
        lineStyle: { color: chartColors().signal, width: 1 } }]),
    coordinateSchema: ['block_id', 'analysis_generation'],
    matches: (row) => !row.event_chart && row.parameter === 'carb_ratio',
    coordinates: (row, findings) => ({
      block_id: row.block_id ?? row.span?.start_min,
      analysis_generation: findings.analysis_generation,
    }),
    glucoseValues: carbRatioGlucoseValues,
  },
  {
    kind: 'event-comparison',
    /* ONE TILE PER BEHAVIOURAL ROW, AND EACH ONE SAYS WHOSE IT IS. This kind is
       the only one a window can publish several of at once, so a single static
       name printed three identical-looking tiles and the reader could not tell
       which finding any of them answered. The name is the row's own published
       title and the caption its own published exposure noun; `nameFor` is what
       keeps the tile field free of a second copy of either. */
    name: 'Response comparison',
    modes: null,
    meta: () => 'responses aligned to each event',
    nameFor: (row) => ({
      title: row.title || 'Response comparison',
      meta: `${row.appearances?.[0]?.noun || 'responses'} aligned to each event`,
    }),
    option: (_mode, { data, range, caseFile = data, surface = null, mini = false } = {}) =>
      eventComparisonChartOption(caseFile, range, surface, mini),
    thumbnail: (data, title) => thumbnail((title || 'Response comparison').toUpperCase(),
      data?.summary?.denominator ?? 0,
      [{ type: 'line', symbol: 'none', connectNulls: true,
        data: data?.projection?.cohorts?.[0]?.points?.map((point) => point.median) || [],
        lineStyle: { color: chartColors().signal, width: 1 } }]),
    /* The retired standalone comparison endpoint's window is gone with it
       (#181): this tile asks the finding-case-file path for the same
       event-aligned projection the inspector reads. Its factor and view come
       back from the row's own `event_chart`, so two behavioural tiles in one
       window can never share a request. */
    coordinateSchema: ['projection_id', 'finding_id', 'alignment', 'factor', 'view'],
    matches: (row) => Boolean(row.event_chart),
    /* The case-file coordinates are opaque transport values: the served
       projection, the row's own id, and the alignment this tile draws. */
    coordinates: (row, findings) => ({
      projection_id: findings.projection_id,
      finding_id: row.id,
      alignment: 'event',
      factor: row.event_chart.lever,
      view: row.appearances?.[0]?.family ?? null,
    }),
    glucoseValues: eventComparisonGlucoseValues,
  },
];

export const DIAGNOSE_EVIDENCE_CHARTS = Object.freeze(entries.map((entry) => Object.freeze({
  ...entry,
  modes: entry.modes && Object.freeze([...entry.modes]),
  coordinateSchema: Object.freeze([...entry.coordinateSchema]),
})));
