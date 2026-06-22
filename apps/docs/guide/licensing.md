# Licensing

Archora is local-first. Licensing must not require uploading repository code, scan JSON, dependency edges, file paths or reports.

## Open core model

The analysis engine (`@archora/core`) and the CLI (`@archora/cli`) are open source under Apache-2.0 — free for everyone, no license key required. The paid product is the desktop Architecture Workspace and team-scale features.

## Public pricing

| Tier    | Price                  | Scope                                                       |
| ------- | ---------------------- | ----------------------------------------------------------- |
| Free    | Open source            | CLI (`@archora/cli`) and full analysis engine (Apache-2.0)  |
| Solo    | $19/month or $190/year | Desktop Architecture Workspace, one individual developer    |
| Team    | $49/seat/month         | Desktop + shared baselines, history, trends and PR-bot      |
| Company | Custom                 | Procurement, support, SSO, legal terms or larger scale      |

Solo and Team include a 14-day trial. Company, OEM, embedding, redistribution, resale and third-party codebase-analysis services require a separate written agreement.

## Manual license flow

Until checkout delivery is wired, Archora uses a manual signed-key flow for
desktop activation:

```bash
npx @archora/cli@1.3.0 license request --plan trial --out license-request.md
```

Send `license-request.md` to `akotov@archora.dev` or Telegram `@akotofff`.
The request file contains environment and scope metadata only; it does not
include source code, scan data, reports, environment variables or private
absolute paths.

After receiving a key:

```bash
npx @archora/cli@1.3.0 license activate <license-key>
npx @archora/cli@1.3.0 license status
```

Seller-side key issuing:

```bash
npm run license:keygen
npm run license:issue -- --customer "Customer" --days 14 --plan trial
npm run license:issue -- --customer "Customer" --days 365 --plan team
```

## Scoped flow

The narrow implementation path for desktop license validation:

1. License key is entered in the desktop app or activated through the CLI.
2. Desktop validates the signed key locally with `VITE_ARCHORA_LICENSE_PUBLIC_KEY_JWK`.
3. CLI stores the active key in `~/.config/archora/license.json`.
4. CI runners can override storage with `ARCHORA_LICENSE_FILE`.
5. Commercial feature gating is active only when `ARCHORA_LICENSE_PUBLIC_KEY_JWK` is configured — base CLI analysis is always available without a key.

## Remaining policy work

- Refund and transfer policy.
- Checkout provider and automatic license-key delivery flow.
- Final paid-surface matrix by plan.

## Non-goals before the decision

- No checkout integration in the app.
- No cloud scan storage.
- No account system in the analyzer or CLI.
- No network call during scan, parse, analyze or report.
