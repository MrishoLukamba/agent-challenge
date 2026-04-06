import {
  addEntry,
  createStore,
  getDomainStats,
  getPayload,
  prune,
  type ActivityEntry,
  type Store,
} from '../lib/indexer';

let store: Store = createStore();
let isTracking = true;
let blockedDomains: Record<string, boolean> = {};
let currentTab: {
  url: string;
  title: string;
  domain: string;
  startTs: number;
} | null = null;
let pendingResults: {
  receivedAt: number;
  summary: string;
  tweets: unknown[];
} | null = null;
let timerConfig = {
  mode: 'interval' as 'interval' | 'scheduled',
  intervalMinutes: 120,
  scheduledTimes: [] as string[],
};

const DEFAULT_BLOCKED = [
  'chrome-extension',
  'extensions',
  'newtab',
  'localhost',
  'mail.google.com',
  'accounts.google.com',
  'myaccount.google.com',
  'online-banking',
];

const WINDOW_MS = 6 * 60 * 60 * 1000;
const DEFAULT_AGENT_URL = 'http://localhost:3000';

async function restore() {
  const session = await chrome.storage.session.get('zerem');
  if (session.zerem) {
    const z = session.zerem as {
      store?: Store;
      isTracking?: boolean;
      currentTab?: (typeof currentTab) | null;
      pendingResults?: typeof pendingResults;
    };
    store = z.store ?? createStore();
    isTracking = z.isTracking ?? true;
    currentTab = z.currentTab ?? null;
    pendingResults = z.pendingResults ?? null;
  }

  const sync = await chrome.storage.sync.get(['blockedDomains', 'timerConfig']);
  if (sync.blockedDomains && Object.keys(sync.blockedDomains as object).length) {
    blockedDomains = sync.blockedDomains as Record<string, boolean>;
  } else {
    blockedDomains = {};
    DEFAULT_BLOCKED.forEach((d) => {
      blockedDomains[d] = true;
    });
    await chrome.storage.sync.set({ blockedDomains });
  }
  if (sync.timerConfig) {
    timerConfig = { ...timerConfig, ...(sync.timerConfig as typeof timerConfig) };
  }
}

async function persist() {
  await chrome.storage.session.set({
    zerem: { store, isTracking, currentTab, pendingResults },
  });
}

async function persistBlocked() {
  await chrome.storage.sync.set({ blockedDomains });
}

function isDomainBlocked(domain: string) {
  if (blockedDomains[domain]) return true;
  for (const blocked of Object.keys(blockedDomains)) {
    if (blockedDomains[blocked] && domain.includes(blocked)) return true;
  }
  if (!domain || domain === '' || domain.startsWith('chrome')) return true;
  return false;
}

function finalizeCurrentTab(now: number) {
  if (!currentTab) return;
  const duration = now - currentTab.startTs;
  if (duration > 5000) {
    const entry: ActivityEntry = {
      url: currentTab.url,
      title: currentTab.title,
      domain: currentTab.domain,
      ts: currentTab.startTs,
      duration,
    };
    addEntry(store, entry);
  }
  currentTab = null;
}

function setupTimer() {
  chrome.alarms.clear('zerem-send');
  chrome.alarms.clear('zerem-scheduled');

  if (timerConfig.mode === 'interval') {
    const m = Math.max(1, Number(timerConfig.intervalMinutes) || 120);
    chrome.alarms.create('zerem-send', {
      delayInMinutes: m,
      periodInMinutes: m,
    });
  } else if (timerConfig.mode === 'scheduled' && timerConfig.scheduledTimes?.length) {
    scheduleNextAlarm();
  }
}

function scheduleNextAlarm() {
  if (!timerConfig.scheduledTimes?.length) return;
  const now = new Date();
  let nearestMs = Infinity;

  for (const timeStr of timerConfig.scheduledTimes) {
    const [h, m] = timeStr.split(':').map(Number);
    const candidate = new Date(now);
    candidate.setHours(h, m, 0, 0);
    if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
    const diff = candidate.getTime() - now.getTime();
    if (diff < nearestMs) nearestMs = diff;
  }

  if (nearestMs !== Infinity) {
    chrome.alarms.create('zerem-scheduled', {
      when: Date.now() + nearestMs,
    });
  }
}

async function sendToAgent() {
  if (!isTracking) return;
  finalizeCurrentTab(Date.now());
  prune(store, WINDOW_MS);

  const payload = getPayload(store);
  if (payload.totalEntries === 0) return;

  const config = await chrome.storage.sync.get('agentUrl');
  const agentUrl = ((config.agentUrl as string) || DEFAULT_AGENT_URL).replace(/\/$/, '');

  try {
    const res = await fetch(`${agentUrl}/api/zerem/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return;

    const result = (await res.json()) as { summary?: string; tweets?: unknown[] };
    const tweets = Array.isArray(result.tweets) ? result.tweets : [];
    pendingResults = {
      receivedAt: Date.now(),
      summary: result.summary || '',
      tweets,
    };
    await persist();

    if (tweets.length > 0) {
      try {
        await chrome.notifications.create('zerem-ready', {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Zerem',
          message: `${tweets.length} tweet ideas ready for review`,
          priority: 2,
        });
      } catch {
        /* ignore */
      }
      chrome.action.setBadgeText({ text: String(tweets.length) });
      chrome.action.setBadgeBackgroundColor({ color: '#3dd68c' });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Zerem: failed to reach agent:', msg);
  }
}

async function publishTweet(payload: { text: string; index?: number }) {
  const config = await chrome.storage.sync.get('agentUrl');
  const agentUrl = ((config.agentUrl as string) || DEFAULT_AGENT_URL).replace(/\/$/, '');

  try {
    const res = await fetch(`${agentUrl}/api/zerem/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { error: `Agent returned ${res.status}` };

    await res.json().catch(() => ({}));
    pendingResults = null;
    chrome.action.setBadgeText({ text: '' });
    await persist();
    return { success: true as const };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Failed to reach agent: ${message}` };
  }
}

chrome.runtime.onMessage.addListener(
  (msg: { type?: string; [k: string]: unknown }, _sender, respond: (r: unknown) => void) => {
    if (msg?.type === 'GET_STATUS') {
      finalizeCurrentTab(Date.now());
      prune(store, WINDOW_MS);
      const stats = getDomainStats(store);
      chrome.alarms.getAll((alarms) => {
        const send = alarms.find((a) => a.name === 'zerem-send' || a.name === 'zerem-scheduled');
        respond({
          isTracking,
          blockedDomains,
          entryCount: store.entries.length,
          domainStats: stats,
          hasPending: !!pendingResults,
          pendingCount: pendingResults?.tweets?.length ?? 0,
          timerConfig,
          nextAlarmWhen: send?.scheduledTime ?? null,
        });
      });
      return true;
    }

    switch (msg.type) {
      case 'SIGNAL':
        if (!isTracking) break;
        if (isDomainBlocked(msg.domain as string)) break;
        finalizeCurrentTab(msg.ts as number);
        currentTab = {
          url: msg.url as string,
          title: msg.title as string,
          domain: msg.domain as string,
          startTs: msg.ts as number,
        };
        persist();
        break;

      case 'VISIBILITY':
        if (!isTracking) break;
        if (isDomainBlocked(msg.domain as string)) break;
        if (!msg.visible) {
          finalizeCurrentTab(msg.ts as number);
          currentTab = null;
        } else {
          currentTab = {
            url: msg.url as string,
            title: '',
            domain: msg.domain as string,
            startTs: msg.ts as number,
          };
        }
        persist();
        break;

      case 'GET_PENDING':
        respond({ pending: pendingResults });
        break;

      case 'DISMISS_PENDING':
        pendingResults = null;
        chrome.action.setBadgeText({ text: '' });
        persist();
        respond({ ok: true });
        break;

      case 'BLOCK_DOMAIN':
        blockedDomains[msg.domain as string] = true;
        persistBlocked();
        store.entries = store.entries.filter((e) => e.domain !== msg.domain);
        store.index = {};
        store.entries.forEach((e, i) => {
          if (!store.index[e.domain]) store.index[e.domain] = [];
          store.index[e.domain].push(i);
        });
        persist();
        respond({ ok: true });
        break;

      case 'UNBLOCK_DOMAIN':
        delete blockedDomains[msg.domain as string];
        persistBlocked();
        respond({ ok: true });
        break;

      case 'PUBLISH_TWEET':
        publishTweet(msg.payload as { text: string; index?: number }).then(respond);
        return true;

      case 'FORCE_SEND':
        sendToAgent().then(() => respond({ ok: true }));
        return true;

      case 'TOGGLE_TRACKING':
        isTracking = msg.enabled as boolean;
        if (!isTracking) {
          finalizeCurrentTab(Date.now());
          currentTab = null;
        }
        persist();
        respond({ isTracking });
        break;

      case 'UPDATE_TIMER':
        timerConfig = { ...timerConfig, ...(msg.timerConfig as typeof timerConfig) };
        chrome.storage.sync.set({ timerConfig });
        setupTimer();
        respond({ ok: true });
        break;

      case 'CLEAR':
        store = createStore();
        currentTab = null;
        persist();
        respond({ ok: true });
        break;

      default:
        break;
    }

    return false;
  }
);

chrome.tabs.onActivated.addListener(async (info) => {
  if (!isTracking) return;
  try {
    const tab = await chrome.tabs.get(info.tabId);
    if (!tab.url) return;
    let domain: string;
    try {
      domain = new URL(tab.url).hostname.replace(/^www\./, '');
    } catch {
      return;
    }
    if (isDomainBlocked(domain)) return;
    finalizeCurrentTab(Date.now());
    currentTab = {
      url: tab.url,
      title: tab.title || '',
      domain,
      startTs: Date.now(),
    };
    persist();
  } catch {
    /* ignore */
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    finalizeCurrentTab(Date.now());
    currentTab = null;
    persist();
  }
});

chrome.alarms.create('zerem-prune', { periodInMinutes: 15 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'zerem-prune') {
    prune(store, WINDOW_MS);
    persist();
  }
  if (alarm.name === 'zerem-send' || alarm.name === 'zerem-scheduled') {
    await sendToAgent();
    if (timerConfig.mode === 'scheduled') scheduleNextAlarm();
  }
});

chrome.notifications.onClicked.addListener((id) => {
  if (id === 'zerem-ready') {
    try {
      chrome.action.openPopup();
    } catch {
      /* ignore */
    }
  }
});

void restore().then(() => setupTimer());
