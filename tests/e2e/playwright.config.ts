import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".", timeout: 90_000, workers: 1, reporter: "list",
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:3000", launchOptions: { args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] } },
});
