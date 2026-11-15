# Alfred

Discord bot for the Research Community.

TypeScript · [Sapphire](https://sapphirejs.dev) (discord.js) · [DocumentDB](https://documentdb.io) (MongoDB wire protocol on Postgres) · [Hono](https://hono.dev) · Pino · zod

## Requirements

- Node.js 26 (`nvm use` picks it up from `.nvmrc`)
- Yarn 4 via Corepack (`npm i -g corepack && corepack enable`, since Node ≥ 25 doesn't bundle Corepack)
- Docker (for the database, and for production)

## Development

```sh
yarn install
cp .env.example .env               # add your bot token
cp config.example.yaml config.yaml # add your guild ID
yarn db:up                         # starts DocumentDB on 127.0.0.1:10260
yarn dev                           # compiles in watch mode and restarts the bot on changes
```

| Script               | What it does                                                     |
| -------------------- | ---------------------------------------------------------------- |
| `yarn dev`           | `tsc` watch mode and restarts the bot on every successful build  |
| `yarn build`         | Compile `src/` to `dist/`                                        |
| `yarn start`         | Run the compiled bot                                             |
| `yarn check`         | Typecheck, lint, format check and tests                          |
| `yarn lint`          | Oxlint with type-aware rules                                     |
| `yarn format`        | Format everything with Oxfmt                                     |
| `yarn test`          | Vitest                                                           |
| `yarn config:schema` | Regenerate `config.schema.json` after changing the config schema |
| `yarn db:up/down`    | Start/stop the dev database                                      |

### Configuration

- **`.env`**: secrets and infrastructure (token, database URL, ports). Validated by `src/lib/env.ts`.
- **`config.yaml`**: guild-specific settings (IDs, presence, …). Validated by `src/lib/config.ts`.
  Editors with the YAML extension get autocomplete from `config.schema.json`.

The bot refuses to start, with a readable error, if either one is invalid.

## Production

The stack is built and run on the server with Docker Compose. Caddy on the host terminates TLS
and proxies to `127.0.0.1:3050`.

```sh
cp .env.example .env && cp config.example.yaml config.yaml   # fill in; set DB_PASSWORD
git pull && docker compose up -d --build
docker compose logs -f alfred
```

The database runs on an internal-only network with no published ports. Back it up with
`docker compose exec documentdb pg_dumpall ...` (the documents are stored in Postgres).

### Verification site

The rules panel's **Verify** link points to `onboarding.publicUrl` in `config.yaml`. Caddy
serves that domain and proxies it to Alfred:

```caddyfile
verify.research-community.org {
	reverse_proxy 127.0.0.1:3050
}
```

- Set `ALTCHA_HMAC_KEY` in `.env` (generate one with `openssl rand -base64 48`). Alfred refuses
  to start without it while `onboarding` is configured.
- Mark the server **age-restricted** in Discord (Server Settings → Access → Age-Restricted
  Server). That's the real age barrier: Alfred doesn't check ages and warns at startup if the
  setting is off.
- Health check: `GET /healthz` returns 200 once the bot is connected to Discord.

### Switching over from the old bot

1. Stop the old bot. Close any open tripsit tickets it created (they're named after members).
2. Fill in `config.yaml` (`onboarding`, `tickets`, `nationality`) and `.env`, then start Alfred.
3. Point the verification domain at Alfred in Caddy. Old `/captcha` links show an "outdated" page.
4. The old rules and ticket panels keep working (their buttons are still recognised).
   Re-post them with `/panel` whenever convenient for the new look.

## License

[AGPL-3.0-or-later](LICENSE)
