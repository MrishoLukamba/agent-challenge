export type ActivityEntry = {
  url: string;
  title: string;
  domain: string;
  ts: number;
  duration: number;
};

export type Store = {
  entries: ActivityEntry[];
  index: Record<string, number[]>;
};

export function createStore(): Store {
  return { entries: [], index: {} };
}

export function addEntry(store: Store, entry: ActivityEntry): Store {
  const idx = store.entries.length;
  store.entries.push(entry);
  if (!store.index[entry.domain]) store.index[entry.domain] = [];
  store.index[entry.domain].push(idx);
  return store;
}

export function prune(store: Store, windowMs: number): Store {
  const cutoff = Date.now() - windowMs;
  const kept: ActivityEntry[] = [];
  const newIndex: Record<string, number[]> = {};

  for (const entry of store.entries) {
    if (entry.ts > cutoff) {
      const newIdx = kept.length;
      kept.push(entry);
      if (!newIndex[entry.domain]) newIndex[entry.domain] = [];
      newIndex[entry.domain].push(newIdx);
    }
  }

  store.entries = kept;
  store.index = newIndex;
  return store;
}

export function getPayload(store: Store) {
  const byDomain: Record<
    string,
    { url: string; title: string; duration: number; ts: number }[]
  > = {};
  for (const [domain, indices] of Object.entries(store.index)) {
    byDomain[domain] = indices.map((i) => {
      const e = store.entries[i]!;
      return { url: e.url, title: e.title, duration: e.duration, ts: e.ts };
    });
  }
  return {
    collectedAt: new Date().toISOString(),
    totalEntries: store.entries.length,
    domains: Object.keys(byDomain),
    data: byDomain,
  };
}

export type DomainStat = {
  domain: string;
  count: number;
  totalDuration: number;
  lastVisit: number;
  recentTitles: string[];
};

export function getDomainStats(store: Store): DomainStat[] {
  const stats: Record<string, DomainStat> = {};

  for (const entry of store.entries) {
    if (!stats[entry.domain]) {
      stats[entry.domain] = {
        domain: entry.domain,
        count: 0,
        totalDuration: 0,
        lastVisit: 0,
        recentTitles: [],
      };
    }
    const s = stats[entry.domain]!;
    s.count += 1;
    s.totalDuration += entry.duration;
    if (entry.ts > s.lastVisit) s.lastVisit = entry.ts;

    if (entry.title && !s.recentTitles.includes(entry.title)) {
      s.recentTitles.push(entry.title);
      if (s.recentTitles.length > 3) s.recentTitles.shift();
    }
  }

  return Object.values(stats).sort((a, b) => b.totalDuration - a.totalDuration);
}
