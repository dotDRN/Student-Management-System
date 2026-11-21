import crypto from "node:crypto";
import { GoogleGenAI, Type, type FunctionDeclaration } from "@google/genai";

export type AiProviderMode = "gemini" | "deterministic-synthesizer";

export interface LlmToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "OBJECT";
    properties: Record<
      string,
      {
        type: "STRING" | "NUMBER" | "BOOLEAN" | "ARRAY";
        description: string;
        enum?: string[];
        items?: { type: "STRING" };
      }
    >;
    required?: string[];
  };
}

export interface LlmChatMessage {
  role: "user" | "model";
  text: string;
}

export interface LlmOrchestrationStepResult {
  mode: AiProviderMode;
  text: string;
  toolCalls: LlmToolCall[];
}

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const DEFAULT_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004";

// Bounded in-memory embedding cache to avoid re-embedding identical chunks
const embeddingCache = new Map<string, number[]>();
const MAX_EMBEDDING_CACHE = 800;

export function getAiProviderStatus(): {
  mode: AiProviderMode;
  model: string;
  embeddingModel: string;
  hasApiKey: boolean;
} {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  const hasApiKey = Boolean(apiKey && apiKey !== "your_gemini_api_key_here");
  return {
    mode: hasApiKey ? "gemini" : "deterministic-synthesizer",
    model: hasApiKey ? DEFAULT_MODEL : "edbase-deterministic-v1",
    embeddingModel: hasApiKey ? DEFAULT_EMBEDDING_MODEL : "hybrid-bm25-lexical",
    hasApiKey,
  };
}

function getGenAiClient(): GoogleGenAI | null {
  const status = getAiProviderStatus();
  if (!status.hasApiKey) return null;
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!.trim() });
}

function toGeminiType(t: "STRING" | "NUMBER" | "BOOLEAN" | "ARRAY" | "OBJECT"): Type {
  switch (t) {
    case "STRING":
      return Type.STRING;
    case "NUMBER":
      return Type.NUMBER;
    case "BOOLEAN":
      return Type.BOOLEAN;
    case "ARRAY":
      return Type.ARRAY;
    default:
      return Type.OBJECT;
  }
}

function convertToolDefinitions(tools: LlmToolDefinition[]): FunctionDeclaration[] {
  return tools.map((tool) => {
    const props: Record<string, any> = {};
    for (const [k, def] of Object.entries(tool.parameters.properties)) {
      props[k] = {
        type: toGeminiType(def.type),
        description: def.description,
        ...(def.enum ? { enum: def.enum } : {}),
        ...(def.items ? { items: { type: toGeminiType(def.items.type) } } : {}),
      };
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: Type.OBJECT,
        properties: props,
        ...(tool.parameters.required?.length ? { required: tool.parameters.required } : {}),
      },
    };
  });
}

/**
 * Computes a vector embedding via Gemini text-embedding-004 (cached by content hash).
 * Returns null if Gemini API is unavailable so callers gracefully use lexical hybrid scoring.
 */
export async function generateTextEmbedding(text: string): Promise<number[] | null> {
  const normalized = text.trim().slice(0, 2000);
  if (!normalized) return null;

  const hash = crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 24);
  const cached = embeddingCache.get(hash);
  if (cached) return cached;

  const client = getGenAiClient();
  if (!client) return null;

  try {
    const response = await client.models.embedContent({
      model: DEFAULT_EMBEDDING_MODEL,
      contents: normalized,
    });
    const values = response.embeddings?.[0]?.values;
    if (Array.isArray(values) && values.length > 0) {
      if (embeddingCache.size >= MAX_EMBEDDING_CACHE) {
        const firstKey = embeddingCache.keys().next().value;
        if (firstKey) embeddingCache.delete(firstKey);
      }
      embeddingCache.set(hash, values);
      return values;
    }
    return null;
  } catch (err) {
    console.warn("[AI Provider] Embedding call failed, falling back to lexical RAG:", (err as Error).message);
    return null;
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Runs a single Gemini ReAct turn with native function-calling support.
 * Returns null when Gemini is not configured or errors out, allowing the orchestrator
 * to seamlessly use its deterministic domain synthesizer.
 */
export async function runGeminiToolTurn(params: {
  systemInstruction: string;
  contents: Array<Record<string, unknown>>;
  tools: LlmToolDefinition[];
  temperature?: number;
}): Promise<{
  text: string;
  functionCalls: LlmToolCall[];
  modelContent?: Record<string, unknown>;
} | null> {
  const client = getGenAiClient();
  if (!client) return null;

  try {
    const response = await client.models.generateContent({
      model: DEFAULT_MODEL,
      contents: params.contents as any,
      config: {
        systemInstruction: params.systemInstruction,
        temperature: params.temperature ?? 0.25,
        tools: [{ functionDeclarations: convertToolDefinitions(params.tools) }],
      },
    });

    const rawCalls = response.functionCalls ?? [];
    const functionCalls: LlmToolCall[] = rawCalls
      .filter((fc): fc is { name: string; args?: Record<string, unknown> } => Boolean(fc.name))
      .map((fc) => ({
        name: fc.name,
        args: (fc.args && typeof fc.args === "object" ? fc.args : {}) as Record<string, unknown>,
      }));

    const candidateContent = response.candidates?.[0]?.content as Record<string, unknown> | undefined;

    return {
      text: (response.text || "").trim(),
      functionCalls,
      modelContent: candidateContent,
    };
  } catch (err) {
    console.warn("[AI Provider] Gemini tool turn failed, falling back:", (err as Error).message);
    return null;
  }
}

/**
 * Requests a strict JSON payload from Gemini for structured workflows
 * (360° Student Briefings, Career Upskilling Playbooks).
 */
export async function generateGeminiStructuredJson<T>(params: {
  systemInstruction: string;
  prompt: string;
  temperature?: number;
}): Promise<T | null> {
  const client = getGenAiClient();
  if (!client) return null;

  try {
    const response = await client.models.generateContent({
      model: DEFAULT_MODEL,
      contents: params.prompt,
      config: {
        systemInstruction: params.systemInstruction,
        temperature: params.temperature ?? 0.3,
        responseMimeType: "application/json",
      },
    });

    const rawText = (response.text || "").trim();
    if (!rawText) return null;

    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    return JSON.parse(cleaned) as T;
  } catch (err) {
    console.warn("[AI Provider] Gemini JSON generation failed, using deterministic fallback:", (err as Error).message);
    return null;
  }
}
