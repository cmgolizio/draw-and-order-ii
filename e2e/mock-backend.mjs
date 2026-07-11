/**
 * Self-contained backend double for the Playwright smoke tests (Phase 8).
 *
 * One in-memory HTTP server impersonating the three services the app talks
 * to, on the endpoints it actually uses:
 *
 *   - Supabase PostgREST  (/rest/v1/...)   suspects, daily_suspects, rounds,
 *                                          profiles + the RPCs
 *   - Supabase Storage    (/storage/v1/...) upload / sign / download
 *   - Supabase Auth       (/auth/v1/...)    always anonymous
 *   - Anthropic API       (/anthropic/v1/messages) canned judge verdict
 *
 * PostgREST semantics implemented just deep enough for supabase-js: `eq.` and
 * `not.is.null` filters, single-object Accept headers (PGRST116 on zero
 * rows), Prefer: count=exact via Content-Range, and 23505 on daily-unique
 * violations — the code path the daily-uniqueness smoke test exists to prove.
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.MOCK_BACKEND_PORT ?? 43117);

// --- fixtures ---------------------------------------------------------------

const SUSPECT_ID = "11111111-2222-4333-8444-555566667777";

const SUSPECT = {
  id: SUSPECT_ID,
  difficulty: "detective",
  statement:
    "He came under the awning light for a second, maybe mid-40s. Long face, " +
    "swept-back hair going gray at the temples. Heavy brows. The nose was " +
    "crooked — bent left, like an old break. Thin mouth. That's what stuck.",
  statement_teaser:
    "Long-faced man, mid-40s, swept-back graying hair, crooked nose.",
  traits: {
    sex: "male",
    age: "mid-40s",
    build: "lean",
    faceShape: "long, narrow jaw",
    hair: "swept back, graying at the temples",
    facialHair: "clean shaven",
    eyebrows: "heavy, straight",
    eyes: "deep set",
    nose: "crooked, bent left from an old break",
    mouth: "thin lipped",
    distinguishingMarks: [{ mark: "small scar", placement: "left eyebrow" }],
    expression: "flat",
    complexion: "weathered",
    accessories: [],
  },
  image_path: "suspects/mock-suspect.png",
  silhouette_path: null,
  status: "live",
  created_at: new Date().toISOString(),
};

const JUDGE_VERDICT = {
  traits: {
    faceShape: 74,
    proportions: 68,
    hairStyle: 71,
    eyebrows: 66,
    eyes: 62,
    nose: 88,
    mouth: 41,
    distinctiveMarks: 70,
  },
  caseReport:
    "The sketch reads like someone who listened: the break in the nose is " +
    "there, and the brows carry the right weight. The mouth drifts soft " +
    "where the file says thin. It would survive a lineup.",
  bestFeature: "nose",
  biggestMiss: "mouth",
};

/** 1x1 gray PNG — stands in for the suspect portrait. */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNsaGj4DwAF" +
    "hAJ/wlseKgAAAABJRU5ErkJggg==",
  "base64",
);

// --- state ------------------------------------------------------------------

/** roundId -> row */
const rounds = new Map();
/** "identity|date" -> roundId (the partial unique index) */
const dailyKeys = new Map();
/** "bucket/path" -> Buffer */
const objects = new Map([[`suspect-images/${SUSPECT.image_path}`, TINY_PNG]]);

const utcToday = () => new Date().toISOString().slice(0, 10);

// --- request plumbing --------------------------------------------------------

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function json(res, status, body, headers = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(data),
    ...headers,
  });
  res.end(data);
}

/** PostgREST-flavored row filtering: eq.<v> and not.is.null only. */
function filterRows(rows, searchParams) {
  const skip = new Set(["select", "limit", "offset", "order", "or", "and"]);
  let result = rows;
  for (const [key, value] of searchParams) {
    if (skip.has(key)) continue;
    if (value.startsWith("eq.")) {
      const wanted = value.slice(3);
      result = result.filter((row) => String(row[key]) === wanted);
    } else if (value === "not.is.null") {
      result = result.filter((row) => row[key] !== null);
    } else if (value === "is.null") {
      result = result.filter((row) => row[key] === null);
    }
  }
  const limit = searchParams.get("limit");
  return limit ? result.slice(0, Number(limit)) : result;
}

/** Honors the single-object Accept contract (.single()/.maybeSingle()). */
function respondRows(req, res, rows) {
  const wantsObject = (req.headers.accept ?? "").includes(
    "vnd.pgrst.object+json",
  );
  if (!wantsObject) {
    return json(res, 200, rows, { "content-range": `0-${rows.length}/*` });
  }
  if (rows.length === 1) return json(res, 200, rows[0]);
  return json(res, 406, {
    code: "PGRST116",
    message: "JSON object requested, multiple (or no) rows returned",
    details: `Results contain ${rows.length} rows`,
    hint: null,
  });
}

function tableRows(table) {
  if (table === "suspects") return [SUSPECT];
  if (table === "daily_suspects") {
    return [{ date: utcToday(), suspect_id: SUSPECT_ID }];
  }
  if (table === "rounds") return [...rounds.values()];
  if (table === "profiles") return [];
  if (table === "claimed_anon_ids") return [];
  return [];
}

// --- route handlers ----------------------------------------------------------

async function handleRest(req, res, url) {
  const [, , , resource, rpcName] = url.pathname.split("/"); // /rest/v1/<resource>[/<fn>]

  if (resource === "rpc") {
    const canned = {
      rate_limit_hit: true,
      rate_limit_gc: null,
      daily_leaderboard: [],
      user_stats: [],
      claim_anon_rounds: {
        status: "claimed",
        claimed: 0,
        dropped_drawings: [],
      },
    };
    if (rpcName in canned) return json(res, 200, canned[rpcName]);
    return json(res, 404, { message: `unknown rpc ${rpcName}` });
  }

  if (req.method === "HEAD") {
    const matched = filterRows(tableRows(resource), url.searchParams);
    res.writeHead(200, {
      "content-range": `0-${matched.length}/${matched.length}`,
    });
    return res.end();
  }

  if (req.method === "GET") {
    return respondRows(
      req,
      res,
      filterRows(tableRows(resource), url.searchParams),
    );
  }

  if (req.method === "POST" && resource === "rounds") {
    const parsed = JSON.parse((await readBody(req)).toString());
    const values = Array.isArray(parsed) ? parsed[0] : parsed;
    if (values.mode === "daily") {
      const identity = values.user_id ?? values.anon_id;
      const key = `${identity}|${values.daily_date}`;
      if (dailyKeys.has(key)) {
        return json(res, 409, {
          code: "23505",
          message:
            'duplicate key value violates unique constraint "rounds_one_daily_per_identity"',
          details: null,
          hint: null,
        });
      }
    }
    const row = {
      id: randomUUID(),
      user_id: null,
      anon_id: null,
      mode: "practice",
      daily_date: null,
      drawing_path: null,
      stroke_data: null,
      final_score: null,
      score_breakdown: null,
      duration_seconds: null,
      revealed: false,
      created_at: new Date().toISOString(),
      suspect_id: SUSPECT_ID,
      ...values,
    };
    rounds.set(row.id, row);
    if (row.mode === "daily") {
      dailyKeys.set(`${row.user_id ?? row.anon_id}|${row.daily_date}`, row.id);
    }
    return respondRows(req, res, [row]);
  }

  if (req.method === "PATCH" && resource === "rounds") {
    const values = JSON.parse((await readBody(req)).toString());
    const matched = filterRows(tableRows("rounds"), url.searchParams);
    for (const row of matched) Object.assign(row, values);
    res.writeHead(204);
    return res.end();
  }

  return json(res, 404, {
    message: `no mock for ${req.method} ${url.pathname}`,
  });
}

async function handleStorage(req, res, url) {
  // /storage/v1/object[/sign]/<bucket>/<path...>
  const parts = url.pathname.split("/").filter(Boolean).slice(2); // after storage/v1 -> ["object", ...]
  const signed = parts[1] === "sign";
  const key = parts.slice(signed ? 2 : 1).join("/");

  if (req.method === "POST" && signed) {
    return json(res, 200, { signedURL: `/object/sign/${key}?token=mock` });
  }
  if ((req.method === "POST" || req.method === "PUT") && !signed) {
    objects.set(key, await readBody(req));
    return json(res, 200, { Key: key, Id: randomUUID() });
  }
  if (req.method === "GET") {
    const body = objects.get(key);
    if (!body) return json(res, 404, { message: `no object ${key}` });
    res.writeHead(200, {
      "content-type": "image/png",
      "content-length": body.length,
    });
    return res.end(body);
  }
  return json(res, 404, {
    message: `no mock for ${req.method} ${url.pathname}`,
  });
}

async function handleAnthropic(req, res) {
  await readBody(req); // drain
  return json(res, 200, {
    id: `msg_${randomUUID().slice(0, 8)}`,
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    content: [{ type: "text", text: JSON.stringify(JUDGE_VERDICT) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 4200, output_tokens: 310 },
  });
}

// --- server ------------------------------------------------------------------

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  try {
    if (url.pathname.startsWith("/rest/v1/"))
      return await handleRest(req, res, url);
    if (url.pathname.startsWith("/storage/v1/"))
      return await handleStorage(req, res, url);
    if (url.pathname.startsWith("/anthropic/"))
      return await handleAnthropic(req, res);
    if (url.pathname.startsWith("/auth/v1/")) {
      return json(res, 401, { message: "no session" });
    }
    if (url.pathname === "/health") return json(res, 200, { ok: true });
    return json(res, 404, { message: `no mock for ${url.pathname}` });
  } catch (error) {
    console.error("[mock-backend]", error);
    return json(res, 500, { message: String(error) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-backend] listening on http://127.0.0.1:${PORT}`);
});
