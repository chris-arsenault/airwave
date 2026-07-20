import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  delete window.__APP_CONFIG__;
  vi.resetModules();
});

describe("runtime configuration", () => {
  it("keeps the LAN deployment unauthenticated", async () => {
    window.__APP_CONFIG__ = {
      apiBaseUrl: "",
      cognitoUserPoolId: "",
      cognitoClientId: "",
      authRequired: false,
    };

    const { config } = await import("./config");

    expect(config.apiBaseUrl).toBe("");
    expect(config.authRequired).toBe(false);
  });

  it("enables authentication explicitly for the public deployment", async () => {
    window.__APP_CONFIG__ = {
      apiBaseUrl: "https://api.airwave.example.com",
      cognitoUserPoolId: "us-east-1_example",
      cognitoClientId: "client-id",
      authRequired: true,
    };

    const { config } = await import("./config");

    expect(config.authRequired).toBe(true);
    expect(config.cognitoUserPoolId).toBe("us-east-1_example");
    expect(config.cognitoClientId).toBe("client-id");
  });
});
