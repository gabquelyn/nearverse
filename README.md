# Nearverse

A drivable 3D treasure hunt with a real, player-run economy, built for the NEAR Hackathon `games` track.

**Play it:** https://nearverse-murex.vercel.app  
**Contract (NEAR testnet):** `nearverse-game-v3.testnet`

## The problem

Most crypto games make people learn about wallets, seed phrases and gas before they can play, and many never get past that. Often the game is also just a token with some gameplay attached.

Nearverse puts the game first. Sign in with Google or email and start driving. After that, moves are signed in the background with no wallet pop-ups, while the market and what you own live in a contract anyone can read.

## The game

- **Hunt.** Drive across an island of forest, snowfields, desert and city, through day and night. Resources aren't on the map. The rarest are guarded by bombs or sit in rock-ringed pools, and driving through water is slow and burns fuel three times as fast.
- **Trade.** Sell to merchants and player stalls. Every trade changes the price, so finding the best deal is part of the game.
- **Upkeep.** Coins pay for fuel and repairs, so each load funds the next trip.
- **Build.** Buy a plot with credits, bring its materials over as many trips as you like, and open a stall that earns coins for you.
- **Invest.** Put coins into a merchant, reopen it if it has closed, and earn a share of what it sells.

## What NEAR does here

**Named accounts.** A Google or email login creates a readable account, such as `alice.nverse.testnet`, under the game's parent account. There's no seed phrase to manage.

**Function-call access keys.** The browser holds a key that can only call the game contract, with a capped gas allowance. It can't attach NEAR, so it can't buy credits or transfer items. That's why moves need no pop-ups, while `buy_credits`, `withdraw_revenue` and `mt_transfer` still need a full signature.

**One NEP-245 contract.** All 24 materials, from wood to meteorite, are balances in one multi-token contract. Gathering mints and selling burns. The standard `mt_*` transfer and view methods are present, but approvals aren't implemented.

**The economy runs in the contract.** It sets prices from merchant stock and holds coins and credits, plot ownership, stall building progress and investor shares. Prices move on the chain rather than on a game server, and a trade fails with `PRICE_MOVED` instead of filling at a surprise price.

**Low gas.** A move costs about 11.5 Tgas (roughly 0.00115 NEAR), measured on testnet. That's cheap enough for every trade to settle on-chain, with the game topping up players' gas automatically.

**Revenue.** `buy_credits` takes NEAR at 1 NEAR = 1000 credits, and only the owner can withdraw it. Credits buy vehicles and plots.

## How prices work

Rules live in one file, `config/merchants.rules.yaml`. The contract enforces them, and the tooltips run the same formula from the same state.

`price = base × (target stock ÷ current stock)^k`, held between 35% and 300% of base.

1. Selling raises a merchant's stock, so its price falls for the next seller. Buying does the opposite.
2. Each market hour (10 real minutes), stock drifts back toward target, and elapsed time is applied on each contract call.
3. Stock left too high or too low for a market day moves the target itself, within 60–160% of the original.
4. Market events cut or swell a material's stock at every merchant.
5. Rare materials move most. Merchants hold few of them, so one sale is a large share of their target.

**Example.** Iron has a base of 20.00, and the Hoarder wants 160 with `k` = 0.5:

| Hoarder's iron stock | Price | Pays you (10% margin) | Charges you (10% margin) |
| --- | --- | --- | --- |
| 120 (short) | 23.09 | 20.78 | 25.40 |
| 160 (on target) | 20.00 | 18.00 | 22.00 |
| 320 (flooded) | 14.14 | 12.73 | 15.56 |

Price also moves with each unit in a sale, so selling 24 at once earns less than 24 times the first price. Merchants always charge more than they pay, so buying and selling straight back loses money.

## Try it

**Hosted**

1. Open https://nearverse-murex.vercel.app/signin, sign in with Google or an email code, and choose a username. Or press **Play as a guest**.
2. Drive with WASD or arrows, or the on-screen stick and Gas on a phone. When a prompt says you've found a resource, hold **E** to load it.
3. Drive to a merchant and sell. Hover or tap a price to see why it's that price.
4. Open https://nearverse-murex.vercel.app/judge, press **Run a week**, then **Flood the market with iron**, and watch the price fall. This fast-forward is a labeled simulation in the browser and sends no transactions.

**Locally, with no chain**

Docker Engine with Compose 2.24 or newer is the only requirement.

```bash
docker compose up --build
```

Open http://localhost:3000 for the game in practice mode, or http://localhost:3000/judge for the market view. Use `WEB_PORT=8080` if port 3000 is taken.

| Command | What it does |
| --- | --- |
| `docker compose run --build --rm test` | Type checks, economy tests, contract tests and the compiled-contract check |
| `docker compose run --build --rm e2e` | Plays the game in a real browser |
| `docker build --target contract-wasm --output out .` | Writes the contract to `out/nearverse.wasm` |
| `docker compose run --build --rm deploy` | Builds and deploys the contract to testnet |
| `docker compose run --build --rm smoke` | Runs the game loop against the deployed contract |
| `docker compose --profile ops up -d --build ghosts tracker` | Runs labeled simulated traders and the price tracker on an always-on machine |

To run your own testnet copy, see [DEPLOY.md](DEPLOY.md). Variable names are in `.env.example`.

## What has been tested

| Part | Status |
| --- | --- |
| Economy rules | 2,500 replayed steps match exactly between TypeScript and Rust |
| Contract | Unit tests, plus the compiled wasm against mocked host functions |
| Web game | Browser tests in practice mode |
| Deployed contract | Game loop run on testnet with the smoke test |
| Google sign-in | Run on the hosted site |
| Email codes, credit purchases and export through this login | Tested with simulated responses |
| Other cars over Ably | Tested with injected positions |
| AI choosing ghost traders' moves | Fallbacks tested against a stub server, not run against NEAR AI |
| Frame rate on real phones and laptops | Not measured. Detail drops automatically to hold frame rate |

## Known limits

- **Testnet only.** Credits and coins can't be withdrawn.
- **The contract can't verify driving.** Location, crash damage and driving fuel are reported by the browser, so a modified client or script could skip the drive. On-chain limits still apply: spot stock, a gather cooldown, fuel, wear and cargo space. Resource positions can also be read from this open-source repo.
- **Google and email sign-in hold key power on the server.** The server derives each player's key from one secret and their verified email, and stores none of them. Anyone with that secret could control these wallets, so this suits testnet only. Mainnet would need NEAR Auth production credentials.
- **Players don't pay their own gas yet.** The game funds accounts from a treasury, and the contract pays player storage, so mass sign-ups could drain them. A relayer is planned for mainnet.
- **Griefing.** Each merchant takes at most 10 investors, and small stakes could fill those slots. Investing is permanent. Anyone can send you items, which could fill your truck bed until you sell them.
- **Inflation.** Rich-spot bonuses and merchants' hourly income create coins, which would need attention before real value.
- **Browser-only data.** Your discovery log and the sales marked on your chart stay in your browser, so another device starts fresh.
- **Guest play** keeps a throwaway full-access key in the browser for a faucet-funded testnet account.
- **Other cars are visual only.** Their positions travel over Ably and never touch the contract, and you drive through them.
- **Ghost traders** are labeled simulated players with real wallets and real trades. They need an always-on machine, so they aren't always running. No AI model can change a price.

## Layout

| Path | Contents |
| --- | --- |
| `config/` | Items and pricing rules |
| `contracts/nearverse/` | Rust contract |
| `packages/economy/` | Rules, simulation and tooltips in TypeScript |
| `web/` | Next.js app (`/`, `/play`, `/signin`, `/judge`, `/profile`, `/status`) |
| `scripts/` | Generation, deploy, smoke tests, ghost traders, price tracker |
| `tests/e2e/` | Browser tests |

## Third-party code and AI disclosure

Written during the hackathon window, with no template. Libraries: near-sdk, near-kit, near-api-js, NEAR Auth SDK (`@fast-auth-near/*`), Next.js, React, three.js, react-three-fiber, react-three-rapier, Rapier, zustand, Ably, Google Identity Services, NEAR AI Cloud (optional), yaml, vitest, Playwright, binaryen and fontsource (Bowlby One, Atkinson Hyperlegible).

Inspired by bruno-simon.com, studied through its MIT-licensed source for techniques such as leaf-card foliage, a grass patch that follows the player, tyre tracks and wind lines. No code or assets were copied. Much of the code was written with Claude, an AI coding assistant.

License: MIT.
