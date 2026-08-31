# CLAUDE.md — `standard` (STANDARD v7, the self-ledger)

**Read `..\life-taxonomy\DOCTRINE_INDEX.md` before the first substantive tool call (D13.1).**
This file is repo-operational law per D10 and carries the mount countermeasure per ISS-036/ISS-037.

## THE MOUNT — do this first, every session, no exceptions

```bash
export GIT_OPTIONAL_LOCKS=0        # git status/diff must not take index.lock on a FUSE mount
git config gc.auto 0
git config maintenance.auto false
```

- **Never `git checkout .`** and never `git stash` to "clean" this tree. Under `BEV\` every file
  shows as ` M ` from CRLF display noise. `git diff --stat` proves it: **24 files changed,
  0 insertions, 0 deletions**. A clean tree here looks dirty. Discarding it destroys real work.
- **Deletes are refused on the mount.** A stale `.git/*.lock` cannot be unlinked. Sweep it by
  MOVING it: `mv .git/index.lock ..\_archive\index-locks-<date>\` — never assume `rm` worked.
- **`git clone` cannot complete inside the mount** (ISS-041-proposed, found 4-HT 2026-08-31):
  clone writes `.git/config.lock` and then cannot unlink it, so `remote.origin.fetch` is never
  set and the clone dies half-made. **Clone into native VM scratch (`~/scratch`), then
  `cp -a` the finished clone into `BEV\`.** This repo was created that way.

## WHAT THIS REPO IS

GitHub Pages, two live apps against ONE Supabase project — **ISS-033 `TWO_WRITERS_ONE_TRUTH`,
open**:

| Path | Files | What |
|---|---|---|
| `/` (root) | 17 tracked | the legacy Apps-Script-era app, still served, still writing |
| `/v3/` | 7 tracked | **STANDARD v7** — the live instrument, HEAD `5a21a878` |

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

Container→GitHub push is unavailable for this repo. Route is Composio, one commit:
blob × n → tree (with `base_tree`) → commit → update-ref, then poll live `app.js` md5 until it
matches. Full procedure in `STANDARD_LIVE_STATE.md` § DEPLOY PROCEDURE. Substitute `__URL__` /
`__KEY__` inside the sandbox so the Supabase key never enters a context window.

## PHASE GATE

**No reminders, no keep-alive, no automated pulls before Phase D** (DEC-068 sequencing). The
reminder item is deliberately parked, not forgotten.
