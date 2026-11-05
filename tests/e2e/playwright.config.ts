import { defineConfig } from "@playwright/test";
import { baseURL, seen } from "./seen";
export default defineConfig({
  testDir: ".", timeout: 90_000, workers: 1, reporter: "list",
  use: { baseURL, storageState: seen, launchOptions: { args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] } },
});
