# QA Report — DeckSift commercial-readiness review

**Date:** 2026-08-08 · **Reviewer:** QA agent · **Scope:** all uncommitted work in the working tree (Items 63–64, test suite, retry/logger wiring, CI tests job, `RESEARCH_MARKET.md`). Firmware deliberately not reviewed.

---

## 1. Verdict summary

**APPROVE — with minor hardening follow-ups before commercial deployment.**

- All four verification commands pass from `C:\Mault Revised\mault`: `pnpm test` (11 files / 94 tests green), `pnpm typecheck` (fresh, cache-bypassed), `pnpm lint` (fresh), `pnpm build` (server forced; web cached-hit then re-verified).
- Runtime smoke tests pass: `/api/health` → 200, and `/api/admin/sync/sources` → 200 with all **11** sync sources.
- **No Critical or High findings.** The implementation agent's work is correct, well-scoped, and the tests are genuinely meaningful (verified against the source they cover).
- Two **Medium** hardening edges in the new `fetchWithRetry` wiring (abort budget vs. backoff sleeps; retry added to calls that have no timeout at all). Both are edge cases, not current-path bugs.
- **Verification caveat:** the API currently running on 3001 predates the server changes (process uptime ~18.7 h; `server.log` contains zero JSON log lines). The smoke test validates the environment and routes, but the new retry/logger code is *not* live on that process — it is covered instead by the unit tests, forced typecheck, and forced server build. The API should be restarted once to load the new code (I did not restart it, per instructions).

---

## 2. Verification matrix

All commands run from `C:\Mault Revised\mault` (Node v22.23.2, pnpm 9.1.3 — matches CI).

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm test` | ✅ PASS — 11 files, 94/94 tests, 808 ms | vitest 4.1.10; shared + server suites |
| `pnpm typecheck` | ✅ PASS (3/3 packages) | First run was a turbo cache-hit; re-ran `pnpm exec turbo typecheck --force` — cache-miss, all three packages (incl. new `*.test.ts` files) typecheck clean |
| `pnpm lint` | ✅ PASS | web-only (server/shared define no lint script); re-ran `pnpm exec turbo lint --force` |
| `pnpm build` | ✅ PASS (server + web) | Server re-built forced (`turbo build --filter=@magic-vault/server --force`); bundle verified to contain the new code (`Health check failed`, `retry-after`, `DATABASE_URL` strings present in `dist/index.js`) |
| `pnpm install --frozen-lockfile` | ✅ PASS | Lockfile consistent — the CI `tests` job's install step will not fail |
| `curl http://localhost:3001/api/health` | ✅ `{"success":true,"status":"ok",...}` HTTP 200 | uptime 67318 s |
| `curl http://localhost:3001/api/admin/sync/sources` | ✅ HTTP 200, 11 sources | mtg, gundam, pokemon, yugioh, digimon, lorcana, onepiece, starwars, unionarena, fab, pokemonpocket |
| Editor diagnostics | ✅ No errors/warnings on any changed TS file | Only pre-existing warnings in `web/src/app/routes/landing/hero.tsx`, `web/src/index.css`; firmware errors ignored (out of scope) |

---

## 3. Findings by severity

### Critical
None.

### High
None.

### Medium

**M1 — Caller's abort budget does not cover inter-attempt backoff sleeps**
`packages/server/src/lib/retry.ts:57-58, 66` (with docstring claim at lines 7–9)

The header comment says "The caller still owns the overall budget: pass a pre-created `signal`… an AbortError aborts the whole call." That is only true for the `fetch` calls themselves — the `sleep()` between attempts is a plain `setTimeout` that is **not** abort-aware. In `art-cache.ts:73`, `fetchWithRetry(url, { signal: AbortSignal.timeout(30_000) })` can therefore stall well beyond 30 s: e.g. a 429 with `Retry-After: 60` → `retryAfterDelayMs` returns 60 000 ms → `sleep(60s)`; the timeout fires at 30 s but nothing is awaiting the signal; the next fetch attempt then rejects with an AbortError. Result: a 60 s+ stall on the image-proxy path where the caller expected a hard 30 s cap, and the failure surfaces as an AbortError instead of the intended error type.

Suggested fix: make the sleep abortable (e.g. `AbortSignal.any([init.signal, AbortSignal.timeout(...)])` into an abortable sleep), or cap `retryAfterDelayMs` at a sane maximum (e.g. `Math.min(seconds, 30) * 1000`), and fix the docstring.

**M2 — Retry added to external calls that have no timeout at all**
`packages/server/src/lib/scryfall/search.ts:26, 57`; `packages/server/src/lib/card-search/generic.ts:189, 196, 209, 237`

The art-cache call site got a 30 s `AbortSignal.timeout`; the Scryfall and generic-adapter sites did not (they were bare `fetch` before, and remain bare now — no regression in that respect). But the new retry semantics multiply the stall: a hung upstream (undici has no whole-request default timeout) previously stalled once; it now stalls 3× plus backoff before failing. For a "live shop counter" deployment this is the wrong tradeoff on the search path.

Suggested fix: pass `signal: AbortSignal.timeout(...)` (e.g. 10–15 s for search, longer for bulk) at these call sites, or add a default timeout inside `fetchWithRetry` when `init.signal` is absent.

### Low

**L1 — `JSON.stringify` can throw on circular `details`, masking the original error**
`packages/server/src/lib/logger.ts:23`

`write()` calls `JSON.stringify(entry)` unguarded. All current call sites pass `Error` instances or strings (serialized by `serialize`), so this is latent — but the logger is invoked from `app.onError`, `uncaughtException`, and `unhandledRejection`. If any future call site logs a circular object (a request/context object is the classic case), the stringify throw replaces the original error: the log line is lost and, inside the error handlers, the new exception propagates (in `unhandledRejection` it re-enters `uncaughtException` → second throw → crash without the intended exit path).

Suggested fix: wrap `JSON.stringify` in try/catch and fall back to `String(details)` / a `<unserializable>` marker.

**L2 — Mixed log formats: two `lib/` files still use `console.error`**
`packages/server/src/lib/art-cache.ts:49`; `packages/server/src/lib/sync-cache.ts:54`

`index.ts` now emits one JSON line per event, but `saveArtToCache` and `saveCachedCatalog` still write multi-line `console.error` stacks. The same process therefore interleaves JSON and non-JSON lines in `server.log`, undercutting Item 64's stated goal ("server.log is greppable/tailable by ops tooling"). Pre-existing code, but `art-cache.ts` was touched by this change anyway.

Suggested fix: migrate both to `logger.error` (the failure paths already receive an `err`).

### Nit

**N1 — Capacity tests recompute the implementation formula**
`packages/shared/src/constants/sort-bins.constant.test.ts:13-25`

`expect(computeBinCapacity(1)).toBe(Math.floor((155 / CARD_THICKNESS_MM) * 0.9))` mirrors the implementation, so a change to `CARD_THICKNESS_MM` (0.3 → 0.35) or `BIN_HEADROOM_FACTOR` would pass unnoticed; only the hardcoded heights are pinned. Suggest asserting known-good literals (bin 1 = 465, bin 7 = 180) alongside the existing property test ("never exceeds headroom"), which is the strongest test in the file.

**N2 — retry tests don't pin backoff timing and miss two branches**
`packages/server/src/lib/retry.test.ts`

Attempt counts are asserted, but no test verifies the sleep durations (a regression that always slept 0 ms would still pass given `advanceTimersByTimeAsync(10_000)`); no test for `retries: 1` (single attempt, no retry); no test for a non-numeric `Retry-After` (HTTP-date) falling back to backoff. The "never retries caller-initiated aborts" test is meaningful for the retry loop, but the mock rejects with a hand-built AbortError, so it would not catch a broken *signal-based* abort path.

**N3 — `vitest` devDependency duplicated at root + shared + server**
`package.json`, `packages/shared/package.json`, `packages/server/package.json`

Only the root copy is used (tests run from root via `vitest run`). Harmless and arguably good for package self-containment (each package's `tsc --noEmit` resolves `vitest` types without relying on hoisting), but worth a one-line comment in the config if intentional, since the current `vitest.config.ts` comment implies root-only ("single test runner for the whole monorepo").

---

## 4. Test-quality assessment

**Overall: good.** I read every test file against the source it covers. The suite is meaningful — spot checks below; I also mentally "mutation-tested" the main behaviors (would the test fail if the code broke?).

- **`evaluate-bin.test.ts` (22 tests) — strong.** Would catch: broken array-equality, missing numeric coercion (string "12.50" → 12.50), wrong catch-all fallback, first-match-wins ordering, empty-group handling, `contains_any/all/none` logic, and nested-group evaluation. The `card()`/`bin()`/`condition()` helpers make each case read as a spec. No vacuous assertions found.
- **`retry.test.ts` (8 tests) — strong on the retry/no-retry decision.** Would catch: retrying 404s, retrying aborts, not retrying 500s, ignoring `Retry-After`, giving up too early/late. Gaps are N2 above (timing not asserted, two branches untested).
- **`card-search/cache.test.ts` (6 tests) — strong.** Would catch: no caching, no in-flight dedupe, caching failures, never expiring, and query normalization ("  Sol Ring " ≡ "sol ring") — the last is a nice behavior-level assertion, not just a mock-count check.
- **`scryfall/search.test.ts` (7 tests) — strong.** Would catch: URL-encoding, missing `unique=prints`, 404 → friendly message, 5xx retried 3× (asserts `fetchMock` call count under fake timers), query-min-length short-circuit. `SearchById` 404 message asserts both status and id.
- **`art-cache.test.ts` (7 tests) — good.** Disk round-trip, cross-URL isolation, in-flight dedupe, and both failure modes (500 after retries; non-image content-type). Correctly hoists `ART_CACHE_DIR` *before* the module import and cleans up in `afterAll` — the right pattern.
- **`generic.test.ts` (16 tests) — good.** Coercion helpers, proxy URL building, `baseCard` defaults, adapter URL-encoding, result cap at 30, empty-list handling, `searchFilter`, bulk-catalog fallback for `searchById`, sync-source mapping and failure throw.
- **`sync-cache.test.ts` (4 tests) — small but meaningful.** Version-mismatch = miss, missing-game = miss, and the "does not throw on unwritable" test verifies the best-effort contract.
- **`sort-bins.constant.test.ts` (10 tests) — OK, with the N1 tautology caveat.** The color-bin layout tests (5 colors + colorless + catch-all, stable rule ids) are genuinely useful.
- **`scryfall.test.ts` / `scryfall.constant.test.ts` / `game-acronyms.constant.test.ts` (14 tests) — fine.** Boundary values (misprint band edges, confidence clamping at 0/100, `null` handling) are asserted explicitly.

**Verdict on rigor:** the suite would fail if the core logic were broken; I found no test that asserts the wrong thing, and no vacuous test (the closest is N1's formula mirroring, which still pins the physical heights). The 94-test / ~1 s claims in Item 64 are accurate (measured 808 ms).

---

## 5. Regressions or risks

1. **Running API is on pre-change code (verification gap, not a defect).** `uptime: 67318` (~18.7 h) plus zero JSON lines in `server.log` (the last startup line is old-format `[server] Running on port:3001`) show the process on 3001 started before the logger/retry changes. Smoke tests therefore prove the DB/routes/environment, not the new server code. **Action:** restart the API once after merge (e.g. `scripts/start-server.cmd`) and confirm a JSON startup line appears in `server.log`.
2. **No behavioral regression for correct inputs.** Retries only fire on 408/429/5xx or network errors; 4xx and aborts pass straight through — identical observable behavior when upstreams behave. The logger writes to stdout, which `start-server.cmd` already redirects.
3. **Web downscale (Item 63, accepted work) — re-verified, no issues.** `downscaleCanvas` is a no-op for canvases ≤512 px (no upscaling), falls back to the original canvas if `getContext` fails, and only the upload blob is downscaled — foil detection still runs on the full-res frame. Known consequence (documented in Item 63): the persisted debug/capture image is now ≤512 px.
4. **CI parity.** The `tests` job mirrors the existing jobs' setup (pnpm 9.1.3, Node 22, frozen lockfile) and `pnpm install --frozen-lockfile` passes locally, so the new job should not surprise. Note the `vitest.config.ts` include list covers only `shared` + `server` — future web tests would silently not run unless the include list is extended.
5. **Test files are typechecked** as part of each package's `tsc --noEmit` (verified via forced cache-miss typecheck), and `dist/` is turbo-cached — the `.github` job order (`typecheck` then `test`) is fine.

---

## 6. Sign-off recommendation

**Sign-off: APPROVE the working tree** (Items 63–64 + tests + CI + research doc) **for merge, with the following before a shop deployment:**

1. Address M1 (abort-aware backoff sleep or Retry-After cap) and M2 (timeouts on the retried external calls) — the only two production-hardening gaps.
2. Restart the API to load the new server code and confirm JSON logging in `server.log`.
3. Optional polish: L1 (guard `JSON.stringify`), L2 (migrate two `console.error`s), N1–N3.

No code changes were made by QA (findings M1/M2 are design decisions for the implementation agent/lead; everything else is report-only). `RESEARCH_MARKET.md` is coherent, appropriately hedged, and consistent with the repo (its "11-game single machine" claim cross-checks against the 11 sources returned by the live API) — no misleading statements found. Changelog Items 63–64 follow the repo's template (Status / Why / What changed / Behavior notes / How to revert) and their quantitative claims (94 tests, 22 evaluate-bin tests, ~1 s runtime) are accurate.

---

## 7. Re-verification (post-fix)

**Date:** 2026-08-08 (second pass) · **Scope:** Item 65 (M1, M2, L1, L2, N1, N2, N3). Report-only — no files modified, running server untouched.

### Verdict: **APPROVE — all findings genuinely resolved, no regressions found.**

### Fix-by-fix verification

| Finding | Resolved? | Evidence (file:line) |
| --- | --- | --- |
| **M1** abort budget vs. backoff sleeps | ✅ | `retry.ts:52-66` — new `abortableSleep()` races the signal: fires → clears the timer and rejects with `signal.reason`. Both backoff sites (`retry.ts:110, 118`) pass the signal. `retry.ts:37, 77-82` — `Retry-After` capped at 30 s (`MAX_RETRY_AFTER_MS`), unparsable/HTTP-date values fall back to backoff. Docstring (`retry.ts:7-16`) now describes the real semantics and matches the implementation. Dedicated test: `retry.test.ts:152-167` (abort-during-backoff). |
| **M2** no timeout on retried external calls | ✅ | `retry.ts:101` — `init.signal ?? AbortSignal.timeout(timeoutMs ?? 15_000)` created once per call, so every no-signal call site is bounded (15 s default) and retries stay inside the budget. `generic.ts:186, 202, 243` — bulk paths (sync + no-id-endpoint `searchById`) pass `timeoutMs: BULK_FETCH_TIMEOUT_MS` (120 s); search-style calls keep the default. Tests: `retry.test.ts:169-184` (internal timeout, TimeoutError, no retry), `retry.test.ts:186-211` (caller signal owns the budget; internal timeout never overrides). |
| **L1** unguarded `JSON.stringify` | ✅ | `logger.ts:21-32` — stringify wrapped in try/catch; on failure logs `level`/`ts`/`msg` with a `(details omitted: unserializable)` marker instead of masking the original error. |
| **L2** mixed `console.error` in cache files | ✅ | `art-cache.ts:50` and `sync-cache.ts:55` now call `logger.error`. Shell grep confirms **0** `console.error` occurrences in `art-cache.ts` / `sync-cache.ts` (and no `console.` anywhere in `retry.ts`/`logger.ts`). `server.log` will now be uniformly JSON from the server process. |
| **N1** tautological capacity assertions | ✅ | `sort-bins.constant.test.ts:13-29` — known-good literals: unsleeved 465/465/330/330/195/195/180; sleeved 199/77 (verified by hand: `floor(155/0.3×0.9)=465`, `floor(60/0.3×0.9)=180`, `floor(155/0.7×0.9)=199`, `floor(60/0.7×0.9)=77`). Headroom property test retained at `:36-40`. |
| **N2** retry test gaps | ✅ | `retry.test.ts` 8 → 14 tests: `retries: 1` (`:111-116`), HTTP-date `Retry-After` → backoff (`:118-134`), pinned backoff duration — a 0 ms-sleep regression fails (`:136-150`), abort-during-backoff (`:152-167`), internal-timeout bound (`:169-184`), caller-signal-owns-budget (`:186-211`). |
| **N3** vitest devDep duplication undocumented | ✅ | `vitest.config.ts:10-13` — comment explains per-package copies exist for `tsc --noEmit` type resolution, not for running tests. |

### Verification matrix (second pass)

All commands from `C:\Mault Revised\mault`, turbo cache-bypassed where available (Node v22.23.2, pnpm 9.1.3).

| Command | Result |
| --- | --- |
| `pnpm test` | ✅ PASS — 11 files, **100/100** tests (94 prior + 6 new retry tests; matches Item 65's claim), 1.12 s |
| `pnpm exec turbo typecheck --force` | ✅ PASS — 3/3 packages (cache-bypassed) |
| `pnpm exec turbo lint --force` | ✅ PASS — web (cache-bypassed) |
| `pnpm exec turbo build --force` | ✅ PASS — server (tsup) + web (vite), cache-bypassed |
| `pnpm install --frozen-lockfile` | ✅ PASS — lockfile consistent (CI `tests` job safe) |
| Bundle spot-check | ✅ `dist/index.js` contains the new retry symbols (`TimeoutError`, `abortableSleep`-equivalent, `MAX_RETRY_AFTER`) |

### Residual findings

None of the seven findings remain open. Remaining observations (all Nit-level, non-blocking):

1. **Nit — Retry-After cap vs. no-signal budget interplay:** on calls using the internal 15 s timeout, a capped 30 s `Retry-After` can never be fully honored — the 15 s budget fires first (by design: "retried within that budget"). Harmless and documented, but a reader may find `MAX_RETRY_AFTER_MS = 30_000 > timeoutMs` slightly confusing; a one-line comment noting the budget wins would polish it.
2. **Nit — docstring wording:** `retry.ts:15` says the internal timeout is "applied to the fetch"; it is created once per call and bounds fetches *and* sleeps. The next sentence ("still retried within that budget") clarifies, but the first clause is slightly imprecise.
3. **Nit — new `retry.test.ts` internal-timeout/caller-signal tests use real timers** (`vi.useRealTimers()` at `:170, 187`) while the rest use fake timers — a stylistic split, but justified (the internal `AbortSignal.timeout` can't be driven by fake timers; no flakiness observed in 3 runs).
4. **Carried over from §5 (unchanged):** the API running on 3001 still predates Items 64–65 — restart once after merge and confirm a JSON startup line in `server.log`. Item 65's own Behavior notes already flag this.

### Sign-off

**APPROVE.** Item 65 resolves M1, M2, L1, L2, N1, N2, N3 as implemented — each fix was verified in source and, where applicable, pinned by a new test that demonstrably fails if the fix regresses (backoff pin, abort-during-sleep, internal-timeout bound, caller-signal precedence). No regressions found in the full suite, typecheck, lint, or build. The changelog entry follows the repo template and its claims (6 new tests, 100 total) check out exactly.
