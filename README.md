# Zerem

**Your browsing history, turned into tweets. Your best tweets, turned into tradeable assets.**

Zerem is a content pipeline for creators who spend hours researching, reading, and exploring the web but never get around to posting about it. It watches what you browse, distills it into insights, and generates ready-to-publish tweets. Then it goes further: every tweet can be minted as an NFT and listed on a Zerem-specific NFT-based prediction market where your audience bets on whether your content will perform.

---

## The Problem

You spend two hours deep-diving into a topic. You close 30 tabs. You walk away with nothing to show for it. The research happened. The insights formed. But turning that into content? That's a separate job nobody wants to do.

And even when you do post, your audience has no way to back your content with real stakes.

## How Zerem Solves It

A Chrome extension tracks the time you spend on pages and what you read — not keystrokes, not passwords, not private data. It knows you spent 45 minutes reading about Firedancer because that matters more than a tab you opened for 10 seconds. Provable privacy is coming soon. An AI agent takes that browsing signal, researches anything it doesn't recognize, and generates tweets that sound like you narrating your own rabbit hole.

No hashtags. No AI voice. No generic takes. Just your browsing patterns translated into first-person content.

```
Chrome Extension  →  AI Agent  →  Twitter + NFT Mint  →  Tweet Market
   (tracks)         (generates)    (publishes)            (trades)
```

## The Tweet Market

Every published tweet can become a tradeable prediction market.

**Creators** publish a tweet, mint it as an NFT, and list it. This creates a fractional market around the tweet's performance. You're not just posting — you're creating a financial instrument backed by your ideas.

**Buyers** purchase fractional shares because they believe the tweet will perform. Their bet grows as the tweet gains traction. This is the whole point of the NFT — buyers are financially motivated to push views, reshare, quote, and drive engagement toward the tweet because that's what triggers the reward payout from X's creator revenue program. When the reward comes in, buyers get reimbursed proportionally to their shares. The more they amplify, the more they earn.

This introduces a new distribution mechanic for creators. Instead of relying on algorithms alone, your audience has a financial reason to push your content. Distribution becomes a shared incentive, not a solo grind.

**Sellers** take the opposite position. They short the tweet, betting it won't hit reward thresholds. If they're right, they keep their premium. If they're wrong and the tweet earns rewards, their staked share gets absorbed by the buyers.

### How It Resolves

- **Tweet earns rewards** → Buyers win. Sellers' stakes get absorbed and redistributed to buyers.
- **Tweet underperforms** → Sellers win. Buyers' shares lose value.

### The Flywheel

```
Creator browses & researches
        ↓
Zerem generates tweets from real activity
        ↓
Tweet is minted as NFT → listed on market
        ↓
Audience buys shares (betting on performance)
        ↓
Buyers amplify the tweet to drive rewards
        ↓
Tweet earns rewards → distributed to shareholders
        ↓
Creator builds reputation → next market has more demand
```

## Personality

Zerem is not a chatbot. It's a non-conversational content engine with a specific voice:

- **Content-agnostic** — writes about whatever you actually browsed. Cooking, coding, music, history, finance.
- **First-person narration** — *"I explored X, found Y, now I think Z."*
- **Research-driven** — searches the web for unfamiliar domains before generating. Never guesses.
- **Signal-aware** — 20+ minutes on a domain means deep engagement. Cross-platform same-topic means deep research.
- **No AI voice** — no hashtags, no forced emojis, no generic filler.

## Tech Stack

- **Runtime**: [ElizaOS](https://github.com/elizaos/eliza) — agent framework with plugin architecture
- **LLM**: Anthropic Claude or OpenAI
- **Extension**: Chrome MV3, React, Vite
- **Auth**: [Dynamic](https://www.dynamic.xyz/) — wallet-based authentication
- **Market**: On-chain NFT minting and fractional prediction markets

## License

MIT
