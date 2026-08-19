---
name: allowlist
description: Add or remove people from the retrospective-agent access allowlist, and redeploy so the change takes effect. Use when someone should be granted or revoked access to the app, or when asked who currently has access.
---

# Managing the access allowlist

The allowlist is the Secret Manager secret `retrospective-allowed-emails` — one
comma-separated string of emails permitted to log in. `scripts/allowlist.sh` owns
the exact commands; use it rather than composing `gcloud` calls by hand, so the
sharp edges stay in one place.

## Steps

1. **Show what would change.** Run the operation with `--dry-run` first and show
   the user the current list and the additions or removals:

   ```bash
   ./scripts/allowlist.sh add --dry-run person@example.com
   ```

   Emails already present are skipped, so a re-add is a no-op rather than a
   duplicate. Report that instead of writing a version.

2. **Apply it.** Non-interactive callers must pass `--yes` (the script refuses to
   write unconfirmed):

   ```bash
   ./scripts/allowlist.sh add --yes person@example.com another@example.com
   ```

   The script reads the current value, writes the full list back as a new
   version, and reads it back to verify. `remove` works the same way.

3. **Ask about the redeploy.** A new secret version only takes effect on the next
   container startup. Ask whether to force it now — do not decide for them:

   ```bash
   ./scripts/allowlist.sh redeploy
   ```

   This restarts the service on the image it is already running and then checks
   `/health`. It is a restart, not a code change.

4. **Report back**: the new version number, who was added or removed, and whether
   the redeploy happened.

## Notes

- `./scripts/allowlist.sh list` answers "who has access?" without changing anything.
- If gcloud credentials have expired, the script says so. Ask the user to run
  `gcloud auth login` themselves — suggest they type `! gcloud auth login` — since
  it cannot prompt in a non-interactive shell.
- Removing everyone is blocked unless `--force` is passed, and removing your own
  account prints a warning. Both are lockout guards; check with the user before
  overriding either.
- Background on why versions must be written whole rather than appended:
  README.md, "Adding or Removing Users".
