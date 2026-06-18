/**
 * In-memory PrismaClient mock.
 * Implements the subset of Prisma operations used by FundingService.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

function makeStore() {
  const store = new Map<string, AnyRecord>();
  let seq = 0;

  function nextId() { return `id-${++seq}`; }

  function matchesWhere(record: AnyRecord, where: AnyRecord): boolean {
    for (const [k, v] of Object.entries(where)) {
      if (typeof v === 'object' && v !== null) {
        const op = v as AnyRecord;
        if ('in' in op) {
          if (!(op.in as unknown[]).includes(record[k])) return false;
        } else if ('notIn' in op) {
          if ((op.notIn as unknown[]).includes(record[k])) return false;
        } else if ('lte' in op) {
          if (record[k] > op.lte) return false;
        } else if ('gte' in op) {
          if (record[k] < op.gte) return false;
        } else if ('not' in op) {
          if (record[k] === op.not) return false;
        }
      } else {
        if (record[k] !== v) return false;
      }
    }
    return true;
  }

  return {
    store,
    nextId,
    findUnique(arg: { where: AnyRecord }): AnyRecord | null {
      if ('id' in arg.where) return store.get(arg.where.id as string) ?? null;
      for (const record of store.values()) {
        if (matchesWhere(record, arg.where)) return record;
      }
      return null;
    },
    findUniqueOrThrow(arg: { where: AnyRecord }): AnyRecord {
      const r = this.findUnique(arg);
      if (!r) throw new Error(`Record not found: ${JSON.stringify(arg.where)}`);
      return r;
    },
    findFirst(arg: { where?: AnyRecord; orderBy?: AnyRecord }): AnyRecord | null {
      let records = Array.from(store.values());
      if (arg.where) records = records.filter(r => matchesWhere(r, arg.where!));
      if (arg.orderBy) {
        const [field, dir] = Object.entries(arg.orderBy)[0];
        records.sort((a, b) => {
          const av = a[field], bv = b[field];
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return dir === 'desc' ? -cmp : cmp;
        });
      }
      return records[0] ?? null;
    },
    findMany(arg: { where?: AnyRecord; orderBy?: AnyRecord } = {}): AnyRecord[] {
      let records = Array.from(store.values());
      if (arg.where) records = records.filter(r => matchesWhere(r, arg.where!));
      if (arg.orderBy) {
        const [field, dir] = Object.entries(arg.orderBy)[0];
        records.sort((a, b) => {
          const av = a[field], bv = b[field];
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return dir === 'desc' ? -cmp : cmp;
        });
      }
      return records;
    },
    create(arg: { data: AnyRecord }): AnyRecord {
      const id = (arg.data.id as string | undefined) ?? nextId();
      const record = { id, createdAt: new Date(), updatedAt: new Date(), ...arg.data };
      store.set(id, record);
      return record;
    },
    update(arg: { where: AnyRecord; data: AnyRecord }): AnyRecord {
      const existing = this.findUnique({ where: arg.where });
      if (!existing) throw new Error(`Record not found for update: ${JSON.stringify(arg.where)}`);
      const updated = { ...existing, ...arg.data, updatedAt: new Date() };
      store.set(existing.id as string, updated);
      return updated;
    },
    aggregate(arg: { where?: AnyRecord; _sum?: AnyRecord }) {
      const records = arg.where
        ? Array.from(store.values()).filter(r => matchesWhere(r, arg.where!))
        : Array.from(store.values());
      const sum: AnyRecord = {};
      if (arg._sum) {
        for (const field of Object.keys(arg._sum)) {
          sum[field] = records.reduce((s, r) => s + ((r[field] as number) || 0), 0);
        }
      }
      return { _sum: sum };
    },
  };
}

type Store = ReturnType<typeof makeStore>;

function wrapAsync(s: Store) {
  return {
    findUnique:        jest.fn((arg: Parameters<Store['findUnique']>[0])        => Promise.resolve(s.findUnique(arg))),
    findUniqueOrThrow: jest.fn((arg: Parameters<Store['findUniqueOrThrow']>[0]) => Promise.resolve(s.findUniqueOrThrow(arg))),
    findFirst:         jest.fn((arg: Parameters<Store['findFirst']>[0])         => Promise.resolve(s.findFirst(arg))),
    findMany:          jest.fn((arg: Parameters<Store['findMany']>[0])          => Promise.resolve(s.findMany(arg))),
    create:            jest.fn((arg: Parameters<Store['create']>[0])            => Promise.resolve(s.create(arg))),
    update:            jest.fn((arg: Parameters<Store['update']>[0])            => Promise.resolve(s.update(arg))),
    aggregate:         jest.fn((arg: Parameters<Store['aggregate']>[0])         => Promise.resolve(s.aggregate(arg))),
    _store:            s,
  };
}

export function createMockPrisma() {
  const fundingRequestStore   = makeStore();
  const standingApprovalStore = makeStore();
  const achAuthStore          = makeStore();
  const inboundCreditStore    = makeStore();

  const fr  = wrapAsync(fundingRequestStore);
  const sa  = wrapAsync(standingApprovalStore);
  const ach = wrapAsync(achAuthStore);
  const ic  = wrapAsync(inboundCreditStore);

  return {
    fundingRequest: {
      findUnique:        fr.findUnique,
      findUniqueOrThrow: fr.findUniqueOrThrow,
      findFirst:         fr.findFirst,
      findMany:          fr.findMany,
      create:            fr.create,
      update:            fr.update,
      aggregate:         fr.aggregate,
    },
    standingApproval: {
      findUnique:        sa.findUnique,
      findUniqueOrThrow: sa.findUniqueOrThrow,
      findMany:          sa.findMany,
      create:            sa.create,
      update:            sa.update,
    },
    achAuthorization: {
      findFirst: ach.findFirst,
      create:    ach.create,
      update:    ach.update,
    },
    inboundCredit: {
      findUnique: ic.findUnique,
      findMany:   ic.findMany,
      create:     ic.create,
      update:     ic.update,
    },
    // Direct store access for test setup/inspection
    _stores: {
      fundingRequests:   fundingRequestStore,
      standingApprovals: standingApprovalStore,
      achAuthorizations: achAuthStore,
      inboundCredits:    inboundCreditStore,
    },
  };
}

export type MockPrisma = ReturnType<typeof createMockPrisma>;
