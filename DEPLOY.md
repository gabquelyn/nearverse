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

Top up both from the [testnet faucet](https://docs.near.org/getting-started/faucet). The game account needs about 10 NEAR for the contract's storage and player records. The treasury spends 0.25 NEAR per new player plus gas.

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
| A callback or redirect URL error on the sign-in page | The shared testnet login doesn't accept your address | Use `http://localhost:3000`. A hosted domain may be rejected, because this login is shared and its allowed list isn't ours to change. Ask the NEAR Auth team, as their [application form](https://docs.auth.near.org/home/apply) covers mainnet. Guest play doesn't use this login |
| `Test funds are not set up` | Treasury settings are missing | Check step 2, then restart the web service |
| `The MPC sign call returned no signature` | The approval signing step failed | Copy the log from `/signin`. This step is unproven, and the fallback is a relayer that pays gas |
| `You already took your test NEAR` | The profile faucet gives 1 NEAR per account every 2 hours | Wait for the time shown on the button. The treasury pays this, so keep it topped up |
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

## 8. Optional: keep the market moving

```bash
docker compose run --build --rm ghosts
```

This runs labeled `ghost-N.<your account>` traders with real testnet transactions. Keep it running on a machine that stays on, since it won't run on Vercel.

## Before judging

- Keep the game and treasury accounts funded through at least Nov 18, ideally Nov 25.
- Add your contract account to the README's status section.
- Make sure the repository is public before 2026-11-14 23:59 UTC.
