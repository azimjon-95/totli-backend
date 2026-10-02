/**
 * Admin category choices: "dish X lives in category Y".
 *
 * Dish ids come from LokmaGo, so a choice can outlive its dish. The rule that
 * keeps the table honest: every successful LokmaGo fetch is one *check*; a dish
 * that is missing from `missLimit` checks in a row (default 3) loses its
 * choice. A failed fetch is not a check — an outage must never wipe choices —
 * and neither is a fetch that returns no dishes at all, which is far more
 * likely to be a glitch than an empty menu.
 */

export interface AssignmentRecord {
  productId: string;
  categorySlug: string;
  /** Last name seen, so a stale row is recognisable in the database. */
  productName?: string;
  assignedBy?: string;
  /** Consecutive checks in which LokmaGo did not return this dish. */
  missCount: number;
}

export interface ReconcilePlan {
  /** Back to 0: the dish is present again. */
  toReset: string[];
  /** One more miss, still below the limit. */
  toIncrement: string[];
  /** Reached the limit: remove the choice. */
  toDelete: string[];
}

export interface AssignmentStore {
  list(): Promise<AssignmentRecord[]>;
  upsert(record: Omit<AssignmentRecord, 'missCount'>): Promise<void>;
  remove(productId: string): Promise<boolean>;
  applyReconcile(plan: ReconcilePlan): Promise<void>;
}

export interface AssignmentLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/** Pure: what one more check does to each stored choice. */
export function planReconcile(
  records: readonly AssignmentRecord[],
  presentIds: ReadonlySet<string>,
  missLimit: number
): ReconcilePlan {
  const plan: ReconcilePlan = { toReset: [], toIncrement: [], toDelete: [] };

  for (const record of records) {
    if (presentIds.has(record.productId)) {
      if (record.missCount > 0) plan.toReset.push(record.productId);
    } else if (record.missCount + 1 >= missLimit) {
      plan.toDelete.push(record.productId);
    } else {
      plan.toIncrement.push(record.productId);
    }
  }
  return plan;
}

function applyPlan(records: readonly AssignmentRecord[], plan: ReconcilePlan): AssignmentRecord[] {
  const reset = new Set(plan.toReset);
  const increment = new Set(plan.toIncrement);
  const del = new Set(plan.toDelete);

  return records
    .filter((r) => !del.has(r.productId))
    .map((r) =>
      reset.has(r.productId)
        ? { ...r, missCount: 0 }
        : increment.has(r.productId)
          ? { ...r, missCount: r.missCount + 1 }
          : r
    );
}

const isEmptyPlan = (p: ReconcilePlan) =>
  p.toReset.length + p.toIncrement.length + p.toDelete.length === 0;

export interface AssignmentManager {
  /** Call once per *fresh* LokmaGo snapshot: counts a check, prunes, reloads. Never rejects. */
  onFreshSnapshot(presentIds: ReadonlySet<string>): Promise<void>;
  assign(record: Omit<AssignmentRecord, 'missCount'>): Promise<void>;
  clear(productId: string): Promise<boolean>;
  /** dish id → category slug. `version` changes whenever the map does. */
  current(): { map: ReadonlyMap<string, string>; version: number };
}

export function createAssignmentManager(deps: {
  store: AssignmentStore;
  missLimit: number;
  log: AssignmentLogger;
}): AssignmentManager {
  const { store, log } = deps;
  const missLimit = Math.max(1, Math.floor(deps.missLimit));

  let records: AssignmentRecord[] = [];
  let map: ReadonlyMap<string, string> = new Map();
  let version = 0;

  // One operation at a time: a reconcile must not interleave with an admin edit.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn);
    queue = next.catch(() => undefined);
    return next;
  };

  function publish(next: AssignmentRecord[]) {
    records = next;
    map = new Map(next.map((r) => [r.productId, r.categorySlug]));
    version++;
  }

  return {
    onFreshSnapshot(presentIds) {
      return serial(async () => {
        let loaded: AssignmentRecord[];
        try {
          loaded = await store.list();
        } catch (err) {
          // Keep whatever we had: the shop keeps working, choices just aren't refreshed.
          log.error('Could not load category assignments — keeping the previous ones', {
            error: err instanceof Error ? err.message : String(err),
          });
          return;
        }

        // An empty fetch says nothing about which dishes still exist.
        if (presentIds.size === 0) {
          publish(loaded);
          return;
        }

        const plan = planReconcile(loaded, presentIds, missLimit);
        if (isEmptyPlan(plan)) {
          publish(loaded);
          return;
        }

        try {
          await store.applyReconcile(plan);
        } catch (err) {
          log.error('Could not update assignment miss counters', {
            error: err instanceof Error ? err.message : String(err),
          });
          publish(loaded);
          return;
        }

        if (plan.toDelete.length > 0) {
          log.warn('Dropped category choices for dishes LokmaGo no longer returns', {
            productIds: plan.toDelete,
            afterChecks: missLimit,
          });
        }
        publish(applyPlan(loaded, plan));
      });
    },

    assign(record) {
      return serial(async () => {
        await store.upsert(record);
        publish([
          ...records.filter((r) => r.productId !== record.productId),
          { ...record, missCount: 0 },
        ]);
      });
    },

    clear(productId) {
      return serial(async () => {
        const removed = await store.remove(productId);
        publish(records.filter((r) => r.productId !== productId));
        return removed;
      });
    },

    current: () => ({ map, version }),
  };
}

/** Process-local store. Backs the tests, and is a safe stand-in when MongoDB is unavailable. */
export function createMemoryAssignmentStore(initial: AssignmentRecord[] = []): AssignmentStore & {
  snapshot(): AssignmentRecord[];
} {
  const rows = new Map(initial.map((r) => [r.productId, { ...r }]));

  return {
    async list() {
      return [...rows.values()].map((r) => ({ ...r }));
    },
    async upsert(record) {
      rows.set(record.productId, { ...record, missCount: 0 });
    },
    async remove(productId) {
      return rows.delete(productId);
    },
    async applyReconcile(plan) {
      for (const id of plan.toReset) {
        const row = rows.get(id);
        if (row) row.missCount = 0;
      }
      for (const id of plan.toIncrement) {
        const row = rows.get(id);
        if (row) row.missCount++;
      }
      for (const id of plan.toDelete) rows.delete(id);
    },
    snapshot: () => [...rows.values()].map((r) => ({ ...r })),
  };
}
