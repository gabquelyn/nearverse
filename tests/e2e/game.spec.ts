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
  await page.getByRole("button", { name: /birch-grove/ }).click();
  await expect(page.getByTestId("log")).toContainText("Gathered 3 wood");
  const price = page.locator(".tip-btn").first();
  await price.hover();
  await expect(page.locator(".tip").first()).toBeVisible();
  expect(await price.getAttribute("aria-label")).toMatch(/Wood \d+\.\d+: stock .*spread/);
  const before = await page.getByTestId("player-summary").innerText();
  await page.getByRole("button", { name: "Sell one Wood" }).click();
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

test("the world loop: load at a node, trade at a stall", async ({ page }) => {
  await page.goto("/");
  const start = page.getByRole("button", { name: "Start driving" });
  await expect(start).toBeEnabled({ timeout: 30_000 });
  await start.click();
  await expect(page.getByText("Truck bed 0/24")).toBeVisible();
  await page.waitForFunction(() => (window as never as { __nearverse?: { teleport?: unknown } }).__nearverse?.teleport);
  const go = (x: number, z: number) => page.evaluate(([a, b]) => (window as never as { __nearverse: { teleport(x: number, z: number): void } }).__nearverse.teleport(a, b), [x, z]);
  await go(-26, -18);
  await expect(page.locator(".prompt")).toContainText("hold E", { timeout: 20_000 });
  await page.keyboard.down("KeyE");
  await expect(page.getByText("Truck bed 3/24")).toBeVisible({ timeout: 30_000 });
  await page.keyboard.up("KeyE");
  await go(-16, 8);
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
