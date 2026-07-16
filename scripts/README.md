# Scripts

| Script | Purpose | Notes |
| --- | --- | --- |
| `migrate-legacy-agent-keys.mjs` | Dry-run / apply migration for legacy Agent config keys | Review output before `--apply`; never prints raw keys. |
| `verify-secret-hygiene.mjs` | Checks Git tracking, common credential signatures, and runtime secret readiness without printing values | Run `node --env-file=.env scripts/verify-secret-hygiene.mjs --production` before a session/production release. It cannot prove provider-side revocation. |
| `gen.mjs` | Development helper | Keep only if still used by the team. |
| `gen_translations.py` | Translation generation helper | Requires Python. |
| `remove_old.py` | Legacy maintenance helper | Review before running; not part of normal setup. |

One-off debugging and screenshot helpers are archived under `archive/` and are not part of the normal project workflow.
