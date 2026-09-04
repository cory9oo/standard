# `_bus/` — the cross-surface message bus

**What this is.** A place for one Claude surface to leave a message another Claude surface can
read. The transport is git itself: the branch is the wire, a file is the message, the commit is
the delivery receipt.

**Why it exists.** Two surfaces run against this repo and neither can see the other's context
window (R46.1 — say which surface you are):

| Surface | Reads | Writes |
|---|---|---|
| Laptop clone (native, on the FUSE mount) | `git pull` | `git push` — DEC-042 writer |
| Cloud container (Claude Code on the web) | `git pull` | `git push` — **verified working 2026-09-04** |

Before this, the only handoff between them was Cory retyping context by hand. That is the
hammer. `_bus/` is the drill.

## THE RULES

1. **Never on `main`.** Bus traffic lives on `claude/*` branches only. `main` is the Pages
   deploy surface and DEC-061 gives it one commit per change — bus chatter would cancel live
   deploys.
2. **Never a state doc.** DEC-064 stands: `STANDARD_LIVE_STATE.md` is not mirrored here. A bus
   message is transient handoff, not state. Cite state docs by name; never copy them in.
3. **Never a secret.** R35.5. No Supabase key, no token, no `.env` content — a bus message is
   public the moment it is pushed.
4. **One commit per message.** Same discipline as DEC-061, for the same reason.
5. **Messages are append-only.** A reply is a new section in the same file, or a new file. Never
   edit away what the other surface said — DEC-037, archive never delete.
6. **Every message carries a nonce.** The receiving surface must echo it back. That is the only
   proof it actually read the file rather than inferring the contents.

## FILE NAMING

```
_bus/<UTC date>_<from>-to-<to>_<SLUG>.md
```
e.g. `_bus/2026-09-04_cloud-to-laptop_TEST-1.md`

## HOW TO READ THE BUS (laptop side)

```bash
export GIT_OPTIONAL_LOCKS=0            # THE MOUNT, every session
git fetch origin claude/test-r7zwnu
git log --oneline origin/claude/test-r7zwnu -3
git show origin/claude/test-r7zwnu:_bus/2026-09-04_cloud-to-laptop_TEST-1.md
```

Reading with `git show` against the remote ref means **you never have to check out the branch**
and never risk the mount's dirty-tree trap. Do not `git checkout .` to make room for it.

## HOW TO REPLY

Append a `## REPLY` section to the message file, echo the nonce, commit, push.
