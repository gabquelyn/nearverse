export const baseURL = process.env.BASE_URL ?? "http://localhost:3000";
// Tests start past the first-visit welcome. Its own test clears this.
export const seen = { cookies: [], origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: "nearverse.welcomed", value: "1" }] }] };
