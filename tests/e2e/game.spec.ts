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

const SAVE = "nearverse.practice.v3";
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

test("credits pay for fuel, repairs and vehicles, shown with pictures", async ({ page }) => {
  await page.goto("/profile");
  await page.getByRole("button", { name: /Buy 1000 credits/ }).click().catch(() => {});
  await seed(page, (p) => { p.credits = 5000; p.durability = 50; p.fuel = 10; });
  await page.getByRole("button", { name: "Repair with credits" }).click();
  await page.getByRole("button", { name: "Refuel 10 with credits" }).click();
  await expect(page.getByTestId("player-summary")).toContainText("fuel 20/100");
  await expect(page.getByTestId("player-summary")).toContainText("Credits 4940");
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
  await expect(map.locator(".pin:not(.maplegend .pin)")).toHaveCount(7);
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

test("a phone drives with a thumb stick and pedals, and asks for landscape", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto("/play");
  await ready(page);
  const speed = () => page.evaluate(() => (window as never as { __nearverse: { truck: { speed: number } } }).__nearverse.truck.speed);
  await expect(page.getByTestId("stick")).toBeVisible();
  await expect(page.getByText("Turn your phone sideways")).toBeHidden();
  await expect(page.getByRole("button", { name: "Show details" })).toBeVisible();
  // Two real thumbs at once: the gas pedal and the stick pushed to the right.
  const cdp = await ctx.newCDPSession(page);
  const centre = async (l: import("@playwright/test").Locator) => { const b = (await l.boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const g = await centre(page.getByRole("button", { name: "Gas" })), st = await centre(page.getByTestId("stick"));
  const yaw = () => page.evaluate(() => (window as never as { __nearverse: { truck: { yaw: number } } }).__nearverse.truck.yaw);
  const before = await yaw();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: g.x, y: g.y, id: 1 }, { x: st.x, y: st.y, id: 2 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: g.x, y: g.y, id: 1 }, { x: st.x + 40, y: st.y, id: 2 }] });
  await expect.poll(speed, { timeout: 20_000 }).toBeGreaterThan(3);
  await expect.poll(async () => Math.abs((await yaw()) - before), { timeout: 20_000 }).toBeGreaterThan(0.1);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => page.evaluate(() => (window as never as { __nearverse: { keys: Set<string> } }).__nearverse.keys.size)).toBe(0);
  await ctx.close();
  const upright = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const tall = await upright.newPage();
  await tall.goto("/play");
  await expect(tall.getByText("Turn your phone sideways")).toBeVisible();
  await upright.close();
});
