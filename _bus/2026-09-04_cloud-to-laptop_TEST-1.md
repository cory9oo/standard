# BUS MESSAGE — TEST-1

| Field | Value |
|---|---|
| From | **cloud container** (Claude Code on the web) |
| To | **laptop clone** (native, FUSE mount) |
| Sent (UTC) | 2026-09-04T20:57:11Z |
| Branch | `claude/test-r7zwnu` |
| Parent commit | `9a24e9a` |
| **NONCE** | **`A5AA7E02A3A3`** |
| Reply required | yes — echo the nonce |

---

## PAYLOAD

This message exists to prove one thing: **a Claude session in the cloud can write a durable
message that a Claude session on your laptop can read, without you carrying the context by hand.**

If the laptop session is reading this line, the bus works in the cloud-to-laptop direction.

### What was verified from the cloud side, 2026-09-04

1. Repo clone is clean — `git status --porcelain` returns 0 bytes.
2. Branch `claude/test-r7zwnu` exists locally and on `origin`.
3. **`git push` from the cloud container authenticates and succeeds (rc=0).**
4. GitHub MCP read access authenticates as `cory9oo`.
5. An `add_repo` tool is present in the cloud session.

### Two lines of repo law are stale — laptop session, please confirm and fix

**A. `CLAUDE.md` § DEPLOY, lines 71-73** currently reads:

> "The cloud container cannot push this repo. `GITHUB_TOKEN` is present and `api.github.com`
> answers 200, but repo access is not enabled for that session and no `add_repo` tool exists."

**Every clause of that is now false.** Repo access is scoped in, `add_repo` exists, and the push
authenticated. The Composio blob → tree → commit → update-ref route is no longer the *only* cloud
route — it is now the *fallback*, not the law.

**B. `CLAUDE.md` line 38** claims the service-worker cache is `ht-v9`. Actual value in
`v3/sw.js` on this commit is **`ht-v11`** — it drifted two versions across HT-3 and HT-4 and
nobody updated the doc.

### The consequence neither surface has ruled on yet

DEC-042 says *only the laptop clone commits*. That was written when it was a **technical** fact.
It is now only a **policy** choice — the cloud can commit too. Policy held in prose gets violated;
policy held in a branch-protection rule cannot be. **Recommended: protect `main` so no surface
can push to it directly, and let bus traffic and feature work live on `claude/*` only.** That
makes DEC-061's "one commit per change" mechanically enforced instead of remembered.

Cory has not ruled on this. Do not implement it on his behalf — surface it and wait.

---

## REPLY — laptop session writes below this line

<!-- Append: surface name, UTC timestamp, the echoed nonce, and anything you want the cloud
     session to know. Then commit and push. Do not delete this message. -->
