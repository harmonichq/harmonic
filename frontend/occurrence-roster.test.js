import test from 'node:test';
import assert from 'node:assert/strict';

import { renderOccurrenceRoster } from './occurrence-roster.js';

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.html = [];
  }

  insertAdjacentHTML(_position, html) { this.html.push(html); }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name); }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  click() { this.listeners.get('click')?.(); }
}

function withDocument(run) {
  const previous = globalThis.document;
  globalThis.document = { createElement: (tagName) => new FakeElement(tagName) };
  try { return run(); } finally { globalThis.document = previous; }
}

test('the roster exposes one selected occurrence and selects by opaque id', () => {
  withDocument(() => {
    const host = new FakeElement();
    const selected = [];
    renderOccurrenceRoster(host, [{
      header: '<div class="ev-group">Matched</div>',
      servedCount: 2,
      rows: [
        { id: 'occ-1', html: 'First' },
        { id: 'occ-2', html: 'Second' },
      ],
    }], {
      selectedId: 'occ-2',
      shownCount: 5,
      onSelect: (id) => selected.push(id),
      onMore() {},
    });

    assert.equal(host.children.length, 2);
    assert.equal(host.children[0].getAttribute('aria-pressed'), 'false');
    assert.equal(host.children[1].getAttribute('aria-pressed'), 'true');
    host.children[0].click();
    assert.deepEqual(selected, ['occ-1']);
  });
});

test('show-more uses served counts and one expansion state across groups', () => {
  withDocument(() => {
    const collapsed = new FakeElement();
    const more = [];
    const groups = [
      {
        header: '<div class="ev-group">Matched</div>',
        servedCount: 7,
        rows: [{ id: 'opaque-1', html: 'Only rendered row' }],
      },
      {
        header: '<div class="ev-group">Comparison</div>',
        servedCount: 6,
        rows: Array.from({ length: 6 }, (_, index) => ({
          id: `comparison-${index}`, html: `Comparison ${index}`,
        })),
      },
    ];
    renderOccurrenceRoster(collapsed, groups, {
      selectedId: null,
      shownCount: 5,
      onSelect() {},
      onMore: () => more.push('toggle'),
    });

    const collapsedControls = collapsed.children.filter((child) => child.className === 'more');
    assert.deepEqual(collapsedControls.map((button) => button.textContent), ['2 more', '1 more']);
    assert.equal(collapsed.children.filter((child) => child.className === 'ev-row case-occurrence').length, 6);
    collapsedControls[0].click();
    assert.deepEqual(more, ['toggle']);

    const expanded = new FakeElement();
    renderOccurrenceRoster(expanded, groups, {
      selectedId: null,
      shownCount: Infinity,
      onSelect() {},
      onMore() {},
    });
    const expandedControls = expanded.children.filter((child) => child.className === 'more');
    assert.deepEqual(expandedControls.map((button) => button.textContent), [
      'Show first 5', 'Show first 5',
    ]);
  });
});

test('each caller keeps its shipped empty-state order', () => {
  withDocument(() => {
    const host = new FakeElement();
    renderOccurrenceRoster(host, [
      {
        header: '<div class="ev-group">Verdict</div>',
        servedCount: 0,
        rows: [],
        empty: '<div class="empty">No occurrences in this verdict.</div>',
        emptyBeforeHeader: true,
      },
      {
        header: '<div class="ev-group">Comparison</div>',
        servedCount: 0,
        rows: [],
        empty: '<div class="empty">No occurrences in this population.</div>',
      },
    ], {
      selectedId: null,
      shownCount: 5,
      onSelect() {},
      onMore() {},
    });

    assert.deepEqual(host.html, [
      '<div class="empty">No occurrences in this verdict.</div>',
      '<div class="ev-group">Comparison</div>',
      '<div class="empty">No occurrences in this population.</div>',
    ]);
  });
});
