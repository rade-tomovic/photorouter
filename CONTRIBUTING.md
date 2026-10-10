# Contributing

## Prerequisites

- [bun](https://bun.sh) (package manager and script runner)
- Node.js 22.12 or newer

```sh
bun install
bun run dev          # localhost:4321
```

## Workflow

`main` is only changed through pull requests. Never push to it directly.

1. Branch from `main` with a typed name: `<type>/<short-kebab-description>`.
2. Commit with [Conventional Commits](https://www.conventionalcommits.org) messages: `<type>: <imperative summary>`, optionally scoped, e.g. `feat(prompt): add a language option`.
3. Run the gate (below) locally.
4. Open a pull request against `main`. The PR title follows the same `<type>: <summary>` form, because PRs are squash-merged and the title becomes the commit message on `main`. The `Build` check must pass before merging. PRs from branches in this repository also get a Cloudflare Pages preview deploy; PRs from forks are built and checked but not deployed.

| type | use for | branch example |
| --- | --- | --- |
| `feat` | new behaviour in the app or site | `feat/custom-trip-import` |
| `fix` | restores intended behaviour | `fix/import-light-check` |
| `docs` | README, this guide | `docs/schema-notes` |
| `refactor` | restructuring with no visible change | `refactor/split-importer` |
| `perf` | build or page performance | `perf/lazy-load-map` |
| `chore` | dependencies, CI, tooling, config | `chore/bump-astro` |

## Gate

```sh
bun run build        # runs astro check first
bun run check-links
```

## Rules for changes to the importer

The importer in `src/photorouter/lib/byoai.ts` and the prompt rules in `src/photorouter/lib/prompt.ts` describe the same contract. A rule the importer enforces must be stated in the prompt, and a required prompt rule must be enforced by the importer. The bundled example answer (`src/photorouter/data/example-plan.json`) must keep importing with no errors.
