# PhotoRouter

Built and maintained by [AMPQ](https://ampq.dev/).

Plan a photo trip with your own AI. Describe the trip, the gear you carry and what you like to shoot; PhotoRouter turns that into a prompt holding the trip calendar and a catalog of photo spots. Run the prompt in any AI assistant or API, paste the JSON it returns, and PhotoRouter checks it and plays the route on a 3D map.

There is no built-in planner, no account and no backend. Everything runs in the browser; the only network requests are map tiles.

**Live:** https://photorouter.pages.dev

## How it works

1. **Brief.** Gear, photography styles, pace, walking, working hours, crowds, must-see and skip spots, and a free-text description.
2. **Prompt.** A prompt builder with presets, voice, weighted priorities, optional rules, city scope, answer language and extra instructions. The Chat target puts the JSON Schema in the prompt; the API target leaves it out for the provider's structured-output option.
3. **Answer.** The pasted JSON is validated against the schema and the trip rules: the city of each slot, the spot's light against the slot, working hours, pace limits, tripod, crowd and walking constraints, and must-see coverage. Errors block the import; warnings are shown.
4. **Route.** MapLibre GL with OpenFreeMap vector tiles, 3D buildings and optional terrain. Playback follows the train legs with a chase camera and walks between stops. Day sheets show light windows from sun times, the kit to pack and the local names of each spot.

The response schema is published at [`/plan.schema.json`](https://photorouter.pages.dev/plan.schema.json). It keeps to the subset that structured-output modes accept: closed objects, every key required, nullable fields as `anyOf` with `null`, and enums for dates, slots and spot ids.

The demo trip is 15 days, Guangzhou to Shenzhen to Hong Kong, with 42 spots.

## Stack

- [Astro 7](https://astro.build) static output: the home page is plain Astro, the planner at `/app/` is a React app mounted from a bundled module script
- TypeScript, Tailwind 4, zustand, MapLibre GL
- bun for everything
- Deploys to Cloudflare Pages (pure static, no server)

## Develop

```sh
bun install
bun run dev          # localhost:4321
bun run build        # astro check, then a static build into dist/
bun run check-links  # internal link check over dist/
```

## Layout

- `src/pages/index.astro`, `src/components/home/`: the home page
- `src/pages/app/index.astro`: the planner page
- `src/pages/plan.schema.json.ts`: the published response schema
- `src/photorouter/data/`: spot catalog, gear list, trip frame and the example answer
- `src/photorouter/lib/byoai.ts`: request payload, JSON Schema and the importer that validates answers
- `src/photorouter/lib/prompt.ts`: the prompt builder
- `src/photorouter/lib/planner.ts`: trip calendar (allowed and suggested slots per day) and plan assembly (kit, light windows, travel order, distance)
- `src/photorouter/map/`: map engine, styles and the playback sequencer
- `public/_headers`: CSP and caching for Cloudflare Pages. The MapLibre worker gets its own CSP, because a worker loaded from a URL follows the CSP on its own response and it is the worker that fetches vector tiles.

## Contributing

Changes land through pull requests only. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
