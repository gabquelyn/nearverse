# Nearverse

A drivable 3D treasure hunt and trading game for the NEAR Hackathon `games` track. You drive across a huge island of forest, snowfields, desert and city, through day and night, hunting for resources that aren't on the map. You sell them to merchants whose prices follow supply or from a stall of your own, pay for fuel and repairs from what you earn, and buy vehicles and stall locations with credits bought with NEAR.

**Problem it addresses:** most on-chain games are a token with a game attached, and players have to deal with wallets, gas and popups. Here the game comes first. After one sign-in, every action is signed silently, and the economy runs on rules anyone can read in one file.

## How NEAR is used

- **NEP-245 multi token:** one contract (`contracts/nearverse`) holds wood, iron, slate and clay. Fuel is not a token: it is bought with credits. Gathering mints, selling burns, and all standard `mt_*` transfer and view methods are present. Approvals are not implemented.
- **Credits are the game's revenue:** `buy_credits` takes attached NEAR at 1 NEAR = 1000 credits, and the contract keeps it. Only the owner can withdraw it, through `withdraw_revenue`. Credits pay for vehicles and stall locations, and cover fuel and repairs if your coins run out. No stall sells repairs or fuel.
- **Player-owned markets:** stalls come two ways: a location bought with credits and built from materials, or a ready-built stall bought with coins from a merchant or another player. Owners stock it and earn coins in its till. They can list it for sale or sell it back to the city. Withdrawing coins as NEAR is planned for later.
- **Upkeep paid from play:** fuel and repairs cost coins, so a sold load pays for the next trip. A full tank costs a Pickup 15.00 coins and a full repair 10.00, scaled by each vehicle's tank and endurance. With too few coins, the same amount comes out of credits, so nobody gets stranded.
- **Investors in NPC merchants:** a merchant under 5% of its starting cash closes completely, with no trade and no income. Anyone can invest coins in it for good, which reopens it once it's back over the line, and earns a share of 20% of what it sells, split by stake (`merchant_invest`, `merchant_collect`).
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
| Deployed contract on real testnet | The previous version was run by the author. This version, with investing, closures and coin upkeep, is **not yet deployed** |
| Guest play, ghost traders on testnet | Run by the author on the previous version |
| NEAR Auth sign-in adding a game key (`/signin`) | **Works on `http://localhost:3000`** against testnet. **Rejected on the hosted demo** (see Known limits). Guest play is the fallback |

| Other cars over Ably | The token route and drawing are tested with injected positions. Not yet run against a live Ably account |

Contract account on testnet: `nearverse-game-v2.testnet`. Hosted demo: https://nearverse-murex.vercel.app

## How supply and demand set prices

Each merchant prices every material from its own stock, using `config/merchants.rules.yaml`. The contract does this calculation itself, and the tooltips use the same numbers.

`price = base × (target stock ÷ current stock)^k`, held between 35% and 300% of base. `k` is how sharply a merchant reacts.

**How found resources feed in.** Resources are found, not bought, and each spot holds a limited amount that regrows slowly. So what players find becomes the market's supply:

1. You load a resource, and the spot's stock falls. Nothing changes at the merchants yet.
2. You sell to a merchant. Its stock rises, so its price falls for the next seller. Flood it with iron, and iron gets cheap.
3. When players buy, its stock falls and its price rises. That's demand.
4. Each market hour (10 real minutes), stock drifts back toward target, by 0.8% of the gap for the Hoarder, 2% for the Foreman and 3.5% for the Flipper. Stock left too high or too low for a market day moves the target itself, by 5%, within 60–160% of the original.
5. Market events cut or swell one material's stock at every merchant.

**A worked example.** Iron has a base price of 20.00, and the Hoarder wants 160 with `k` = 0.5:

| Hoarder's iron stock | Price | Pays you (10% margin) | Charges you (10% margin) |
| --- | --- | --- | --- |
| 120 (short) | 20 × (160 ÷ 120)^0.5 = 23.09 | 20.78 | 25.40 |
| 160 (on target) | 20.00 | 18.00 | 22.00 |
| 320 (flooded) | 20 × (160 ÷ 320)^0.5 = 14.14 | 12.73 | 15.56 |

The price also moves with each unit in a sale, so selling 24 at once earns less than 24 times the first price. Merchants always charge more than they pay, so buying and selling straight back loses money. The Foreman pays 5% extra for materials he's short of that period.

**What a trip is worth.** Fuel and repairs cost little next to a load: selling 24 iron nearby earns about 300–417 coins for about 5 in fuel. Far spots cost more and are guarded by bombs, so they pay a bonus each time you load: 1.00 coin per richness point, up to about 97.00 at the richest. These are estimates for a fresh market with a Pickup, not measurements.

## Two minutes on the hosted demo

Nothing to install. Google or email sign-in isn't available here (see Known limits), so this uses a guest wallet. Each step names the requirement it shows.

1. Open https://nearverse-murex.vercel.app/judge. See the **Live market** panel with merchant cash, recent trades and top players (NPCs with wallets).
2. Press **Run a week**, then **Flood the market with iron**. See the iron line drop as a week plays out in a minute (fast-forward). This runs in the browser and sends no transactions.
3. Hover or tap a price under *Play by buttons*. See the reasoning, such as stock against target and the merchant's margin, built from `config/merchants.rules.yaml` (rules in one file, reasoning in a tooltip).
4. Press **Start game**, then a **Timber stand** button under *Play by buttons*. See it under Activity with a transaction link, with no popup or gas prompt (no prompts in the game loop).
5. Open that link, or call `mt_balance_of` on `nearverse-game-v2.testnet` for your account with `token_id` `wood`. See the wood as a NEP-245 balance (one contract for every item).
6. Open https://nearverse-murex.vercel.app and press **Play as a guest**. Drive with WASD or arrows, or the stick and Gas on a phone. Other players and labeled ghost traders appear as cars when the server has an Ably key and traders are running.

To see social or email sign-in, run the app locally on port 3000 with a funded treasury: see [DEPLOY.md](DEPLOY.md).

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
| `docker compose --profile ops up -d --build ghosts` | Keeps labeled simulated traders running on testnet. `docker compose --profile ops ps ghosts` shows whether they are healthy |
| `docker compose --profile dev up --build dev` | Runs the web app with live reload from your source files |
| `docker compose --profile ops down` | Stops everything |

Use `WEB_PORT=8080 docker compose up --build` if port 3000 is taken.

### A. Try the game with no chain, about 5 minutes

1. Run `docker compose up --build`. Wait for the container to report healthy. Open http://localhost:3000/api/health and see `"mode":"practice"`.
2. Open http://localhost:3000/judge. See a "Judge view" heading and a practice mode note.
3. Press **Skip to the end**. See a week of prices across four materials, merchant cash, and a list of what merchants learned.
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
- **The price rule:** `price = base × (target / stock)^k`, clamped, with spread and any shortage premium on top. `k` is limited to values the contract computes exactly with integer roots.
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
- The profile page has a faucet of 0.2 test NEAR per account every 10 minutes, paid by the treasury. It pauses when the treasury falls below 3 NEAR, and its limits live in server memory, so a restart resets them.
- Other cars are visual only. Their positions travel over Ably and never touch the contract, so a faked position can only draw a car in the wrong place, and you drive through them.
- A signed-in player approves each credit purchase, because the game key can't spend NEAR. A game key's gas allowance is fixed, so when it runs out the game asks for one approval to add a new key.
- Rich-spot bonuses create coins, limited only by each spot's stock and the gather cooldown. A script that skips the drive could collect them too.
- Merchants pay out their hourly income from nothing, and bonuses add more, so a long-running game could see inflation. This is fine for testnet and would need attention before real value.
- Investing is permanent: coins can't be taken back out of a merchant, and each merchant takes at most 10 investors.
- Export wallet shows a guest's private key. A sign-in wallet has no key to reveal, so export adds a new full-access key from a fresh seed phrase.
- Guest play keeps a throwaway full-access key in the browser for a faucet-funded testnet account. It isn't suitable for real value.

## Layout

`Dockerfile`, `compose.yaml` every build, test and deploy command. `config/` rules. `contracts/nearverse/` Rust contract. `packages/economy/` pure TypeScript rules, simulation and tooltips. `web/` Next.js app (`/` landing, `/play`, `/judge`, `/profile`, `/spike`). `scripts/` generation, deploy, smoke tests, ghost traders. `tests/e2e/` browser tests.

## Third-party code and AI disclosure

Written during the hackathon window. Libraries: near-sdk, near-kit, near-api-js, NEAR Auth SDK (`@fast-auth-near/*`), Next.js, React, three.js, react-three-fiber, react-three-rapier, Rapier, zustand, Ably, yaml, vitest, Playwright, binaryen, fontsource (Bowlby One, Atkinson Hyperlegible). No template. Inspired by bruno-simon.com (studied through its MIT-licensed source for techniques such as leaf-card foliage, a grass patch that follows the player, tyre tracks, wind lines and foliage that thins around the vehicle). No code or assets were copied. Much of the code was written with Claude, an AI coding assistant.

License: MIT.
