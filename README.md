# Token Radar — pre-token protocols ranked by implied launch value

[![Competition](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/shusay12/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/shusay12/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

An entry for the make.fun bounty [Build the best token launch radar](https://make.fun/bounty/token-radar-01).

The program reads a sealed snapshot of every protocol DefiLlama tracks (758 protocols, frozen
2026-11-14), finds the ones that record no token yet, and ranks them by an implied launch value.
The value model is calibrated on the snapshot itself: each category's multiple is the median
market-cap/TVL ratio of its protocols whose token already trades, shrunk toward the global median
by comp count and clamped, then adjusted by the protocol's 7-day TVL growth and by how long it has
run with no token. The board covers the snapshot's whole 40-protocol watchlist plus every pre-token
protocol the list leaves out that passes the watchlist's own product screen at any size, each with
a six-step farm plan whose costs and times come from the protocol's own category, chain, size and
age.

## Run it

Node.js 22.18 or later, standard library only:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <dir holding snapshot.json>
```

It writes `out/board.json` (the ranked board), `out/data.js` (the dashboard's data),
`out/dashboard/` (a static page that renders with no network), `out/screenshots/` and
`out/dossier.json` (built with `vendor/makefun-board.ts`, the kit's library byte for byte).
Two runs write identical bytes.

## Layout

- `main.ts` — the program: snapshot in, board, data, dashboard, screenshots and dossier out.
- `lib/model.ts` — the calibration, the product screen, the ranking and the farm plans.
- `dashboard/` — `index.html`, `app.css`, `app.js`: the board, a detail view per protocol, an
  Already trading view and the model page with the full calibration table.
- `screenshots/` — the board, a detail view and a filtered view, rendered from this dashboard.

## License

MIT (see `LICENSE`).
