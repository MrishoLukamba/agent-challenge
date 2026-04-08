import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { DomainStat } from '../lib/indexer';

type MyMarketNft = {
  id: string;
  imageUrl: string;
  caption: string;
  buyers: number;
  sellers: number;
  volumeSol: number;
  activitySummary: string;
};

type BrowseMarketNft = {
  id: string;
  creator: string;
  imageUrl: string;
  caption: string;
  buyers: number;
  sellers: number;
  impressions: number;
  activitySummary: string;
};

/** Demo listings until backend / chain data is wired */
const MOCK_MY_NFTS: MyMarketNft[] = [
  {
    id: 'my-1',
    imageUrl: 'https://picsum.photos/seed/zerem1/400/220',
    caption: 'Shipped the activity indexer — turning browsing into signal.',
    buyers: 38,
    sellers: 5,
    volumeSol: 4.2,
    activitySummary: 'Steady buys after your X thread; 3 repeat collectors this week.',
  },
  {
    id: 'my-2',
    imageUrl: 'https://picsum.photos/seed/zerem2/400/220',
    caption: 'Hot take: fractional attention markets > likes.',
    buyers: 112,
    sellers: 22,
    volumeSol: 18.6,
    activitySummary: 'Spike in sellers taking profit Fri–Sun; impressions up 2× vs prior mint.',
  },
  {
    id: 'my-3',
    imageUrl: 'https://picsum.photos/seed/zerem3/400/220',
    caption: 'Screenshot of the Zerem popup — dark mode only.',
    buyers: 9,
    sellers: 1,
    volumeSol: 0.7,
    activitySummary: 'Thin but loyal; mostly friends-of-network buyers.',
  },
];

const MOCK_MARKET_NFTS: BrowseMarketNft[] = [
  {
    id: 'm-1',
    creator: '@solena',
    imageUrl: 'https://picsum.photos/seed/creator1/400/220',
    caption: 'Deep dive: how we route on-chain settlement under 400ms.',
    buyers: 240,
    sellers: 61,
    impressions: 12400,
    activitySummary: 'Creator posts weekly; buyers cluster around technical drops.',
  },
  {
    id: 'm-2',
    creator: '@kai',
    imageUrl: 'https://picsum.photos/seed/creator2/400/220',
    caption: 'Art thread: gradients that look like terminal themes.',
    buyers: 89,
    sellers: 14,
    impressions: 5600,
    activitySummary: 'Strong visual NFTs; impressions driven by quote-tweets.',
  },
  {
    id: 'm-3',
    creator: '@river',
    imageUrl: 'https://picsum.photos/seed/creator3/400/220',
    caption: 'POAP from the community call — thanks everyone.',
    buyers: 512,
    sellers: 88,
    impressions: 28900,
    activitySummary: 'High churn sellers; impressions peaked the day after the space.',
  },
  {
    id: 'm-4',
    creator: '@nova',
    imageUrl: 'https://picsum.photos/seed/creator4/400/220',
    caption: 'Meme: when the market is your second screen.',
    buyers: 1567,
    sellers: 402,
    impressions: 91000,
    activitySummary: 'Viral meme format; very high impression-to-buyer ratio.',
  },
];

type TimerConfig = {
  mode: 'interval' | 'scheduled';
  intervalMinutes: number;
  scheduledTimes: string[];
};

type StatusState = {
  isTracking: boolean;
  blockedDomains: Record<string, boolean>;
  entryCount: number;
  domainStats: DomainStat[];
  hasPending: boolean;
  pendingCount: number;
  timerConfig: TimerConfig;
  nextAlarmWhen: number | null;
};

type PendingPayload = {
  summary?: string;
  tweets?: unknown[];
} | null;

type SelectedTweet = {
  text: string;
  nftEligible: boolean;
  reason: string;
  index: number;
};

function formatDuration(ms: number) {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatNextSend(nextAlarmWhen: number | null) {
  if (!nextAlarmWhen) return 'next: —';
  const s = Math.max(0, Math.floor((nextAlarmWhen - Date.now()) / 1000));
  if (s < 60) return `next: ${s}s`;
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h > 0) return `next: ${h}h ${String(mm).padStart(2, '0')}m`;
  return `next: ${m}m`;
}

const icon48Url =
  typeof chrome !== 'undefined' && chrome.runtime?.getURL
    ? chrome.runtime.getURL('icons/icon48.png')
    : '';

function NavIconHome() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M2 6l6-4.5L14 6v7.5a1 1 0 01-1 1H3a1 1 0 01-1-1V6z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 14V8h4v6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NavIconGlobe() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M2 8h12M8 2c1.5 1.5 2.5 3.5 2.5 6s-1 4.5-2.5 6c-1.5-1.5-2.5-3.5-2.5-6s1-4.5 2.5-6z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function NavIconDoc() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M13 2H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V3a1 1 0 00-1-1z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M5 6h6M5 8.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function oauthAvatarUrl(
  user:
    | {
        verifiedCredentials?: Array<{
          oauthAccountPhotos?: string[] | null | undefined;
        } | null | undefined>;
      }
    | undefined
): string | null {
  if (!user?.verifiedCredentials?.length) return null;
  for (const c of user.verifiedCredentials) {
    const photos = c?.oauthAccountPhotos;
    if (Array.isArray(photos) && photos[0]) return photos[0];
  }
  return null;
}

function walletAccountTitle(
  user: { username?: string | null; alias?: string; email?: string } | undefined,
  address: string
) {
  if (user?.username) return String(user.username);
  if (user?.alias) return user.alias;
  if (user?.email) return user.email;
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/** Sidebar account avatar — only when wallet connected; opens Dynamic profile */
function NavAccountAvatar() {
  const { primaryWallet, user, setShowDynamicUserProfile } = useDynamicContext();
  if (!primaryWallet?.address) return null;
  const avatarUrl = oauthAvatarUrl(user);
  const title = walletAccountTitle(user, primaryWallet.address);
  return (
    <button
      type="button"
      className="nav-account-btn"
      aria-label={`Account · ${title}`}
      onClick={() => setShowDynamicUserProfile(true)}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="nav-account-img"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="nav-account-fallback" aria-hidden>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="5" r="2.75" stroke="currentColor" strokeWidth="1.35" />
            <path
              d="M2.75 13.25c0-2.9 2.35-5.25 5.25-5.25s5.25 2.35 5.25 5.25"
              stroke="currentColor"
              strokeWidth="1.35"
              strokeLinecap="round"
            />
          </svg>
        </span>
      )}
      <span className="nav-tooltip">Account</span>
    </button>
  );
}

type TimerIntervalSaveProps = {
  intervalHoursInput: string;
  setIntervalHoursInput: Dispatch<SetStateAction<string>>;
  intervalHours: number;
  refresh: () => Promise<void>;
};

/** Persist send interval per wallet: localStorage[address] = JSON.stringify({ interval: hours }) */
function TimerIntervalSaveWithWallet({
  intervalHoursInput,
  setIntervalHoursInput,
  intervalHours,
  refresh,
}: TimerIntervalSaveProps) {
  const { primaryWallet } = useDynamicContext();
  const address = primaryWallet?.address ?? null;

  useEffect(() => {
    if (!address) {
      setIntervalHoursInput(String(intervalHours));
      return;
    }
    try {
      const raw = localStorage.getItem(address);
      if (raw) {
        const parsed = JSON.parse(raw) as { interval?: unknown };
        const n = Number(parsed.interval);
        if (Number.isFinite(n) && n >= 1 && n <= 24) {
          setIntervalHoursInput(String(n));
          return;
        }
      }
    } catch {
      /* ignore corrupt entries */
    }
    setIntervalHoursInput(String(intervalHours));
  }, [address, intervalHours, setIntervalHoursInput]);

  const save = async () => {
    if (!address) return;
    const h = parseInt(intervalHoursInput, 10);
    const hours =
      intervalHoursInput !== '' && Number.isFinite(h) && h >= 1 && h <= 24 ? h : intervalHours;
    await chrome.runtime.sendMessage({
      type: 'UPDATE_TIMER',
      timerConfig: {
        mode: 'interval',
        intervalMinutes: hours * 60,
        scheduledTimes: [],
      },
    });
    try {
      localStorage.setItem(address, JSON.stringify({ interval: hours }));
    } catch {
      /* quota / private mode */
    }
    await refresh();
  };

  const canSave = Boolean(address);

  return (
    <button
      type="button"
      className="btn small"
      disabled={!canSave}
      title={canSave ? undefined : 'Connect a wallet to save your schedule'}
      onClick={() => void save()}
    >
      Save
    </button>
  );
}

/** Home empty state — must render only inside DynamicContextProvider when env is set */
function HomeConnectWalletButton() {
  const { primaryWallet, setShowAuthFlow, setShowDynamicUserProfile } = useDynamicContext();
  const connected = Boolean(primaryWallet);
  return (
    <div className="home-connect-wrap">
      <button
        type="button"
        className="btn primary home-connect-btn"
        onClick={() => {
          if (connected) setShowDynamicUserProfile(true);
          else setShowAuthFlow(true);
        }}
      >
        {connected ? 'Manage wallet' : 'Connect wallet'}
      </button>
    </div>
  );
}

function NavIconMarket() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 6.5h10l-1 7H4l-1-7z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 6.5V5a2.5 2.5 0 015 0v1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M3 6.5L4 3h8l1 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function App() {
  const [status, setStatus] = useState<StatusState | null>(null);
  const [pending, setPending] = useState<PendingPayload>(null);
  const [panel, setPanel] = useState<
    | 'home'
    | 'domains'
    | 'review'
    | 'editor'
    | 'publishing'
    | 'done'
    | 'my-market'
    | 'market-browse'
  >('home');
  const [sidebarNav, setSidebarNav] = useState<'home' | 'domains' | 'review' | 'market'>('home');
  const [marketMenuOpen, setMarketMenuOpen] = useState(false);
  const marketNavRef = useRef<HTMLDivElement>(null);
  const [socialMenuOpen, setSocialMenuOpen] = useState(false);
  const socialAnchorRef = useRef<HTMLDivElement>(null);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [blockedHeaderLabel, setBlockedHeaderLabel] = useState('Blocked (0) ▸');
  const [selectedTweet, setSelectedTweet] = useState<SelectedTweet | null>(null);
  const [editorText, setEditorText] = useState('');
  const [publishLabel, setPublishLabel] = useState('Posting...');
  const [intervalHoursInput, setIntervalHoursInput] = useState('2');

  const refresh = useCallback(async () => {
    const state = (await chrome.runtime.sendMessage({ type: 'GET_STATUS' })) as StatusState;
    setStatus(state);
    const p = await chrome.runtime.sendMessage({ type: 'GET_PENDING' });
    setPending((p as { pending: PendingPayload }).pending ?? null);
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (marketMenuOpen) {
        const el = marketNavRef.current;
        if (el && !el.contains(t)) setMarketMenuOpen(false);
      }
      if (socialMenuOpen) {
        const el = socialAnchorRef.current;
        if (el && !el.contains(t)) setSocialMenuOpen(false);
      }
    };
    if (!marketMenuOpen && !socialMenuOpen) return;
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [marketMenuOpen, socialMenuOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMarketMenuOpen(false);
        setSocialMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openMarketSub = useCallback((sub: 'my-market' | 'market-browse') => {
    setSidebarNav('market');
    setPanel(sub);
    setMarketMenuOpen(false);
    setSocialMenuOpen(false);
  }, []);

  const intervalHours = status
    ? Math.max(1, Math.round((status.timerConfig.intervalMinutes || 120) / 60))
    : 2;

  const dynamicEnv = Boolean(import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID);

  useEffect(() => {
    if (dynamicEnv) return;
    setIntervalHoursInput(String(intervalHours));
  }, [dynamicEnv, status?.timerConfig?.intervalMinutes, intervalHours]);

  useEffect(() => {
    if (!status?.blockedDomains) return;
    const n = Object.keys(status.blockedDomains).filter((d) => status.blockedDomains[d]).length;
    setBlockedHeaderLabel(`Blocked (${n}) ${blockedOpen ? '▾' : '▸'}`);
  }, [status?.blockedDomains, blockedOpen]);

  const nav = (view: typeof sidebarNav) => {
    setMarketMenuOpen(false);
    setSocialMenuOpen(false);
    setSidebarNav(view);
    if (view === 'home') setPanel('home');
    else if (view === 'domains') setPanel('domains');
    else if (view === 'review') setPanel('review');
  };

  const toggleBlocked = () => {
    const n = status
      ? Object.keys(status.blockedDomains).filter((d) => status.blockedDomains[d]).length
      : 0;
    const next = !blockedOpen;
    setBlockedOpen(next);
    setBlockedHeaderLabel(`Blocked (${n}) ${next ? '▾' : '▸'}`);
  };

  const blockedKeys = status
    ? Object.keys(status.blockedDomains).filter((d) => status.blockedDomains[d])
    : [];
  const activeDomains = status
    ? status.domainStats.filter((d) => !status.blockedDomains[d.domain])
    : [];
  const hasDomainData = activeDomains.length > 0 || blockedKeys.length > 0;

  const openEditor = (tweet: SelectedTweet) => {
    setSelectedTweet(tweet);
    setEditorText(tweet.text);
    setSidebarNav('review');
    setPanel('editor');
    setPublishLabel(
      tweet.nftEligible
        ? 'Posting tweet, minting NFT, creating market...'
        : 'Posting tweet to X...'
    );
  };

  const charCountClass =
    editorText.length > 280 ? 'over' : editorText.length > 250 ? 'warning' : '';

  return (
    <>
      <nav className="sidebar">
        {icon48Url ? (
          <img className="logo" src={icon48Url} width={30} height={30} alt="Zerem" />
        ) : null}
        <button
          type="button"
          className={`nav-btn${sidebarNav === 'home' && panel === 'home' ? ' active' : ''}`}
          aria-label="Home"
          onClick={() => nav('home')}
        >
          <NavIconHome />
          <span className="nav-tooltip">Home</span>
        </button>
        <button
          type="button"
          className={`nav-btn${sidebarNav === 'domains' ? ' active' : ''}`}
          aria-label="Domains"
          onClick={() => nav('domains')}
        >
          <NavIconGlobe />
          <span className="nav-tooltip">Domains</span>
        </button>
        <button
          type="button"
          className={`nav-btn${sidebarNav === 'review' ? ' active' : ''}`}
          aria-label="Posts"
          onClick={() => nav('review')}
        >
          <NavIconDoc />
          <span
            className={`nav-badge${status?.hasPending && (status.pendingCount ?? 0) > 0 ? ' visible' : ''}`}
          />
          <span className="nav-tooltip">Posts</span>
        </button>
        <div className="nav-market-anchor" ref={marketNavRef}>
          <button
            type="button"
            className={`nav-btn${sidebarNav === 'market' ? ' active' : ''}`}
            aria-label="Market"
            aria-expanded={marketMenuOpen}
            aria-haspopup="menu"
            onClick={() => setMarketMenuOpen((o) => !o)}
          >
            <NavIconMarket />
            <span className="nav-tooltip">Market</span>
          </button>
          {marketMenuOpen ? (
            <div className="market-popover" role="menu" aria-label="Market destinations">
              <button
                type="button"
                className="market-popover-item"
                role="menuitem"
                onClick={() => openMarketSub('my-market')}
              >
                My market
              </button>
              <button
                type="button"
                className="market-popover-item"
                role="menuitem"
                onClick={() => openMarketSub('market-browse')}
              >
                Market
              </button>
            </div>
          ) : null}
        </div>
        <div className="nav-spacer" />
        <div className="nav-bottom">
          {import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID ? <NavAccountAvatar /> : null}
          <button
            type="button"
            className="nav-btn"
            id="pauseBtn"
            aria-label="Pause tracking"
            onClick={async () => {
              const s = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
              const st = s as StatusState;
              const r = await chrome.runtime.sendMessage({
                type: 'TOGGLE_TRACKING',
                enabled: !st.isTracking,
              });
              setStatus((prev) =>
                prev ? { ...prev, isTracking: (r as { isTracking: boolean }).isTracking } : prev
              );
            }}
          >
            <div className={`status-dot${status && !status.isTracking ? ' paused' : ''}`} />
            <span className="nav-tooltip">
              {status?.isTracking ? 'Pause tracking' : 'Resume tracking'}
            </span>
          </button>
          <span
            className={`nav-status-label${status && !status.isTracking ? ' paused' : ''}`}
            aria-live="polite"
          >
            {status?.isTracking ? 'Live' : 'Paused'}
          </span>
        </div>
      </nav>

      <div className="main">
        <div className={`view${panel === 'home' ? ' active' : ''}`} id="view-home">
          <div className="main-header">
            <h2>Home</h2>
          </div>
          <div className="status-bar">
            <span className="ct">{status?.entryCount ?? 0}</span> activities ·
            <span className="ct">{status?.domainStats?.length ?? 0}</span> domains
            <span
              style={{
                marginLeft: 'auto',
                fontFamily: 'var(--mono)',
                fontSize: 10,
                color: 'var(--text-muted)',
              }}
            >
              {formatNextSend(status?.nextAlarmWhen ?? null)}
            </span>
          </div>
          <div style={{ padding: '0 20px 20px' }}>
            <div
              className={`pending-banner${status?.hasPending && (status.pendingCount ?? 0) > 0 ? ' visible' : ''}`}
            >
              <div className="pending-info">
                <div className="pending-dot" />
                <span className="pending-text">
                  {status?.pendingCount ?? 0} tweets ready
                </span>
              </div>
              <button
                type="button"
                className="btn primary small"
                onClick={() => {
                  setSidebarNav('review');
                  setPanel('review');
                }}
              >
                Review
              </button>
            </div>
            <div className="timer-section">
              <div className="section-title">Send every</div>
              <div className="timer-row timer-row-compact">
                <div className="timer-inline-left">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={2}
                    className="input-small input-hours"
                    value={intervalHoursInput}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 2);
                      if (v === '') {
                        setIntervalHoursInput('');
                        return;
                      }
                      const n = parseInt(v, 10);
                      if (Number.isNaN(n)) return;
                      if (n > 24) {
                        setIntervalHoursInput('24');
                        return;
                      }
                      setIntervalHoursInput(v);
                    }}
                    onBlur={() => {
                      const n = parseInt(intervalHoursInput, 10);
                      if (intervalHoursInput === '' || Number.isNaN(n) || n < 1) {
                        setIntervalHoursInput(String(intervalHours));
                      } else {
                        setIntervalHoursInput(String(Math.min(24, Math.max(1, n))));
                      }
                    }}
                    aria-label="Hours between sends"
                  />
                  <span className="timer-label">hours</span>
                </div>
                <div className="timer-inline-actions">
                  {dynamicEnv ? (
                    <TimerIntervalSaveWithWallet
                      intervalHoursInput={intervalHoursInput}
                      setIntervalHoursInput={setIntervalHoursInput}
                      intervalHours={intervalHours}
                      refresh={refresh}
                    />
                  ) : (
                    <button
                      type="button"
                      className="btn small"
                      onClick={async () => {
                        const h = parseInt(intervalHoursInput, 10);
                        const hours =
                          intervalHoursInput !== '' &&
                          Number.isFinite(h) &&
                          h >= 1 &&
                          h <= 24
                            ? h
                            : intervalHours;
                        await chrome.runtime.sendMessage({
                          type: 'UPDATE_TIMER',
                          timerConfig: {
                            mode: 'interval',
                            intervalMinutes: hours * 60,
                            scheduledTimes: [],
                          },
                        });
                        await refresh();
                      }}
                    >
                      Save
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="home-social-anchor" ref={socialAnchorRef}>
              <button
                type="button"
                className="btn small home-social-trigger"
                aria-expanded={socialMenuOpen}
                aria-haspopup="menu"
                aria-label="Add social account"
                onClick={() => setSocialMenuOpen((o) => !o)}
              >
                Add social
              </button>
              {socialMenuOpen ? (
                <div className="home-social-popover" role="menu" aria-label="Social platforms">
                  <button
                    type="button"
                    className="home-social-x-icon-only"
                    role="menuitem"
                    title="Open X"
                    aria-label="Open X"
                    onClick={() => {
                      setSocialMenuOpen(false);
                      chrome.tabs.create({ url: 'https://x.com/' });
                    }}
                  >
                    <span aria-hidden>𝕏</span>
                  </button>
                </div>
              ) : null}
            </div>
            <div
              className="empty-state home-empty-state"
              style={{ display: (status?.entryCount ?? 0) > 0 ? 'none' : 'block' }}
            >
              <div className="empty-icon">◎</div>
              <p className="empty-title">No activity yet</p>
              <p className="empty-desc">
                Your digital life is interesting—let&apos;s make it auctionable.
              </p>
              {import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID ? (
                <HomeConnectWalletButton />
              ) : (
                <div className="home-connect-wrap">
                  <button type="button" className="btn primary home-connect-btn" disabled>
                    Connect wallet
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={`view${panel === 'domains' ? ' active' : ''}`} id="view-domains">
          <div className="main-header">
            <h2>Domains</h2>
          </div>
          <div style={{ padding: '12px 20px 20px' }}>
            <div className="empty-state" style={{ display: hasDomainData ? 'none' : 'block' }}>
              <div className="empty-icon">◎</div>
              <p className="empty-title">No domains tracked yet</p>
              <p className="empty-desc">
                As you browse, domains will appear here automatically. Toggle off any domain you
                don&apos;t want tracked.
              </p>
            </div>
            <div id="domainList" style={{ display: hasDomainData ? 'block' : 'none' }}>
              <div className="section-title">Tracking ({activeDomains.length})</div>
              <div>
                {activeDomains.map((stat) => (
                  <div key={stat.domain} className="domain-row">
                    <div className="domain-info">
                      <span className="domain-name">{stat.domain}</span>
                      {stat.count > 0 ? (
                        <span className="domain-meta">
                          {stat.count} visits · {formatDuration(stat.totalDuration)}
                        </span>
                      ) : null}
                    </div>
                    <div
                      className="toggle-switch on"
                      role="button"
                      tabIndex={0}
                      onClick={async () => {
                        await chrome.runtime.sendMessage({
                          type: 'BLOCK_DOMAIN',
                          domain: stat.domain,
                        });
                        await refresh();
                      }}
                    />
                  </div>
                ))}
              </div>
              {blockedKeys.length > 0 ? (
                <>
                  <div className="blocked-header" onClick={toggleBlocked} onKeyDown={() => {}}>
                    {blockedHeaderLabel}
                  </div>
                  <div style={{ display: blockedOpen ? 'block' : 'none' }}>
                    {blockedKeys.map((domain) => (
                      <div key={domain} className="domain-row">
                        <div className="domain-info">
                          <span className="domain-name muted">{domain}</span>
                        </div>
                        <div
                          className="toggle-switch"
                          role="button"
                          tabIndex={0}
                          onClick={async () => {
                            await chrome.runtime.sendMessage({ type: 'UNBLOCK_DOMAIN', domain });
                            await refresh();
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className={`view${panel === 'review' ? ' active' : ''}`} id="view-review">
          <div className="main-header">
            <h2>Review Tweets</h2>
          </div>
          <div style={{ padding: '12px 20px 20px' }}>
            {!pending?.tweets?.length ? (
              <div className="empty-state">
                <div className="empty-icon">◎</div>
                <p className="empty-title">No tweets pending</p>
                <p className="empty-desc">
                  When the timer fires, the agent will analyze your activity and send tweet ideas
                  here.
                </p>
              </div>
            ) : (
              <div>
                <div className="summary-block">
                  <p className="summary-label">Agent Activity Summary</p>
                  <p className="summary-text">{pending.summary || ''}</p>
                </div>
                <div className="section-title">Tap a tweet to edit & publish</div>
                <div>
                  {pending.tweets.map((t, index) => {
                    const text = typeof t === 'string' ? t : (t as { text?: string }).text || '';
                    const nftEligible =
                      typeof t === 'object' && !!(t as { nftEligible?: boolean }).nftEligible;
                    const reason =
                      typeof t === 'object' ? (t as { reason?: string }).reason || '' : '';
                    return (
                      <div
                        key={index}
                        className={`tweet-card${nftEligible ? ' nft-eligible' : ''}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => openEditor({ text, nftEligible, reason, index })}
                        onKeyDown={() => {}}
                      >
                        <p className="tweet-text">{text}</p>
                        <div className="tweet-meta">
                          <span className={`badge${nftEligible ? ' nft' : ''}`}>
                            {nftEligible ? 'NFT Eligible' : 'Tweet Only'}
                          </span>
                          <span className="reason">{reason}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn small danger"
                    onClick={async () => {
                      await chrome.runtime.sendMessage({ type: 'DISMISS_PENDING' });
                      await refresh();
                    }}
                  >
                    Dismiss All
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={`view${panel === 'editor' ? ' active' : ''}`} id="view-editor">
          <div className="main-header">
            <h2>Edit & Confirm</h2>
            <button
              type="button"
              className="btn small"
              onClick={() => {
                setPanel('review');
                setSidebarNav('review');
              }}
            >
              ← Back
            </button>
          </div>
          <div style={{ padding: '12px 20px 20px' }}>
            <div className="editor-wrap">
              <textarea
                className="tweet-textarea"
                value={editorText}
                onChange={(e) => setEditorText(e.target.value)}
              />
              <div className="editor-footer">
                <span className={`char-count ${charCountClass}`}>
                  {editorText.length}/280
                </span>
              </div>
            </div>
            <div className="confirm-preview">
              <h4>On confirm, the agent will:</h4>
              <div className="action-item">
                <div className="action-icon post">𝕏</div>
                <span>Post this tweet to your X account</span>
              </div>
              {selectedTweet?.nftEligible ? (
                <>
                  <div className="action-item">
                    <div className="action-icon mint">◆</div>
                    <span>Mint an NFT of this tweet on Solana</span>
                  </div>
                  <div className="action-item">
                    <div className="action-icon market">$</div>
                    <span>Create a fractional share market (100 shares)</span>
                  </div>
                </>
              ) : null}
            </div>
            <p className="nft-reason">
              {selectedTweet
                ? selectedTweet.nftEligible
                  ? `Why eligible: ${selectedTweet.reason}`
                  : `Not NFT eligible: ${selectedTweet.reason}`
                : ''}
            </p>
            <button
              type="button"
              className="btn primary full-width"
              onClick={async () => {
                if (!selectedTweet) return;
                const text = editorText.trim();
                if (!text) return;
                setPanel('publishing');
                const res = await chrome.runtime.sendMessage({
                  type: 'PUBLISH_TWEET',
                  payload: { text, index: selectedTweet.index },
                });
                setSelectedTweet(null);
                if (res && typeof res === 'object' && 'error' in res) {
                  setPanel('review');
                  setSidebarNav('review');
                  alert((res as { error: string }).error);
                  return;
                }
                setPanel('done');
                await refresh();
              }}
            >
              {selectedTweet?.nftEligible
                ? 'Confirm — Post, Mint & Create Market'
                : 'Confirm — Post Tweet'}
            </button>
          </div>
        </div>

        <div className={`view${panel === 'publishing' ? ' active' : ''}`} id="view-publishing">
          <div className="loading-view">
            <div className="spinner" />
            <p className="loading-text">{publishLabel}</p>
          </div>
        </div>

        <div className={`view${panel === 'done' ? ' active' : ''}`} id="view-done">
          <div style={{ padding: '0 20px' }}>
            <div className="done-view">
              <div className="success-check">✓</div>
              <h3 className="done-title">Published!</h3>
              <div style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="btn primary full-width"
                  onClick={() => {
                    nav('home');
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={`view${panel === 'my-market' ? ' active' : ''}`} id="view-my-market">
          <div className="main-header">
            <h2>My market</h2>
            <button
              type="button"
              className="btn small"
              onClick={() => setMarketMenuOpen(true)}
            >
              Switch
            </button>
          </div>
          <div className="market-view-body">
            <p className="market-lede">
              Your listings and estimated earnings from secondary trading.
            </p>
            <div className="earnings-card">
              <div className="section-title" style={{ marginBottom: 6 }}>
                My earnings
              </div>
              <div className="earnings-row">
                <span className="earnings-label">Lifetime (est.)</span>
                <span className="earnings-value">
                  {(
                    MOCK_MY_NFTS.reduce((a, n) => a + n.volumeSol, 0) * 0.12
                  ).toFixed(2)}{' '}
                  <span className="earnings-unit">SOL</span>
                </span>
              </div>
              <div className="earnings-row muted">
                <span className="earnings-label">Trading volume</span>
                <span className="earnings-value sub">
                  {MOCK_MY_NFTS.reduce((a, n) => a + n.volumeSol, 0).toFixed(1)} SOL across{' '}
                  {MOCK_MY_NFTS.length} NFTs
                </span>
              </div>
            </div>
            <div className="section-title">Your NFTs</div>
            <div className="nft-list">
              {MOCK_MY_NFTS.map((nft) => (
                <article key={nft.id} className="nft-card nft-card-my">
                  <div className="nft-card-visual">
                    <img
                      src={nft.imageUrl}
                      alt={nft.caption}
                      className="nft-card-img"
                      loading="lazy"
                    />
                    <div className="nft-card-hover" role="note">
                      <span className="nft-card-hover-title">Activity</span>
                      <p className="nft-card-hover-text">{nft.activitySummary}</p>
                    </div>
                  </div>
                  <div className="nft-card-body">
                    <p className="nft-card-caption">{nft.caption}</p>
                    <div className="nft-card-metrics">
                      <span>
                        <strong>{nft.buyers}</strong> buyers
                      </span>
                      <span>
                        <strong>{nft.sellers}</strong> sellers
                      </span>
                      <span className="nft-metric-vol">{nft.volumeSol.toFixed(1)} SOL vol.</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>

        <div className={`view${panel === 'market-browse' ? ' active' : ''}`} id="view-market-browse">
          <div className="main-header">
            <h2>Market</h2>
            <button
              type="button"
              className="btn small"
              onClick={() => setMarketMenuOpen(true)}
            >
              Switch
            </button>
          </div>
          <div className="market-view-body">
            <p className="market-lede">
              NFTs from other creators. Hover an image for an activity summary.
            </p>
            <div className="nft-list">
              {MOCK_MARKET_NFTS.map((nft) => (
                <article key={nft.id} className="nft-card nft-card-browse">
                  <div className="nft-card-visual">
                    <img
                      src={nft.imageUrl}
                      alt={nft.caption}
                      className="nft-card-img"
                      loading="lazy"
                    />
                    <div className="nft-card-hover" role="note">
                      <span className="nft-card-hover-title">Activity</span>
                      <p className="nft-card-hover-text">{nft.activitySummary}</p>
                    </div>
                  </div>
                  <div className="nft-card-body">
                    <div className="nft-card-creator">{nft.creator}</div>
                    <p className="nft-card-caption">{nft.caption}</p>
                    <div className="nft-card-metrics browse">
                      <span>
                        <strong>{nft.buyers}</strong> buyers
                      </span>
                      <span>
                        <strong>{nft.sellers}</strong> sellers
                      </span>
                      <span>
                        <strong>{nft.impressions.toLocaleString()}</strong> impressions
                      </span>
                    </div>
                    <div className="nft-card-actions">
                      <button type="button" className="btn small primary">
                        Buy
                      </button>
                      <button type="button" className="btn small">
                        Sell
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>

    </>
  );
}
