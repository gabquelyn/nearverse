# Nearverse

A drivable 3D trading game for the NEAR Hackathon `games` track. You drive a truck around an island, gather materials, sell them to merchants whose prices follow supply, and spend the proceeds building on your plot.

**Problem it addresses:** most on-chain games are a token with a game attached, and players have to deal with wallets, gas and popups. Here the game comes first. After one sign-in, every action is signed silently, and the economy runs on rules anyone can read in one file.

## How NEAR is used

- **NEP-245 multi token:** one contract (`contracts/nearverse`) holds wood, iron, slate, clay and fuel. Gathering mints, selling burns, and all standard `mt_*` transfer and view methods are present. Approvals are not implemented.
- **NPCs with wallets:** merchants hold stock and cash in contract state. A merchant out of cash stops buying.
- **An economy that changes without a patch:** each contract call applies elapsed time. Stock drifts, events fire, and merchants change their target stock from their own trading history.
- **Function-call keys:** game methods work with a key that can't attach NEAR, while `withdraw` and `mt_transfer` require 1 yocto, so that key can't move value.

## Status: what has and hasn't been verified

| Part | Status |
| --- | --- |
| Economy engine, Rust contract rules | Tested. 1,500 replayed steps match exactly between TypeScript and Rust |
| Contract with mocked runtime | Tested (`cargo test`) |
| Compiled wasm | Tested in Node against a mock of the host functions (`npm run smoke:wasm`). Gas not measured |
| Web game in practice mode, judge view, fast-forward | Tested in a browser against the web container |
| Deployed contract on real testnet | **Not yet run.** See step B below |
| Guest play, ghost traders on testnet | **Not yet run** |
| NEAR Auth login adding a session key (`/spike`) | **Not yet run.** Docs don't confirm that `AddKey` can be signed. Guest play is the fallback |

Contract account on testnet: *not deployed yet*.

## Run it

Docker is the only requirement: Docker Engine with Compose 2.24 or newer. Rust, Node and every other tool are pinned inside the images. Run these from the repository root. The first build takes several minutes.

| Command | What it does |
| --- | --- |
| `docker compose up --build` | Starts the web game on port 3000 |
| `docker compose run --build --rm test` | Runs type checks, economy tests, contract tests and the compiled-contract check |
| `docker compose run --build --rm e2e` | Plays the game in a real browser against the web container |
| `docker build --target contract-wasm --output out .` | Writes the contract to `out/nearverse.wasm` |
| `docker compose run --build --rm deploy` | Builds and deploys the contract to testnet |
| `docker compose run --build --rm smoke` | Runs the game loop against the deployed contract |
| `docker compose run --build --rm ghosts` | Runs labeled simulated traders on testnet |
| `docker compose --profile dev up --build dev` | Runs the web app with live reload from your source files |
| `docker compose --profile ops down` | Stops everything |

Use `WEB_PORT=8080 docker compose up --build` if port 3000 is taken.

### A. Try the game with no chain, about 5 minutes

1. Run `docker compose up --build`. Wait for the container to report healthy. Open http://localhost:3000/api/health and see `"mode":"practice"`.
2. Open http://localhost:3000/judge. See a "Judge view" heading and a practice mode note.
3. Press **Skip to the end**. See a week of prices across five materials, merchant cash, and a list of what merchants learned.
4. Press **Run a week**, then **Flood the market with iron** while it plays. See the iron line drop.
5. Under *Play by buttons*, press **birch-grove**. See "Gathered 3 wood" under Activity.
6. In the price table, hover a price. See its reasoning, such as "Wood 7.20: stock on target (+0%), spread (−10%)."
7. Press **Sell** on wood. See coins rise, and hover again to see that the merchant's stock rose.
8. Open http://localhost:3000/ and press **Start driving**. Drive with WASD or arrows. Drive into a circle by a stockpile and hold **E** to load. See cubes appear in the truck bed. Drive into a colored circle at a stall to trade.

### B. Deploy

**Contract**

1. Create and fund a testnet account at https://near-faucet.io. Run `cp .env.example .env`, then set `NEARVERSE_DEPLOYER_ACCOUNT` and `NEARVERSE_DEPLOYER_PRIVATE_KEY`.
2. Run `docker compose run --build --rm deploy`. See "Done. Tick: 0". The command refuses non-testnet accounts, and accounts that already hold this contract.
3. Set `GAME_CONTRACT` in `.env` to that account.
4. Run `docker compose run --build --rm smoke`. See "Testnet smoke passed".

**Web**

The web image holds no settings or secrets. It reads them from the environment when it starts, so changing contract needs a restart, not a rebuild.

1. Set `NEARVERSE_TREASURY_ACCOUNT` and `NEARVERSE_TREASURY_PRIVATE_KEY` in `.env`. They can be the deployer's. Only the web server reads them, and they pay test funds and NEAR Auth relays.
2. On any Docker host, run `docker compose up -d --build web`.
3. Or build an image for any container host with `docker build --target web -t nearverse-web .`, then provide these variables: `GAME_CONTRACT`, `NEAR_NETWORK`, `NEARVERSE_TREASURY_ACCOUNT`, `NEARVERSE_TREASURY_PRIVATE_KEY`, and optionally `NEAR_RPC_URL`, `FASTAUTH_CLIENT_ID`, `NEARVERSE_CLAIM_YOCTO`. It listens on port 3000 and answers health checks at `/api/health`.
4. Open `/api/health` and see `"mode":"chain"`. Open `/play` and see "Playing on NEAR testnet" with no wallet prompt.
5. Gather on `/judge`. See "view transaction" appear under Activity with no popup.
6. Open `/spike` and follow the buttons to prove social login and the session key.

## How it works

- **`config/merchants.rules.yaml` is the one place pricing rules are written.** `scripts/gen-contract-config.ts` turns it and `config/items.yaml` into `packages/economy/generated/rules.json`, which is both the contract's init argument and the web app's rules.
- **The contract enforces prices** and takes a `min_total` or `max_total` on trades, so a price change fails with `PRICE_MOVED` instead of a surprise.
- **The price rule:** `price = base × (target / stock)^k`, clamped, with spread and blueprint premium on top. `k` is limited to values the contract computes exactly with integer roots.
- **Tooltips match the contract** because they run the same formula from the same state. `tests/parity.rs` replays TypeScript fixtures against Rust.
- **Fast-forward is a labeled simulation** in the browser on a copy of the market. It sends no transactions.
- **The browser applies actions at once** and confirms them in a background queue. If a transaction fails, the game shows why and reloads from the chain.

## Known limits

- **The contract can't verify driving.** A script could call `gather` without driving. The limits are on-chain: node stock, a per-player cooldown, fuel, wear and cargo space. Mines in the world only cost time.
- **Earnings can't leave the game.** Withdrawals are capped at deposits, which removes the reason to farm with scripts. Starter coins can't be withdrawn.
- **The contract pays storage** for player records, which is fine for a testnet game but would need a fee on mainnet.
- `leaderboard` scans up to 200 players. Approvals in NEP-245 aren't implemented.
- Guest play keeps a throwaway full-access key in the browser for a faucet-funded testnet account. It isn't suitable for real value.

## Layout

`Dockerfile`, `compose.yaml` every build, test and deploy command. `config/` rules. `contracts/nearverse/` Rust contract. `packages/economy/` pure TypeScript rules, simulation and tooltips. `web/` Next.js app (`/` landing, `/play`, `/judge`, `/profile`, `/spike`). `scripts/` generation, deploy, smoke tests, ghost traders. `tests/e2e/` browser tests.

## Third-party code and AI disclosure

Written during the hackathon window. Libraries: near-sdk, near-kit, near-api-js, NEAR Auth SDK (`@fast-auth-near/*`), Next.js, React, three.js, react-three-fiber, react-three-rapier, Rapier, zustand, yaml, vitest, Playwright, binaryen, fontsource (Bowlby One, Atkinson Hyperlegible). No template. Inspired in spirit by bruno-simon.com, with no code or assets taken from it.

License: MIT.
