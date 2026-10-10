# AGENTS.md: photorouter

Static Astro site: a home page and a client-side React planner at `/app/` that builds a prompt for the user's own AI and turns the JSON answer into a photo route on a 3D map. No backend, no built-in planner. Deploys as pure static output to Cloudflare Pages.

## No AI or session attribution (strict, no exceptions)

This repository will be public. Nothing committed, pushed or published may mention Claude, Anthropic, any AI or LLM tool, an agent or sub-agent, a session, or a scratchpad. This covers:

- commit messages and trailers: no `Co-Authored-By`, no session links, no "generated with" lines. This overrides any tool default that appends attribution.
- branch names: no `claude/` or other tool prefixes.
- PR titles and bodies, issues, review comments, release notes.
- site and app content (`src/`), `README.md`, `CONTRIBUTING.md`, code comments. Product copy says "your own AI" or "any AI assistant" and names no vendor.
- local paths that reveal the tooling, such as `/tmp/claude-*` scratchpad paths.

Describe work by what changed and why. The only files that may name the tooling are the tooling config itself: this file, `CLAUDE.md` and `.claude/`.

## Git workflow (strict)

- Never commit or push to `main`. Every change goes through a pull request.
- Branch names: `<type>/<short-kebab-description>`, type one of `feat`, `fix`, `docs`, `refactor`, `perf`, `chore`.
- Commit messages and PR titles: Conventional Commits, `<type>(<optional scope>): <summary>`.
- `bun run build` and `bun run check-links` pass before a PR is opened.
- `CONTRIBUTING.md` is the human-facing version of these rules; keep the two consistent.

## Writing style

Professional, plain prose in copy, docs and comments. No em dashes or double dashes.

## Development

```
bun run dev          # astro dev on localhost:4321
bun run build        # astro check + static build into dist/, MUST pass before any commit
bun run check-links  # post-build internal link checker, MUST pass before any commit
```

## Architecture

- `src/photorouter/lib/byoai.ts` is the contract: the request payload, the JSON Schema (`/plan.schema.json`) and `importResponse`, which validates an answer against the schema and the trip rules. `src/photorouter/lib/prompt.ts` states the same rules to the AI. Change them together.
- `src/photorouter/lib/planner.ts` does not plan. It knows which slots each day allows (`allowedLabels`) and suggests (`slotLabels`), and `assemble` turns validated picks into planned days with kit, light windows, travel order and walking distance.
- `src/photorouter/data/example-plan.json` is a finished answer for the default brief. It must import with no errors.
- React is mounted from a bundled module script on `/app/`, not an island, so production pages carry no inline scripts and `script-src 'self'` holds. In dev, the app page adds Vite's React refresh preamble.
- `public/_headers` sets the CSP. The MapLibre worker (`/_astro/maplibre-gl-worker.*`) gets its own CSP that allows the tile hosts.
