// Public, non-secret settings. The server reads them from the environment at run time and hands them to the browser.
export interface PublicConfig { contract: string; network: string; rpcUrl: string; fastAuthClientId: string }

export const serverPublicConfig = (): PublicConfig => ({
  contract: process.env.GAME_CONTRACT || "",
  network: process.env.NEAR_NETWORK || "testnet",
  rpcUrl: process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com",
  fastAuthClientId: process.env.FASTAUTH_CLIENT_ID || "",
});

export function publicConfig(): PublicConfig {
  if (typeof window === "undefined") return serverPublicConfig();
  return (window as unknown as { __NEARVERSE__?: PublicConfig }).__NEARVERSE__ ?? { contract: "", network: "testnet", rpcUrl: "", fastAuthClientId: "" };
}
