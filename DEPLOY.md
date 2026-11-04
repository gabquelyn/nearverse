# Deploy and use Nearverse on testnet

This takes the game from practice mode to the real thing: your contract on NEAR testnet, the web app online, and players signing in with Google, Apple, email or a passkey to get a NEAR account with no seed phrase.

**Status:** these steps follow the NEAR docs and the code here, but they have not yet been run end to end. Step 5 is the first real test of social login. If a step fails, the error text says where.

You need Docker Engine with Compose 2.24 or newer. Run every command from the repository root.

## 1. Create two testnet accounts

One account owns and hosts the contract. The other is the treasury, which pays test funds and relays sign-ins. A separate treasury limits what a leaked web server key can touch.

Install the NEAR CLI, then create both, with your own names:

```bash
npm install -g near-cli-rs@latest
near create-account nearverse-game.testnet --useFaucet
near create-account nearverse-treasury.testnet --useFaucet
```

Get each account's private key. Choose private key when asked, and copy the `ed25519:...` value:

```bash
near account export-account nearverse-game.testnet
near account export-account nearverse-treasury.testnet
```

Top up both from the [testnet faucet](https://docs.near.org/getting-started/faucet) or [near-faucet.io](https://near-faucet.io/), which takes named accounts such as these. The game account needs about 10 NEAR for the contract's storage and player records. The treasury spends 0.25 NEAR per new player plus gas.

## 2. Fill in your settings

```bash
cp .env.example .env
```

Edit `.env`. Never commit this file.

```bash
NEAR_NETWORK=testnet
NEAR_RPC_URL=https://test.rpc.fastnear.com

NEARVERSE_DEPLOYER_ACCOUNT=nearverse-game.testnet
NEARVERSE_DEPLOYER_PRIVATE_KEY=ed25519:...
# Receives earned NEAR. Leave empty to use the deployer.
NEARVERSE_OWNER_ACCOUNT=

NEARVERSE_TREASURY_ACCOUNT=nearverse-treasury.testnet
NEARVERSE_TREASURY_PRIVATE_KEY=ed25519:...
```

Leave `GAME_CONTRACT` and `FASTAUTH_CLIENT_ID` empty for now. Testnet uses NEAR Auth's shared development login, so you don't register anything.

## 3. Deploy the contract

```bash
docker compose run --build --rm test
docker compose run --build --rm deploy
```

You should see `Done. Tick: 0`. A contract can only be deployed once per account here: to redeploy after the saved data format changes, create a new account and repeat.

Add it to `.env`:

```bash
GAME_CONTRACT=nearverse-game.testnet
```

Check it on the chain:

```bash
docker compose run --rm smoke
```

You should see `Testnet smoke passed`, with wood gathered and sold, fuel bought with credits, and the revenue so far. Watch the gas used on [testnet.nearblocks.io](https://testnet.nearblocks.io).

## 4. Run the web app

On your machine, or on any Docker host:

```bash
docker compose up -d --build web
```

Open `http://localhost:3000/api/health` and expect `"mode":"chain"` and your contract.

To put it online, deploy the same image to any container host, or use Vercel with **Root Directory** set to `web`. Set these variables on the host:

| Variable | Value |
| --- | --- |
| `GAME_CONTRACT` | Your contract account |
| `ABLY_API_KEY` | Optional. Shows other cars (step 8) |
| `NEAR_NETWORK` | `testnet` |
| `NEAR_RPC_URL` | `https://test.rpc.fastnear.com` |
| `NEARVERSE_TREASURY_ACCOUNT` | Your treasury account |
| `NEARVERSE_TREASURY_PRIVATE_KEY` | Its private key, marked secret |

Run the game with HTTPS when it is online, because sign-in depends on it.

## 5. Sign in with a social login

1. Open `/signin` and press **Continue with Google or email**.
2. Sign in on the NEAR Auth page. It returns you to `/signin`, which lists each step.
3. Your account is created: an ID made from your login, the same one every time, funded with free test funds by the treasury.
4. Approve once. This adds a game key to your account that can only call game methods and can't attach NEAR.
5. You land in `/play`. Gather something, then open `/judge` to find the **view transaction** link. No popup should appear.

**What can go wrong here:**

| Message | Meaning | What to do |
| --- | --- | --- |
| A callback or redirect URL error on the sign-in page | The shared testnet login doesn't accept your address | Use `http://localhost:3000`. A hosted domain is rejected until the NEAR Auth team adds it, because this login is shared and its allowed list isn't ours to change. Ask them to allow your site's address. Their [application form](https://docs.auth.near.org/home/apply) covers mainnet. Guest play doesn't use this login |
| `Test funds are not set up` | Treasury settings are missing | Check step 2, then restart the web service |
| `The MPC sign call returned no signature` | The approval signing step failed | Copy the log from `/signin`. This step is unproven, and the fallback is a relayer that pays gas |
| `You already took your test NEAR` | The profile faucet gives 0.2 NEAR per account every 10 minutes | Wait for the time shown on the button |
| `The faucet is paused for now` | The treasury is below 3 NEAR, which is kept for new players and signing | Refill `nearverse-treasury.testnet` from near-faucet.io |
| `Test funds were just claimed` | The limit of one claim per 10 minutes applies | Wait, or fund the shown account from the faucet |

## 6. Buy credits with NEAR

1. Open **Profile**. Your account ID is shown with a **Copy** button.
2. Send it testnet NEAR from any wallet or the faucet.
3. Enter an amount and press **Buy credits**. 1 NEAR buys 1,000 credits, and the contract keeps the NEAR.

Signed-in players approve each purchase once, because the game key can't spend NEAR. Guests pay from their browser key without a prompt.

## 7. Withdraw what the game earned

Only the owner account can do this. The amount is in yoctoNEAR, so this withdraws 1 NEAR:

```bash
near contract call-function as-transaction nearverse-game.testnet withdraw_revenue json-args '{"amount":"1000000000000000000000000"}' prepaid-gas '30 Tgas' attached-deposit '1 yoctoNEAR' sign-as nearverse-game.testnet network-config testnet sign-with-keychain send
```

Check the balance first with `near contract call-function as-read-only nearverse-game.testnet revenue json-args {} network-config testnet now`.

## 8. Keep the market moving, and show other cars

Other cars need a free [Ably](https://ably.com) account. Create an app, copy an API key, and add it to `.env` and to Vercel's environment variables, then redeploy:

```bash
ABLY_API_KEY=
```

The key stays on the server. Browsers get a short-lived token from `/api/realtime`, which can only share positions. Without a key the game plays as normal, with no other cars.

Start the labeled `ghost-N.<your account>` traders. They make real testnet transactions from a machine that stays on, since they won't run on Vercel:

```bash
docker compose --profile ops up -d --build ghosts
docker compose --profile ops ps ghosts
docker compose --profile ops logs -f ghosts
```

`ps` shows `healthy` while they've reported in during the last 3 minutes, and they restart by themselves. Each makes about one trade a minute, which spends gas. They top themselves up from the deployer account with 0.3 NEAR when low, and stop topping up when the deployer falls below 2 NEAR. Stop them with `docker compose --profile ops stop ghosts`.

Ably's free package allowed 6 million messages a month when this was written. A moving player sends about two a second, and each delivery to another player counts too, so leave it off when you aren't testing or judging.

## Moving to a new contract

The rules are saved in the contract when it's created, so changing them means a new account. Everything on the old contract stays behind, and players sign in again for a new game key. To move:

```bash
near create-account nearverse-game-v2.testnet --useFaucet
near account export-account nearverse-game-v2.testnet
```

Top it up to about 10 NEAR from [near-faucet.io](https://near-faucet.io/). In `.env`, set `NEARVERSE_DEPLOYER_ACCOUNT` and `NEARVERSE_DEPLOYER_PRIVATE_KEY` to the new account, then run:

```bash
docker compose run --build --rm test
docker compose run --build --rm deploy
```

Set `GAME_CONTRACT=nearverse-game-v2.testnet` in `.env` and on Vercel, redeploy the site, then run `docker compose run --rm smoke`. Ghost traders use new sub-accounts of the new deployer, so remove their old keys first with `docker compose --profile ops down -v`. Any revenue on the old contract can still be withdrawn by its owner.

## Before judging

- Keep the game, treasury and deployer accounts funded through at least Nov 18, ideally Nov 25. Start the ghost traders before judging opens on Nov 16 and check `ps`.
- Make sure the repository is public before 2026-11-14 23:59 UTC.
