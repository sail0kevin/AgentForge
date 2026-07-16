# Security Policy

AgentForge is a portfolio and local-first MVP. Please do not use it as a public multi-tenant service without an additional deployment review.

## Report a vulnerability

Do not open a public issue containing API keys, database files, session cookies, exploit payloads, or user data. Report the problem privately to the repository owner and include only the minimum reproduction details needed.

## Credential handling

- API keys are encrypted server-side with AES-256-GCM and are never returned as plaintext by the API.
- `.env`, SQLite databases, runtime logs, test results, and Electron build output are excluded from Git.
- The Electron app generates persistent local session and encryption secrets on first launch.
- Production web deployments require explicit session and encryption secrets of at least 32 characters.
- Provider-side key revocation and rotation must be completed in the provider console; repository checks cannot prove external revocation.

Run the repository hygiene check before publishing:

```bash
npm run security:verify-secrets
```

For a production-style environment check:

```bash
node --env-file=.env scripts/verify-secret-hygiene.mjs --production
```

## Known boundaries

- The Windows installer is currently unsigned and may trigger a SmartScreen warning.
- Local Ollama and custom provider URLs are allowed by the desktop app; public web deployments block private-network provider targets.
- Real-provider model quality and independent human blind evaluation are not yet release claims.
