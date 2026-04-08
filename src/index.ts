import {
  ModelType,
  type IAgentRuntime,
  type Memory,
  type Plugin,
  type Route,
} from "@elizaos/core";

type ZeremActivityPayload = {
  collectedAt: string;
  totalEntries: number;
  domains: string[];
  data: Record<
    string,
    Array<{ url: string; title: string; duration: number; ts: number }>
  >;
};

type ZeremGenerateResponse = {
  summary: string;
  tweets: Array<{
    text: string;
  }>;
};

type ZeremPublishRequest = {
  text: string;
  listToMarket?: boolean;
};

function buildGeneratePrompt(payload: ZeremActivityPayload): string {
  return [
    "You are Zerem. Given browsing activity JSON, produce JSON ONLY.",
    "",
    "Return exactly:",
    '{ "summary": string, "tweets": [{ "text": string }] }',
    "",
    "Rules:",
    "- 4-6 sentence summary.",
    "- 3-5 tweets.",
    "- First-person voice: 'I explored X, found Y, now I think Z.'",
    "- No hashtags. Max 500 chars each.",
    "",
    "Activity payload:",
    JSON.stringify(payload),
  ].join("\n");
}

function parseModelJson(text: string): unknown | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first < 0 || last <= first) return null;
    try {
      return JSON.parse(cleaned.slice(first, last + 1));
    } catch {
      return null;
    }
  }
}

function normalizeGenerateResponse(parsed: unknown): ZeremGenerateResponse {
  if (!parsed || typeof parsed !== "object") {
    return { summary: "", tweets: [] };
  }

  const obj = parsed as { summary?: unknown; tweets?: unknown };
  const summary = typeof obj.summary === "string" ? obj.summary : "";
  const tweetsRaw = Array.isArray(obj.tweets) ? obj.tweets : [];

  const tweets = tweetsRaw
    .map((tweet) => {
      if (typeof tweet === "string") {
        return { text: tweet.trim() };
      }
      if (!tweet || typeof tweet !== "object") return null;
      const t = tweet as { text?: unknown };
      if (typeof t.text !== "string" || !t.text.trim()) return null;
      return { text: t.text.trim() };
    })
    .filter(Boolean) as Array<{ text: string }>;

  return { summary, tweets };
}

async function generateTweets(
  runtime: IAgentRuntime,
  payload: ZeremActivityPayload
): Promise<ZeremGenerateResponse> {
  const prompt = buildGeneratePrompt(payload);
  const modelText = await runtime.useModel(ModelType.TEXT_LARGE, { prompt });
  const parsed = parseModelJson(modelText);
  return normalizeGenerateResponse(parsed);
}

function createPublishMemory(runtime: IAgentRuntime, text: string): Memory {
  return {
    id: runtime.createRunId(),
    agentId: runtime.agentId,
    entityId: runtime.agentId,
    roomId: runtime.createRunId(),
    content: { text },
    createdAt: Date.now(),
  } as unknown as Memory;
}

function getAction(
  runtime: IAgentRuntime,
  names: string[]
): { name: string; validate: unknown; handler: unknown } | null {
  const actionList = (
    runtime as unknown as {
      actions?: Array<{ name: string; validate: unknown; handler: unknown }>;
    }
  ).actions;

  if (!Array.isArray(actionList)) return null;

  for (const name of names) {
    const found = actionList.find(
      (action) => String(action.name).toUpperCase() === name.toUpperCase()
    );
    if (found) return found;
  }
  return null;
}

async function runAction(
  runtime: IAgentRuntime,
  names: string[],
  memory: Memory,
  opts?: { optional?: boolean }
) {
  const action = getAction(runtime, names);
  if (!action) {
    if (opts?.optional) return;
    throw new Error(`Missing action: ${names.join(", ")}`);
  }

  const validate = action.validate as (
    rt: IAgentRuntime,
    msg: Memory,
    state?: unknown
  ) => Promise<boolean>;

  const isValid = await validate(runtime, memory, undefined);
  if (!isValid) {
    if (opts?.optional) return;
    throw new Error(`Action validate() failed: ${String(action.name)}`);
  }

  const handler = action.handler as ((
    rt: IAgentRuntime,
    msg: Memory,
    state?: unknown
  ) => Promise<unknown>);
  return handler(runtime, memory, undefined);
}

const zeremRoutes: Route[] = [
  {
    type: "POST",
    path: "/api/zerem/generate",
    public: true,
    handler: async (req, res, runtime) => {
      const payload = req.body as ZeremActivityPayload;
      const result = await generateTweets(runtime, payload);
      res.status(200).json(result);
    },
  },
  {
    type: "POST",
    path: "/api/zerem/publish",
    public: true,
    handler: async (req, res, runtime) => {
      const body = (req.body ?? {}) as Partial<ZeremPublishRequest>;
      const text = body.text?.trim();
      if (!text) {
        res.status(400).json({ error: "Missing text" });
        return;
      }

      const listToMarket = typeof body.listToMarket === "boolean" ? body.listToMarket : false;
      const memory = createPublishMemory(runtime, text);

      await runAction(runtime, ["POST_TWEET", "TWITTER_POST_TWEET"], memory);
      if (listToMarket) {
        await runAction(runtime, ["MINT_TWEET_NFT"], memory, { optional: true });
        await runAction(runtime, ["CREATE_FRACTIONAL_MARKET"], memory, { optional: true });
      }

      res.status(200).json({ ok: true });
    },
  },
];

export const zeremPlugin: Plugin = {
  name: "zerem-plugin",
  description: "Bridge between Zerem extension and agent actions.",
  routes: zeremRoutes,
};

export default zeremPlugin;
