# CLAUDE.md — `standard` (HT · Habit Tracker, the self-ledger)

**Read `..\life-taxonomy\DOCTRINE_INDEX.md` before the first substantive tool call (D13.1).**
This file is repo-operational law per D10 and carries the mount countermeasure per ISS-036/ISS-037.

## THE MOUNT — do this first, every session, no exceptions

```bash
export GIT_OPTIONAL_LOCKS=0        # git status/diff must not take index.lock on a FUSE mount
git config gc.auto 0
git config maintenance.auto false
```

- **Never `git checkout .`** and never `git stash` to "clean" this tree. A clean tree here can look
  dirty — but **the cause is the executable bit, not CRLF** (diagnosed 4-HT 2026-08-31, correcting
  the estate-wide belief). The FUSE mount reports every file `100755` against an index of `100644`,
  so git prints `old mode/new mode` hunks with **zero content lines**; `git ls-files --eol` reads
  `i/lf w/lf`, i.e. the line endings were never wrong. The fix is one local setting, already applied
  here: `git config core.fileMode false` — after it, `git status --porcelain` is 0 and trustworthy
  again. Discarding a "dirty" tree without checking destroys real work.
- **Deletes are refused on the mount.** A stale `.git/*.lock` cannot be unlinked. Sweep it by
  MOVING it: `mv .git/index.lock ..\_archive\index-locks-<date>\` — never assume `rm` worked.
- **`git clone` cannot complete inside the mount** (ISS-041-proposed, found 4-HT 2026-08-31):
  clone writes `.git/config.lock` and then cannot unlink it, so `remote.origin.fetch` is never
  set and the clone dies half-made. **Clone into native VM scratch (`~/scratch`), then
  `cp -a` the finished clone into `BEV\`.** This repo was created that way.

## WHAT THIS REPO IS

GitHub Pages. **One app.** ISS-033 `TWO_WRITERS_ONE_TRUTH` was **CLOSED 2026-08-31** (WIRE HT-2,
`ad4f80b`): the legacy Apps-Script-era app was archived out of the repo and root became a
tombstone. Two apps once shared this origin, and their service workers deleted each other's cache
on every activate — **do not reintroduce a second app here.**

| Path | What |
|---|---|
| `/` (root) | tombstone: unregisters the legacy worker, drops the legacy cache, redirects to `./v3/`. Plus the three shared icons — **`v3/` links them as `../icon-192.png`, `../icon-512.png`, `../apple-touch-icon.png`. Removing them breaks the PWA install, and nothing on screen shows it.** |
| `/v3/` | **the app.** Brand A (`Habit Tracker` · `HT`), capacity score, small default view, cue field, KPI band **dark** until GOAL MATH locks. SW cache `ht-v9`. |

The legacy source is archived at `..\_archive\2026-08-31_standard_legacy_app\` (DEC-037 — archived,
never deleted). **HT-MIGRATE-1** renames this repo to `ht` and moves the app to the root; until
then `/standard/v3/` is the live URL.

`STANDARD_LIVE_STATE.md` (Birds Eye View Project) is the state doc — DEC-064: state docs are NOT
mirrored into this repo. Cite it by name; never copy it here.

## THE LAW THIS APP IMPLEMENTS — do not re-litigate in code

| Ruling | Law |
|---|---|
| **DEC-055** | **No cut.** All standards stay active. Do not propose trimming the list. |
| **DEC-056** | **No tier.** `habits.tier` is a dead field — present in schema, ignored by the app. |
| **DEC-057** | **Time is not an organising principle.** Never group or order the list by clock. |
| **DEC-058** | **Three inputs — completion, rating, journal. Everything else is derived output.** Any proposed fourth write surface must be argued against this rule first. |
| **DEC-059** | Percentage renders as a continuous density ramp of the accent. Grade letters yes; grade colours no. |
| **DEC-060** | `<meta name="darkreader-lock">` ships permanently. Removing it silently re-breaks desktop. |
| **DEC-061** | **One commit per change**, via Composio, md5-verified per chunk. Two commits seconds apart cancel a running Pages deploy. |
| **DEC-062** | On aesthetic work: render OPTIONS, Cory picks. Never iterate on a guess. |
| **DEC-042** | Cowork stages into `BEV\_reconcile\`; **only this clone commits.** |
| **DEC-037** | Archive, never delete. |

`saveDay()` writes `active_set` on every save (P4 closed) — past grades must never be repriced by a
later list change. Do not remove that write.

## DEPLOY

**Two surfaces, two truths — say which one you are (R46.1).**

- **This clone, on the laptop, natively: `git push` WORKS.** HT-2, HT-3 and HT-4 all pushed here,
  rc=0. It is the writer (DEC-042) and the normal route.
- **The cloud container cannot push this repo.** `GITHUB_TOKEN` is present and `api.github.com`
  answers 200, but repo access is not enabled for that session and no `add_repo` tool exists. From
  there — and only from there — the route is Composio, one commit:
blob × n → tree (with `base_tree`) → commit → update-ref, then poll live `app.js` md5 until it
matches. Full procedure in `STANDARD_LIVE_STATE.md` § DEPLOY PROCEDURE. Substitute `__URL__` /
`__KEY__` inside the sandbox so the Supabase key never enters a context window.

## PRIVACY — R47.3, and it is structural, not a setting

A circle sees **adherence-class data only**: completion %, streaks, capacity band. **Journals
(`why` · `tasks` · `prayer`) and day-ratings are never visible to anyone but their author.** Not
permission-gated — *unshareable*: there must be no schema path from another user's id to those
fields. The standards LIST is not shareable either: when people know their list is watched they set
fewer and safer standards, which cancels the whole point of the circle.

Today exactly one query crosses users — `days.select('user_id,date,pct')` in `paintCircle()`. Keep
it that way. **`_reconcile/ht_batch5/privacy_check.py` enforces this mechanically and must pass in
every HT wire**; it fails loud on an unscoped `day_private` read, a cross-user `habits` read, or any
cross-user column outside `{user_id,date,pct}`.

CIRCLE-1 (Andrew · Dale · Justin) is **chartered, not built** — it opens on Cory's word only.

## PHASE GATE

**No reminders, no keep-alive, no automated pulls before Phase D** (DEC-068 sequencing). The
reminder item is deliberately parked, not forgotten.
