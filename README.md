# Nearverse

A drivable 3D treasure hunt and trading game for the NEAR Hackathon `games` track. You drive across a huge island of forest, snowfields, desert and city, through day and night, hunting for resources that aren't on the map. You sell them to merchants whose prices follow supply or from a stall of your own, and pay for fuel, repairs, vehicles and stall locations with credits bought with NEAR.

**Problem it addresses:** most on-chain games are a token with a game attached, and players have to deal with wallets, gas and popups. Here the game comes first. After one sign-in, every action is signed silently, and the economy runs on rules anyone can read in one file.

## How NEAR is used

- **NEP-245 multi token:** one contract (`contracts/nearverse`) holds wood, iron, slate, clay and fuel. Gathering mints, selling burns, and all standard `mt_*` transfer and view methods are present. Approvals are not implemented.
- **Credits are the game's revenue:** `buy_credits` takes attached NEAR at 1 NEAR = 1000 credits, and the contract keeps it. Only the owner can withdraw it, through `withdraw_revenue`. Credits pay for fuel, repairs, vehicles and stall locations, and no stall sells fuel or repairs.
- **Player-owned markets:** a stall location costs credits, then the owner builds it from materials, bought or found. Owners stock it and earn coins in its till when others buy. They can list it for sale or sell it back to the city. Withdrawing coins as NEAR is a future plan, not built yet.
- **Vehicles priced from their stats:** the contract computes each price in credits from capacity, endurance, fuel use, flair and size, using weights in `config/items.yaml`.
- **NPCs with wallets:** merchants hold stock and cash in contract state. A merchant out of cash stops buying.
- **An economy that changes without a patch:** each contract call applies elapsed time. Stock drifts, events fire, and merchants change their target stock from their own trading history.
- **Function-call keys:** game methods work with a key that can't attach NEAR. `buy_credits`, `withdraw_revenue` and `mt_transfer` need a full signature, so that key can't move value.

## Status: what has and hasn't been verified

| Part | Status |
| --- | --- |
| Economy engine, Rust contract rules | Tested. 2,500 replayed steps match exactly between TypeScript and Rust |
| Contract with mocked runtime | Tested (`cargo test`) |
| Compiled wasm | Tested in Node against a mock of the host functions (`npm run smoke:wasm`). Gas not measured |
| Web game in practice mode, judge view, fast-forward | Tested in a browser against the web container |
| Deployed contract on real testnet | **Not yet run.** See step B below |
| Guest play, ghost traders on testnet | **Not yet run** |
| NEAR Auth sign-in adding a game key (`/signin`) | **Works on `http://localhost:3000`** against testnet. **Rejected on the hosted demo** (see Known limits). Guest play is the fallback |

Contract account on testnet: *not deployed yet*. See DEPLOY.md.

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
5. Under *Play by buttons*, press the first **Timber stand** button. See "Gathered 3 wood" under Activity.
6. In the price table, hover a price. See its reasoning, such as "Wood 7.20: stock on target (+0%), spread (−10%)."
7. Press **Sell** on wood. See coins rise, and hover again to see that the merchant's stock rose.
8. On the same page, under *Vehicle shop*, see each vehicle's stats and price. Each shows a picture and a price in credits. Under *Stalls*, pick a location, buy it with credits, and see which materials it needs.
9. Open http://localhost:3000/ and press **Start driving**. Drive with WASD or arrows. Resources are hidden, and the closest ones are within about 150 m of home. When a prompt says you found one, hold **E** to load. See cubes appear in the truck bed. Follow roads to find merchants. Drive hard into a boulder or tree and see truck health drop, then press **Repair** at the top. The map at the top shows your location, the regions and every place you can sell, but never resources. Press **Nearest stall** or **Go home** for a route. Press **Tab** to hide all the details for a clear view. Add `?quality=low` to the address on a slow machine, or `?perf=1` to see the frame rate.

### B. Deploy and use it on testnet

Full steps are in [DEPLOY.md](DEPLOY.md): create accounts, deploy the contract, run the web app, and sign in with a social login.

## How it works

- **`config/merchants.rules.yaml` is the one place pricing rules are written.** `scripts/gen-contract-config.ts` turns it and `config/items.yaml` into `packages/economy/generated/rules.json`, which is both the contract's init argument and the web app's rules.
- **The contract enforces prices** and takes a `min_total` or `max_total` on trades, so a price change fails with `PRICE_MOVED` instead of a surprise.
- **The price rule:** `price = base × (target / stock)^k`, clamped, with spread and blueprint premium on top. `k` is limited to values the contract computes exactly with integer roots.
- **Tooltips match the contract** because they run the same formula from the same state. `tests/parity.rs` replays TypeScript fixtures against Rust.
- **Fast-forward is a labeled simulation** in the browser on a copy of the market. It sends no transactions.
- **The browser applies actions at once** and confirms them in a background queue. If a transaction fails, the game shows why and reloads from the chain.

## Known limits

- **Google or email sign-in doesn't work on the hosted demo yet.** Testnet uses NEAR Auth's shared login, which only returns to addresses on its own allowed list. That list includes `http://localhost:3000` but not our Vercel address, and only the NEAR Auth team can change it, so the hosted site shows an invalid callback URL error. Judges can play as a guest on the hosted demo, or run the app locally on port 3000 to try sign-in ([DEPLOY.md](DEPLOY.md)).
- **The contract can't verify driving.** A script could call `gather` without driving. The limits are on-chain: node stock, a per-player cooldown, fuel, wear and cargo space. `take_damage` and `burn_fuel` can only hurt the player who reports them.
- **Credits and coins can't be withdrawn yet.** NEAR paid for credits stays with the game, which removes the reason to farm with scripts.
- **The contract pays storage** for player records, which is fine for a testnet game but would need a fee on mainnet.
- Crash damage, driving fuel and location are reported by the browser, so a modified client could skip those costs or build a stall without driving there.
- Resource positions are hidden from the map, not secret: this is open source, so they can be read from `packages/economy/generated/rules.json`, and a script could gather without driving.
- `leaderboard` scans up to 200 players. Approvals in NEP-245 aren't implemented.
- Phones get a right-hand thumb stick that steers from the vehicle's point of view, plus Gas, in landscape. Android switches by itself after a tap. iPhones ask you to turn the phone, because Safari doesn't let pages lock the screen.
- The profile page has a faucet of 1 test NEAR per account every 10 minutes, paid by the treasury. Its limits live in server memory, so a restart resets them.
- Export wallet shows a guest's private key. A sign-in wallet has no key to reveal, so export adds a new full-access key from a fresh seed phrase.
- Guest play keeps a throwaway full-access key in the browser for a faucet-funded testnet account. It isn't suitable for real value.

## Layout

`Dockerfile`, `compose.yaml` every build, test and deploy command. `config/` rules. `contracts/nearverse/` Rust contract. `packages/economy/` pure TypeScript rules, simulation and tooltips. `web/` Next.js app (`/` landing, `/play`, `/judge`, `/profile`, `/spike`). `scripts/` generation, deploy, smoke tests, ghost traders. `tests/e2e/` browser tests.

## Third-party code and AI disclosure

Written during the hackathon window. Libraries: near-sdk, near-kit, near-api-js, NEAR Auth SDK (`@fast-auth-near/*`), Next.js, React, three.js, react-three-fiber, react-three-rapier, Rapier, zustand, yaml, vitest, Playwright, binaryen, fontsource (Bowlby One, Atkinson Hyperlegible). No template. Inspired by bruno-simon.com (studied through its MIT-licensed source for techniques such as leaf-card foliage, a grass patch that follows the player, tyre tracks, wind lines and foliage that thins around the vehicle). No code or assets were copied. Much of the code was written with Claude, an AI coding assistant.

License: MIT.
