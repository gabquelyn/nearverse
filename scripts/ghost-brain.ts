// Lets a ghost trader ask a NEAR AI model what to do next. Every failure falls back to the caller's rules, so the market keeps moving.
export interface Option { id: string; label: string }
export interface Decision { id: string; reason: string }

const URL_ = process.env.NEAR_AI_URL || "https://cloud-api.near.ai/v1/chat/completions";
const MODEL = process.env.NEAR_AI_MODEL || "openai/gpt-5-nano";
const CAP = Number(process.env.NEAR_AI_DAILY_CALLS || 6000);
const TIMEOUT_MS = 8000;
let day = "", calls = 0, warned = "";

const note = (why: string) => { if (why !== warned) { warned = why; console.log(`AI trader: ${why}. Using the rules for now.`); } };

/** Picks one of the options, or returns null so the rules decide. */
export async function decide(name: string, situation: string, options: Option[], key = process.env.NEAR_AI_API_KEY): Promise<Decision | null> {
  if (!key || options.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; calls = 0; }
  if (calls >= CAP) { note("the daily limit is reached"); return null; }
  calls++;
  try {
    const res = await fetch(URL_, {
      method: "POST", signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL, max_tokens: 80, temperature: 0.6,
        messages: [
          { role: "system", content: 'You are a trader in a game economy. Make money: sell where the pay is best, and fetch what is valuable. Reply with only JSON: {"id":"<option id>","reason":"<under 12 words>"}' },
          { role: "user", content: `You are ${name}. ${situation}\nOptions:\n${options.map((o) => `${o.id}: ${o.label}`).join("\n")}` },
        ],
      }),
    });
    if (!res.ok) { note(`the model answered ${res.status}`); return null; }
    const body = await res.json() as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content ?? "", json = text.match(/\{[\s\S]*\}/)?.[0];
    const out = json ? JSON.parse(json) as Partial<Decision> : null;
    if (!out || !options.some((o) => o.id === out.id)) { note("the model gave an answer that isn't an option"); return null; }
    warned = "";
    return { id: out.id as string, reason: String(out.reason ?? "").replace(/[^\p{L}\p{N} .,%'-]/gu, "").slice(0, 90) };
  } catch (e) { note((e as Error).name === "TimeoutError" ? "the model took too long" : "the model couldn't be reached"); return null; }
}
