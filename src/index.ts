import {
  ModelType,
  type Character,
  type IAgentRuntime,
  type Memory,
  type Plugin,
  type Project,
  type Route,
} from "@elizaos/core";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

const LOG_PREFIX = "[ZEREM:PLUGIN]";

function logInfo(event: string, meta?: Record<string, unknown>) {
  if (meta) {
    console.log(`${LOG_PREFIX} ${event}`, meta);
    return;
  }
  console.log(`${LOG_PREFIX} ${event}`);
}

function logError(event: string, error: unknown, meta?: Record<string, unknown>) {
  const message =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { error };
  console.error(`${LOG_PREFIX} ${event}`, {
    ...(meta ?? {}),
    ...message,
  });
}

function summarizeGeneratePayload(payload: ZeremActivityPayload) {
  return {
    collectedAt: payload?.collectedAt ?? null,
    totalEntries: payload?.totalEntries ?? 0,
    domainsCount: Array.isArray(payload?.domains) ? payload.domains.length : 0,
    domainsSample: Array.isArray(payload?.domains)
      ? payload.domains.slice(0, 5)
      : [],
    dataKeysCount:
      payload?.data && typeof payload.data === "object"
        ? Object.keys(payload.data).length
        : 0,
  };
}

function previewText(text: string, max = 120) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max)}...`;
}

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
    "- First-person voice, but vary structure and sentence rhythm across tweets.",
    "- Make tweets longer and richer: target about 180-280 characters when possible.",
    "- Do NOT force the same ending pattern on every tweet.",
    "- A conclusion is optional. Mix styles: some tweets can just report what you researched.",
    "- If a tweet has a conclusion, make it a concrete learning/insight from the activity.",
    "- Avoid generic endings like 'now I think' without a specific takeaway.",
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
  logInfo("run_action.start", { names, optional: Boolean(opts?.optional) });
  const action = getAction(runtime, names);
  if (!action) {
    logInfo("run_action.missing", { names, optional: Boolean(opts?.optional) });
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
    logInfo("run_action.validate_failed", {
      action: String(action.name),
      optional: Boolean(opts?.optional),
    });
    if (opts?.optional) return;
    throw new Error(`Action validate() failed: ${String(action.name)}`);
  }

  const handler = action.handler as ((
    rt: IAgentRuntime,
    msg: Memory,
    state?: unknown
  ) => Promise<unknown>);
  const output = await handler(runtime, memory, undefined);
  logInfo("run_action.success", { action: String(action.name) });
  return output;
}

const zeremRoutes: Route[] = [
  {
    type: "POST",
    path: "/api/zerem/generate",
    public: true,
    handler: async (req, res, runtime) => {
      const startedAt = Date.now();
      const payload = req.body as ZeremActivityPayload;
      logInfo("generate.request_received", summarizeGeneratePayload(payload));
      try {
        const result = await generateTweets(runtime, payload);
        logInfo("generate.success", {
          elapsedMs: Date.now() - startedAt,
          summaryLength: result.summary.length,
          tweetsCount: result.tweets.length,
        });
        res.status(200).json(result);
      } catch (error) {
        logError("generate.failed", error, {
          elapsedMs: Date.now() - startedAt,
        });
        res.status(500).json({ error: "Failed to generate tweets" });
      }
    },
  },
  {
    type: "POST",
    path: "/api/zerem/publish",
    public: true,
    handler: async (req, res, runtime) => {
      const startedAt = Date.now();
      const body = (req.body ?? {}) as Partial<ZeremPublishRequest>;
      const text = body.text?.trim();
      const listToMarket =
        typeof body.listToMarket === "boolean" ? body.listToMarket : false;
      logInfo("publish.request_received", {
        hasText: Boolean(text),
        textPreview: text ? previewText(text) : "",
        textLength: text?.length ?? 0,
        listToMarket,
      });
      if (!text) {
        logInfo("publish.bad_request_missing_text");
        res.status(400).json({ error: "Missing text" });
        return;
      }

      const memory = createPublishMemory(runtime, text);
      try {
        await runAction(runtime, ["POST_TWEET", "TWITTER_POST_TWEET"], memory);
        if (listToMarket) {
          await runAction(runtime, ["MINT_TWEET_NFT"], memory, {
            optional: true,
          });
          await runAction(runtime, ["CREATE_FRACTIONAL_MARKET"], memory, {
            optional: true,
          });
        }
        logInfo("publish.success", { elapsedMs: Date.now() - startedAt });
        res.status(200).json({ ok: true });
      } catch (error) {
        logError("publish.failed", error, { elapsedMs: Date.now() - startedAt });
        res.status(500).json({ error: "Failed to publish tweet" });
      }
    },
  },
];

const zeremPlugin: Plugin = {
  name: "zerem-plugin",
  description: "Bridge between Zerem extension and agent actions.",
  routes: zeremRoutes
};

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);
const characterPath = resolve(currentDir, "../characters/agent.character.json");
const zeremCharacter = JSON.parse(
  readFileSync(characterPath, "utf-8")
) as Character;

const zeremProject: Project = {
  agents: [
    {
      character: zeremCharacter,
      plugins: [zeremPlugin],
    },
  ],
};

export default zeremProject;