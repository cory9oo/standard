# STANDARD

The daily standard. Checked is done; unchecked is not.

This repository holds the front end only. Every habit, day, score and journal
entry lives in Postgres behind row-level security. **No personal data is here.**

The publishable Supabase key in `sb-api.js` is meant to be public - it grants
nothing that the signed-in person is not already permitted to see. Privacy is
enforced by database policy, not by hiding a key.

## The promise the database keeps

| what | who can read it |
|---|---|
| Habit list, checkmarks, completion % | you and your circle |
| Journal, day rating, tasks, prayer | **you alone** |
| Anything at all, signed out | **nobody** |

The journal lives in its own table with a single policy: owner only, in every
direction. Not the circle owner, not a friend, not an app bug.

## Files

| | |
|---|---|
| `index.html` | the app - calendar, charts, day view, editor, Life grid |
| `sb-api.js` | the data layer, in the shape the UI already expected |
| `auth.js` | sign in / sign up |
| `sw.js` | offline shell + install |
