# PhotoRouter

Built and maintained by [AMPQ](https://ampq.dev/).

Plan a photo trip anywhere with your own AI. Describe where you are going, when, the gear you carry and what you like to shoot; PhotoRouter turns that into a prompt. Run it in any AI assistant or API: the AI picks the cities, the photo spots with their coordinates and light, and the day-by-day plan, and returns it as JSON. Paste the JSON back, and PhotoRouter checks it and plays the route on a 3D map.

There is no built-in planner, no account and no backend. Everything runs in the browser; the only network requests are map tiles.

**Live:** https://photorouter.pages.dev

## How it works

1. **Brief.** Destination, first day and number of days, gear, photography styles, pace, walking, working hours, crowds, must-see and skip places, and a free-text description.
2. **Prompt.** A prompt builder with presets, voice, weighted priorities, optional rules, answer language and extra instructions. For each date the prompt lists the slots and stop limit of an arrival, a stay day and a travel day. The Chat target puts the JSON Schema in the prompt; the API target leaves it out for the provider's structured-output option.
3. **Answer.** The AI returns the whole trip: cities with a base in each, photo spots with coordinates, light, focal ranges, tripod needs, effort and crowd levels, travel between cities, day trips out and back from a base, and a spot for each slot. PhotoRouter validates it against the schema and the trip rules: dates that run day by day, a consistent chain of cities (a day trip goes out and back without changing where the photographer sleeps), spots within 150 km of their city, the spot's light against the slot, working hours, pace limits, tripod, crowd and walking constraints, the skip list and must-see coverage. Errors block the import; warnings are shown. An answer whose dates differ from the brief came from another prompt: it loads as its own trip, the brief takes its dates, and the brief's rules show as warnings. The last brief, answer and plan are kept in the browser's local storage, so the planner reopens where you left off.
4. **Route.** MapLibre GL with OpenFreeMap vector tiles, 3D buildings and optional terrain. Playback rides each travel leg with a chase camera (train, flight, ferry, bus or car) and walks between stops. Day sheets show light windows computed from sun times in the destination's time zone, the kit to pack and each spot's local name.

The response schema is published at [`/plan.schema.json`](https://photorouter.pages.dev/plan.schema.json). It keeps to the subset that structured-output modes accept: closed objects, every key required, nullable fields as `anyOf` with `null`, and enums. The prompt and the "Copy schema" button give a version pinned to the trip's dates.

Six demo trips, one per continent, are ready-made answers that load without running a prompt. The default is picked from the browser's time zone, with no network request.

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
- `src/photorouter/data/gear.json`: gear list and photography styles
- `src/photorouter/data/demos/`: the demo trips, one per continent: a brief and the answer for it
- `src/photorouter/lib/byoai.ts`: request payload, JSON Schema and the importer that validates answers and builds the trip
- `src/photorouter/lib/prompt.ts`: the prompt builder
- `src/photorouter/lib/planner.ts`: the calendar (day kinds, allowed slots, stop limits) and plan assembly (kit, light windows, travel order, distance)
- `src/photorouter/lib/demos.ts`: demo loading and the time-zone to continent mapping
- `scripts/check-demo.ts`, `scripts/verify-coords.ts`: validate a demo with the importer, and check its coordinates against OpenStreetMap
- `src/photorouter/map/`: map engine, styles and the playback sequencer
- `public/_headers`: CSP and caching for Cloudflare Pages. The MapLibre worker gets its own CSP, because a worker loaded from a URL follows the CSP on its own response and it is the worker that fetches vector tiles.

## Contributing

Changes land through pull requests only. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
