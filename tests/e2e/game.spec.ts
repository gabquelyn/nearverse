// Plays the game in a real browser, in practice mode. Software rendering makes the world slow here, not broken.
import { test, expect } from "@playwright/test";

test("health reports practice mode", async ({ request }) => {
  const r = await request.get("/api/health");
  expect(r.ok()).toBe(true);
  expect((await r.json()).mode).toBe("practice");
});

test("judge view plays by buttons and explains prices", async ({ page }) => {
  await page.goto("/judge");
  await expect(page.getByRole("heading", { name: "Judge view" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Game started" })).toBeVisible();
  await page.getByRole("button", { name: /Timber stand/ }).first().click();
  await expect(page.getByTestId("log")).toContainText("Gathered 3 wood");
  const price = page.locator(".tip-btn").first();
  await price.hover();
  await expect(page.locator(".tip").first()).toBeVisible();
  expect(await price.getAttribute("aria-label")).toMatch(/Wood \d+\.\d+: stock .*spread/);
  const before = await page.getByTestId("player-summary").innerText();
  await page.getByRole("button", { name: "Sell one Wood", exact: true }).click();
  await expect(page.getByTestId("player-summary")).not.toHaveText(before);
});

test("a simulated week runs, floods and reports", async ({ page }) => {
  await page.goto("/judge");
  await page.getByRole("button", { name: "Run a week" }).click();
  await expect(page.getByRole("button", { name: /Hour \d+ of 168/ })).toBeVisible();
  await page.getByRole("button", { name: "Flood the market with iron" }).click();
  await page.getByRole("button", { name: "Skip to the end" }).click();
  await expect(page.getByTestId("sim-summary")).toContainText(/\d{3,} trades/);
  await expect(page.getByTestId("sim-summary")).toContainText("iron flooded");
});

const ready = (page: import("@playwright/test").Page) => page.waitForSelector(".veil", { state: "detached", timeout: 90_000 });
const move = (page: import("@playwright/test").Page, x: number, z: number) => page.evaluate(([a, b]) => (window as never as { __nearverse: { teleport(x: number, z: number): void } }).__nearverse.teleport(a, b), [x, z]);

test("the hunt: find a hidden spot, load it, then trade", async ({ page }) => {
  await page.goto("/");
  const start = page.getByRole("button", { name: "Start driving" });
  await expect(start).toBeEnabled({ timeout: 30_000 });
  await ready(page);
  await start.click();
  await expect(page.getByText("Truck bed 0/24")).toBeVisible();
  await move(page, 95, -110);
  await expect(page.locator(".prompt")).toContainText("You found", { timeout: 20_000 });
  await page.keyboard.down("KeyE");
  await expect(page.getByText("Truck bed 3/24")).toBeVisible({ timeout: 30_000 });
  await page.keyboard.up("KeyE");
  await move(page, -539.2, 339.5);
  await expect(page.getByRole("region", { name: "Hoarder stall" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Sell all Wood" }).click();
  await expect(page.getByText("Truck bed 0/24")).toBeVisible();
});

test("the judge view fits a phone", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto("/judge");
  await page.getByRole("button", { name: "Skip to the end" }).click();
  await expect(page.getByTestId("sim-summary")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  await ctx.close();
});

test("hitting an obstacle hard damages the truck", async ({ page }) => {
  await page.goto("/play");
  await ready(page);
  await expect(page.getByText("Pickup 100%")).toBeVisible();
  await page.evaluate(() => { const n = (window as never as { __nearverse: { teleport(x: number, z: number, y: number): void; keys: Set<string> } }).__nearverse; n.teleport(-9, -22, 0); n.keys.add("KeyW"); });
  await expect(page.locator(".toast")).toContainText("Hit a", { timeout: 30_000 });
  await expect(page.getByText("Pickup 100%")).toHaveCount(0);
});

const SAVE = "nearverse.practice.v4";
async function seed(page: import("@playwright/test").Page, change: (p: Record<string, number[] | number>) => void) {
  await page.goto("/judge");
  await expect(page.getByRole("button", { name: "Game started" })).toBeVisible();
  await page.getByRole("button", { name: /near|in Home|Timber/ }).first().click();
  await page.waitForTimeout(1500);
  const fn = change.toString();
  await page.evaluate(([key, f]) => { const s = JSON.parse(localStorage.getItem(key)!); (0, eval)(`(${f})`)(s.player); localStorage.setItem(key, JSON.stringify(s)); }, [SAVE, fn]);
  await page.reload();
  await expect(page.getByRole("button", { name: "Game started" })).toBeVisible();
}

test("coins pay for fuel and repairs, credits for vehicles, shown with pictures", async ({ page }) => {
  await page.goto("/profile");
  await page.getByRole("button", { name: /Buy 1000 credits/ }).click().catch(() => {});
  await seed(page, (p) => { p.credits = 5000; p.durability = 50; p.fuel = 10; });
  await page.getByRole("button", { name: "Repair" }).click();
  await page.getByRole("button", { name: "Refuel 10" }).click();
  await expect(page.getByTestId("player-summary")).toContainText("fuel 20/100");
  await expect(page.getByTestId("player-summary")).toContainText("Credits 5000, coins 143.50");
  const scout = page.getByRole("article", { name: "Scout" });
  await expect(scout.getByRole("img", { name: "The Scout" })).toBeVisible({ timeout: 20_000 });
  await scout.getByRole("button", { name: /Buy for 1620 credits/ }).click();
  await scout.getByRole("button", { name: "Drive the Scout" }).click();
  await expect(scout.getByRole("button", { name: "Driving now" })).toBeVisible();
  await expect(page.getByTestId("player-summary")).toContainText("/16");
});

test("no merchant sells fuel, and there is no repair at a stall", async ({ page }) => {
  await page.goto("/judge");
  await expect(page.locator(".prices").first()).not.toContainText("Fuel");
  await expect(page.locator(".prices").first()).not.toContainText("Repair");
});

test("a stall takes a location bought with credits, then bought or found materials", async ({ page }) => {
  await seed(page, (p) => { p.credits = 5000; (p.items as number[])[0] = 20; (p.items as number[])[3] = 10; });
  await page.getByRole("tab", { name: "Orchard Gate" }).click();
  await page.getByRole("button", { name: /Buy this location/ }).click();
  await expect(page.getByTestId("player-summary")).toContainText("Credits 4700");
  await page.getByRole("button", { name: "Build this stall" }).click();
  await expect(page.getByText("Your stall.")).toBeVisible();
  await page.getByRole("button", { name: "Stock one Wood" }).click();
  await page.getByRole("button", { name: "List for sale" }).click();
  await page.getByRole("button", { name: "Take off market" }).click();
  await page.getByRole("button", { name: "Take one Wood" }).click();
  await page.getByRole("button", { name: /Sell to the city/ }).click();
  await expect(page.getByRole("button", { name: /Buy this location/ })).toBeVisible();
});

test("the map shows regions and you, hides resources, collapses, and routes to my stall", async ({ page }) => {
  await seed(page, (p) => { p.credits = 5000; });
  await page.getByRole("tab", { name: "Orchard Gate" }).click();
  await page.getByRole("button", { name: /Buy this location/ }).click();
  await page.waitForTimeout(1500);
  await page.goto("/play");
  await ready(page);
  const map = page.getByTestId("map");
  for (const name of ["Snowfields", "Desert", "City", "Forest"]) await expect(map.getByText(name, { exact: true })).toBeVisible();
  // Home, 3 merchants, 2 stalls for sale, my location. Resources never appear.
  await expect(map.locator(".pin:not(.maplegend .pin)")).toHaveCount(8);
  await expect(map.getByRole("button", { name: /Route to Hoarder/ })).toBeVisible();
  await expect(map.getByRole("button", { name: /Route to Brook Corner/ })).toBeVisible();
  await map.getByRole("button", { name: "Nearest stall" }).click();
  await map.getByRole("button", { name: "Clear" }).click();
  await map.getByRole("button", { name: /Go to my stall: Orchard Gate/ }).click();
  await expect(map).toContainText("m");
  await map.getByRole("button", { name: "Clear" }).click();
  await map.getByRole("button", { name: "Hide map" }).click();
  await expect(map.locator(".board")).toHaveCount(0);
  await expect(map.getByTestId("here")).toBeVisible();
  await map.getByRole("button", { name: "Show map" }).click();
  await map.getByRole("button", { name: "Go home" }).click();
  await expect(map).toContainText("Home");
});

test("crashes and pickups don't freeze the game", async ({ page }) => {
  await page.goto("/play");
  await ready(page);
  await page.waitForTimeout(2000);
  await page.evaluate(() => { const w = window as never as { __long: number[] }; w.__long = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__long.push(e.duration); }).observe({ entryTypes: ["longtask"] }); });
  await move(page, -539.2, 339.5);
  await expect(page.getByRole("region", { name: "Hoarder stall" })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1000);
  const worst = await page.evaluate(() => Math.max(0, ...(window as never as { __long: number[] }).__long));
  expect(worst).toBeLessThan(250);
});

test("all the details can be hidden for a full view", async ({ page }) => {
  await page.goto("/play");
  await ready(page);
  await expect(page.getByTestId("credits")).toBeVisible();
  await page.getByRole("button", { name: /Hide details/ }).click();
  await expect(page.getByTestId("credits")).toHaveCount(0);
  await expect(page.getByTestId("map")).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("credits")).toBeVisible();
});

test("sign-in explains itself when no contract is set", async ({ page }) => {
  await page.goto("/signin");
  await expect(page.getByText("Sign-in needs a deployed contract")).toBeVisible();
  await expect(page.getByRole("button", { name: /Continue with Google/ })).toBeDisabled();
});

test("a phone steers from the vehicle's view with a right-hand stick, and asks for landscape", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto("/play");
  await ready(page);
  const speed = () => page.evaluate(() => (window as never as { __nearverse: { truck: { speed: number } } }).__nearverse.truck.speed);
  await expect(page.getByTestId("stick")).toBeVisible();
  await expect(page.getByText("Turn your phone sideways")).toBeHidden();
  await expect(page.getByRole("button", { name: "Show details" })).toBeVisible();
  // The stick works from the vehicle's point of view, whichever way it faces, and the camera follows behind it.
  const cdp = await ctx.newCDPSession(page);
  const box = (await page.getByTestId("stick").boundingBox())!, cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const state = () => page.evaluate(() => { const t = (window as never as { __nearverse: { truck: { yaw: number; speed: number; cameraYaw: number } } }).__nearverse.truck; return { yaw: t.yaw, speed: t.speed, cameraYaw: t.cameraYaw }; });
  const gap = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const face = (a: number) => page.evaluate((y) => (window as never as { __nearverse: { teleport(x: number, z: number, yaw: number): void } }).__nearverse.teleport(300, 300, y), a);
  const push = async (dx: number, dy: number, ok: (s: { turned: number; speed: number }) => boolean) => {
    await page.waitForTimeout(300);
    const from = (await state()).yaw;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx, y: cy, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx + dx, y: cy + dy, id: 1 }] });
    await expect.poll(async () => { const s = await state(); return ok({ turned: gap(s.yaw, from), speed: s.speed }); }, { timeout: 20_000 }).toBe(true);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  for (const start of [0, Math.PI, Math.PI / 2, -Math.PI / 2]) {
    await face(start);
    await expect.poll(async () => Math.abs(gap((await state()).cameraYaw, start)), { timeout: 20_000 }).toBeLessThan(0.2);
    await face(start); await push(45, 0, (s) => s.turned < -0.15); // right turns the vehicle to its right
    await face(start); await push(-45, 0, (s) => s.turned > 0.15); // left turns it to its left
    await face(start); await push(0, -45, (s) => s.speed > 2); // up goes forward
    await face(start); await push(0, 45, (s) => s.speed < -2); // down reverses
  }
  const g = (await page.getByRole("button", { name: "Gas" }).boundingBox())!;
  expect(g.x + g.width / 2).toBeLessThan(box.x);
  await expect(page.getByRole("button", { name: /Horn|Jump|Boost|Brake/ })).toHaveCount(0);
  const profile = page.getByRole("link", { name: "Profile" });
  await expect(profile).toBeInViewport({ ratio: 1 });
  await page.getByRole("button", { name: "Show details" }).tap();
  await expect(profile).toBeInViewport({ ratio: 1 });
  await page.getByRole("button", { name: "Market" }).tap();
  await expect(page.getByTestId("live-market")).toBeVisible();
  await page.mouse.click(100, 150);
  await expect(page.getByTestId("live-market")).toBeHidden();
  await profile.tap();
  await expect(page).toHaveURL(/\/profile/);
  await ctx.close();
  const upright = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const tall = await upright.newPage();
  await tall.goto("/play");
  await expect(tall.getByText("Turn your phone sideways")).toBeVisible();
  await upright.close();
});

test("on a keyboard, left and right follow the vehicle and the camera stays behind it", async ({ page }) => {
  await page.goto("/play");
  await ready(page);
  const state = () => page.evaluate(() => { const t = (window as never as { __nearverse: { truck: { yaw: number; cameraYaw: number } } }).__nearverse.truck; return { yaw: t.yaw, cameraYaw: t.cameraYaw }; });
  const gap = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  await page.evaluate(() => (window as never as { __nearverse: { teleport(x: number, z: number, yaw: number): void } }).__nearverse.teleport(300, 300, Math.PI));
  await expect.poll(async () => Math.abs(gap((await state()).cameraYaw, Math.PI)), { timeout: 20_000 }).toBeLessThan(0.2);
  await page.keyboard.down("KeyW"); await page.keyboard.down("KeyA");
  await expect.poll(async () => gap((await state()).yaw, Math.PI), { timeout: 20_000 }).toBeGreaterThan(0.2);
  await page.keyboard.up("KeyA"); await page.keyboard.up("KeyW");
});

test("pressing outside closes panels and details, and the game explains its first loop", async ({ page }) => {
  await page.goto("/play");
  await ready(page);
  await page.getByRole("button", { name: "Skip tour" }).click();
  await expect(page.getByTestId("coach")).toContainText("Find your first load");
  await page.getByRole("button", { name: "Point me to one" }).click();
  await expect(page.getByTestId("map")).toContainText("A hidden spot");
  await page.getByRole("button", { name: "Market" }).click();
  await expect(page.getByTestId("live-market")).toContainText("Merchant cash");
  await move(page, -539.2, 339.5);
  await expect(page.getByRole("region", { name: "Hoarder stall" })).toBeVisible({ timeout: 20_000 });
  await page.mouse.click(500, 500);
  await expect(page.getByTestId("live-market")).toBeHidden();
  await expect(page.getByRole("region", { name: "Hoarder stall" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Show details" })).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.getByRole("region", { name: "Hoarder stall" })).toBeHidden();
  await move(page, 0, 0);
  await expect.poll(() => page.evaluate(() => (window as never as { __nearverse: { truck: { pos: { x: number } } } }).__nearverse.truck.pos.x > -50), { timeout: 20_000 }).toBe(true);
  await page.waitForTimeout(1500); // the zone clears on the next check
  await move(page, -539.2, 339.5);
  await expect(page.getByRole("region", { name: "Hoarder stall" })).toBeVisible({ timeout: 20_000 });
});

test("other players and labeled ghost traders appear as they report in", async ({ page }) => {
  await page.goto("/play");
  await ready(page);
  const inWorld = () => page.evaluate(() => (window as never as { __nearverse: { others: Map<string, unknown> } }).__nearverse.others.size);
  await page.evaluate(() => {
    const h = (window as never as { __nearverse: { ingest(n: string, d: unknown): void } }).__nearverse;
    h.ingest("pos", { id: "a", n: "Driver 9f27", x: 6, z: 6, y: 1, v: 3, k: 1 });
    h.ingest("trip", { id: "g", n: "Ghost 1 (simulated)", k: 0, fx: -8, fz: 8, tx: -8, tz: 30, at: Date.now(), ms: 8000 });
    h.ingest("pos", { id: "bad", x: "nope" });
  });
  expect(await inWorld()).toBe(2);
  await expect.poll(inWorld, { timeout: 40_000 }).toBe(1); // a player who stops reporting leaves; the ghost's trip stays
});

test("the game says plainly when moves are slow, the connection drops, or the key runs out", async ({ page }) => {
  await page.goto("/play");
  await ready(page);
  const set = (state: object) => page.evaluate((v) => (window as never as { __nearverse: { game: { setState(s: object): void } } }).__nearverse.game.setState(v), state);
  await set({ slow: true });
  await expect(page.getByText("Still confirming your last move.")).toBeVisible();
  await set({ slow: false, offline: true });
  await expect(page.getByText("Connection lost. Reconnecting.")).toBeVisible();
  await set({ offline: false, keyExpired: true });
  await expect(page.getByRole("button", { name: "Approve a new one" })).toBeVisible();
});

test("a new player gets a tour, and the world helps them hunt", async ({ page }) => {
  await page.goto("/play");
  await ready(page);
  const tour = page.getByTestId("tour");
  await expect(tour).toContainText("Welcome to Nearverse");
  for (let i = 0; i < 5; i++) await tour.getByRole("button", { name: "Next" }).click();
  await tour.getByRole("button", { name: "Start hunting" }).click();
  await expect(tour).toBeHidden();
  await page.reload();
  await ready(page);
  await expect(tour).toBeHidden();
  await move(page, 95, -60);
  await expect(page.getByTestId("nearby")).toContainText("Timber stand");
  await expect(page.getByRole("button", { name: "Zoom in" })).toBeDisabled();
  await page.getByRole("button", { name: "Zoom out" }).click();
  await expect(page.getByRole("button", { name: "Zoom in" })).toBeEnabled();
  const closest = await page.evaluate(() => {
    const m = (window as never as { __nearverse: { mines: { x: number; z: number }[] } }).__nearverse.mines;
    let least = 1e9; m.forEach((a, i) => m.forEach((b, j) => { if (i < j) least = Math.min(least, Math.hypot(a.x - b.x, a.z - b.z)); }));
    return { least, count: m.length };
  });
  expect(closest.count).toBeGreaterThan(5);
  expect(closest.least).toBeGreaterThanOrEqual(14);
});

test("a broke merchant closes, and investing reopens it and earns a share", async ({ page }) => {
  await page.goto("/judge");
  const panel = page.getByTestId("invest");
  await expect(panel).toBeVisible();
  const save = "nearverse.practice.v4";
  await page.waitForFunction((k) => localStorage.getItem(k), save);
  await page.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)!); s.market.merchants[0].cash = 1; s.player.coins = 200000; s.player.started = true; localStorage.setItem(k, JSON.stringify(s)); }, save);
  await page.reload();
  await expect(page.getByTestId("closed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Buy one Iron", exact: true })).toBeDisabled();
  await panel.getByLabel("Coins").fill("900");
  await panel.getByRole("button", { name: "Invest" }).click();
  await expect(page.getByTestId("closed")).toBeHidden();
  await page.getByRole("button", { name: "Buy one Iron", exact: true }).click();
  await expect(panel).toContainText("Earned: 4.");
  await panel.getByRole("button", { name: /Collect/ }).click();
  await expect(panel).toContainText("Earned: 0.00");
});
