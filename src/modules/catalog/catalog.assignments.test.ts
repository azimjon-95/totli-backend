import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAssignmentManager,
  createMemoryAssignmentStore,
  planReconcile,
  type AssignmentRecord,
  type AssignmentStore,
} from './catalog.assignments.js';

const silent = { info() {}, warn() {}, error() {} };
const rec = (productId: string, missCount = 0, categorySlug = 'toy'): AssignmentRecord => ({
  productId,
  categorySlug,
  missCount,
});
const ids = (...v: string[]) => new Set(v);

describe('planReconcile', () => {
  it('leaves a dish that is still present alone', () => {
    assert.deepEqual(planReconcile([rec('a')], ids('a'), 3), {
      toReset: [],
      toIncrement: [],
      toDelete: [],
    });
  });

  it('resets the counter of a dish that came back', () => {
    assert.deepEqual(planReconcile([rec('a', 2)], ids('a'), 3).toReset, ['a']);
  });

  it('counts a miss while below the limit', () => {
    assert.deepEqual(planReconcile([rec('a', 0)], ids(), 3).toIncrement, ['a']);
    assert.deepEqual(planReconcile([rec('a', 1)], ids(), 3).toIncrement, ['a']);
  });

  it('deletes on the check that reaches the limit — the third miss, not the fourth', () => {
    assert.deepEqual(planReconcile([rec('a', 2)], ids(), 3).toDelete, ['a']);
  });

  it('honours a different limit', () => {
    assert.deepEqual(planReconcile([rec('a', 0)], ids(), 1).toDelete, ['a']);
    assert.deepEqual(planReconcile([rec('a', 3)], ids(), 5).toIncrement, ['a']);
  });

  it('sorts each choice into the right bucket in one pass', () => {
    const plan = planReconcile(
      [rec('present'), rec('back', 2), rec('first-miss', 0), rec('last-miss', 2)],
      ids('present', 'back'),
      3
    );
    assert.deepEqual(plan, {
      toReset: ['back'],
      toIncrement: ['first-miss'],
      toDelete: ['last-miss'],
    });
  });
});

/** The manager over a memory store, with a way to make the store misbehave. */
function setup(initial: AssignmentRecord[] = [], missLimit = 3) {
  const memory = createMemoryAssignmentStore(initial);
  const faults = { list: false, applyReconcile: false };

  const store: AssignmentStore = {
    list: async () => {
      if (faults.list) throw new Error('db down');
      return memory.list();
    },
    upsert: (r) => memory.upsert(r),
    remove: (id) => memory.remove(id),
    applyReconcile: async (plan) => {
      if (faults.applyReconcile) throw new Error('write failed');
      return memory.applyReconcile(plan);
    },
  };

  return { manager: createAssignmentManager({ store, missLimit, log: silent }), memory, faults };
}

describe('assignment manager — the 3-check rule', () => {
  it('removes a choice after three consecutive checks without its dish', async () => {
    const { manager, memory } = setup([rec('gone', 0, 'toy'), rec('kept', 0, 'bento')]);
    const present = ids('kept');

    await manager.onFreshSnapshot(present);
    assert.equal(manager.current().map.get('gone'), 'toy', 'after check 1');
    await manager.onFreshSnapshot(present);
    assert.equal(manager.current().map.get('gone'), 'toy', 'after check 2');
    await manager.onFreshSnapshot(present);
    assert.equal(manager.current().map.has('gone'), false, 'after check 3');

    assert.equal(manager.current().map.get('kept'), 'bento');
    assert.deepEqual(
      memory.snapshot().map((r) => r.productId),
      ['kept'],
      'and from the database'
    );
  });

  it('forgives a dish that comes back before the limit', async () => {
    const { manager, memory } = setup([rec('flaky')]);

    await manager.onFreshSnapshot(ids('other'));
    await manager.onFreshSnapshot(ids('other'));
    assert.equal(memory.snapshot()[0].missCount, 2);

    await manager.onFreshSnapshot(ids('flaky')); // back
    assert.equal(memory.snapshot()[0].missCount, 0);

    await manager.onFreshSnapshot(ids('other'));
    await manager.onFreshSnapshot(ids('other'));
    assert.equal(manager.current().map.has('flaky'), true, 'the count started over');
  });

  it('does not count an empty fetch as a miss', async () => {
    const { manager, memory } = setup([rec('a', 2)]);
    await manager.onFreshSnapshot(ids());
    assert.equal(memory.snapshot()[0].missCount, 2, 'untouched');
    assert.equal(manager.current().map.get('a'), 'toy', 'and still in effect');
  });

  it('keeps the previous choices when the database cannot be read', async () => {
    const { manager, faults } = setup([rec('a')]);
    await manager.onFreshSnapshot(ids('a'));

    faults.list = true;
    await manager.onFreshSnapshot(ids('a')); // must not throw

    assert.equal(manager.current().map.get('a'), 'toy');
  });

  it('keeps choices in effect when the counters cannot be written', async () => {
    const { manager, faults, memory } = setup([rec('a', 2)]);
    faults.applyReconcile = true;

    await manager.onFreshSnapshot(ids('other')); // would delete 'a'

    assert.equal(manager.current().map.get('a'), 'toy', 'not dropped on a failed write');
    assert.equal(memory.snapshot().length, 1);
  });

  it('never rejects', async () => {
    const { manager, faults } = setup([rec('a')]);
    faults.list = true;
    await assert.doesNotReject(manager.onFreshSnapshot(ids('a')));
  });
});

describe('assignment manager — admin edits', () => {
  it('assign() takes effect at once and is stored', async () => {
    const { manager, memory } = setup();
    const before = manager.current().version;

    await manager.assign({ productId: 'p', categorySlug: 'bento', productName: 'Torti', assignedBy: 'adm1' });

    assert.equal(manager.current().map.get('p'), 'bento');
    assert.ok(manager.current().version > before, 'the version moves so cached views rebuild');
    assert.deepEqual(memory.snapshot()[0], {
      productId: 'p',
      categorySlug: 'bento',
      productName: 'Torti',
      assignedBy: 'adm1',
      missCount: 0,
    });
  });

  it('assign() replaces an earlier choice and resets its miss counter', async () => {
    const { manager, memory } = setup([rec('p', 2, 'toy')]);
    await manager.assign({ productId: 'p', categorySlug: 'set' });
    assert.equal(manager.current().map.get('p'), 'set');
    assert.equal(memory.snapshot()[0].missCount, 0);
    assert.equal(memory.snapshot().length, 1);
  });

  it('clear() removes the choice and reports whether there was one', async () => {
    const { manager } = setup([rec('p')]);
    await manager.onFreshSnapshot(ids('p'));

    assert.equal(await manager.clear('p'), true);
    assert.equal(manager.current().map.has('p'), false);
    assert.equal(await manager.clear('p'), false);
  });

  it('runs edits and checks one at a time, so they cannot overwrite each other', async () => {
    const { manager } = setup([rec('old', 2, 'toy')]);

    // A check that would delete 'old' and an edit that adds 'new', started together.
    await Promise.all([
      manager.onFreshSnapshot(ids('new')),
      manager.assign({ productId: 'new', categorySlug: 'bento' }),
    ]);

    assert.equal(manager.current().map.has('old'), false);
    assert.equal(manager.current().map.get('new'), 'bento', 'the edit survived the check');
  });
});

describe('memory store', () => {
  it('upsert resets the miss counter', async () => {
    const store = createMemoryAssignmentStore([rec('a', 2)]);
    await store.upsert({ productId: 'a', categorySlug: 'set' });
    assert.equal((await store.list())[0].missCount, 0);
  });

  it('applyReconcile applies all three buckets', async () => {
    const store = createMemoryAssignmentStore([rec('r', 2), rec('i', 0), rec('d', 2)]);
    await store.applyReconcile({ toReset: ['r'], toIncrement: ['i'], toDelete: ['d'] });
    const rows = Object.fromEntries((await store.list()).map((r) => [r.productId, r.missCount]));
    assert.deepEqual(rows, { r: 0, i: 1 });
  });
});
