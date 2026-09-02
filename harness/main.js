const controls = document.getElementById('controls');
const stage = document.getElementById('stage');
const status = document.getElementById('status');

async function installShippedStyles() {
  const response = await fetch('/__harness/app-index.html');
  if (!response.ok) throw new Error('The shipped app index could not be read.');
  const html = (await response.text()).replace(/<!--[\s\S]*?-->/g, '');
  const blocks = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((match) => match[1]);
  if (blocks.length !== 2) throw new Error(`Expected two shipped style blocks; found ${blocks.length}.`);
  for (const css of blocks) {
    const style = document.createElement('style');
    style.dataset.harnessShipped = '';
    style.textContent = css;
    document.head.append(style);
  }
  const paths = ['theme.css', 'shell.css', 'diagnose-workstation.css', 'diagnose-event-comparison.css'];
  await Promise.all(paths.map((path) => new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `/assets/${path}`;
    link.onload = resolve;
    link.onerror = () => reject(new Error(`The shipped stylesheet ${path} could not be read.`));
    document.head.append(link);
  })));
}

function stateFromUrl(stories) {
  const query = new URLSearchParams(location.search);
  const story = stories.some(({ id }) => id === query.get('story')) ? query.get('story') : stories[0].id;
  return {
    story,
    mode: query.get('mode'),
    size: query.get('size') === 'mini' ? 'mini' : 'full',
    range: query.get('range') === 'fitted' ? 'fitted' : 'shared',
    source: query.get('source') === 'live' ? 'live' : 'manufactured',
    chart: query.get('chart') || '',
    slot: query.get('slot') || '',
  };
}

function writeUrl(state) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) {
    if (value) query.set(key, value);
  }
  history.replaceState({}, '', `${location.pathname}?${query}`);
}

function setOptions(select, values, selected) {
  select.replaceChildren(...values.map(({ value, label }) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = value === selected;
    return option;
  }));
}

function renderControls(stories, state) {
  const story = stories.find(({ id }) => id === state.story);
  setOptions(controls.elements.story, stories.map(({ id, label }) => ({ value: id, label })), state.story);
  const modes = story.modes || [];
  const mode = modes.includes(state.mode) ? state.mode : modes[0] || '';
  state.mode = mode;
  setOptions(controls.elements.mode, modes.map((value) => ({ value, label: value })), mode);
  controls.querySelector('[data-control="mode"]').hidden = modes.length < 2;
  controls.querySelector('[data-control="size"]').hidden = !story.sizes;
  controls.querySelector('[data-control="range"]').hidden = !story.range;
  controls.querySelector('[data-control="chart"]').hidden = story.id !== 'workstation';
  controls.elements.size.value = state.size;
  controls.elements.range.value = state.range;
  controls.elements.source.value = state.source;
  controls.elements.chart.value = state.chart;
  return story;
}

async function setSource(source) {
  const response = await fetch('/__harness/source', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
  });
  if (!response.ok) throw new Error('The harness data source could not be selected.');
}

function showError(error, source) {
  stage.replaceChildren();
  const message = document.createElement('p');
  message.className = 'harness-message';
  message.textContent = source === 'live'
    ? 'Live data is unavailable. Start uv run harmonic serve yourself, then retry.'
    : error.message;
  stage.append(message);
  status.textContent = 'Could not draw story';
}

await installShippedStyles();
const echarts = await import('echarts');
window.echarts = echarts;
const { STORIES, renderStory } = await import('./stories.js');
let state = stateFromUrl(STORIES);

async function render() {
  const story = renderControls(STORIES, state);
  writeUrl(state);
  status.textContent = 'Drawing…';
  await setSource(state.source);
  try {
    const result = await renderStory(stage, story, state);
    status.textContent = result || `${story.label} · ${state.source}`;
  } catch (error) {
    showError(error, state.source);
  }
}

controls.addEventListener('change', () => {
  state = {
    story: controls.elements.story.value,
    mode: controls.elements.mode.value,
    size: controls.elements.size.value,
    range: controls.elements.range.value,
    source: controls.elements.source.value,
    chart: controls.elements.chart.value.trim(),
    slot: state.slot,
  };
  void render();
});
controls.addEventListener('submit', (event) => event.preventDefault());

await render();
