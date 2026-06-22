import { describe, expect, it } from "vitest";

import { assertPublicHttpUrl } from "@/lib/connectors/url-guard";

describe("assertPublicHttpUrl", () => {
  it("accepts public http(s) hosts", () => {
    expect(assertPublicHttpUrl("https://api.tray.com.br").host).toBe(
      "api.tray.com.br",
    );
    expect(assertPublicHttpUrl("loja.example.com").protocol).toBe("https:");
    expect(assertPublicHttpUrl("http://203.0.113.10/api").hostname).toBe(
      "203.0.113.10",
    );
  });

  it("rejects non-http(s) protocols", () => {
    expect(() => assertPublicHttpUrl("file:///etc/passwd")).toThrow();
    expect(() => assertPublicHttpUrl("gopher://evil/x")).toThrow();
  });

  it("rejects loopback and internal hostnames", () => {
    expect(() => assertPublicHttpUrl("http://localhost:3000")).toThrow();
    expect(() => assertPublicHttpUrl("http://db.internal/orders")).toThrow();
    expect(() => assertPublicHttpUrl("http://api.local")).toThrow();
  });

  it("rejects private and metadata IPv4 ranges", () => {
    expect(() => assertPublicHttpUrl("http://127.0.0.1")).toThrow();
    expect(() => assertPublicHttpUrl("http://10.1.2.3")).toThrow();
    expect(() => assertPublicHttpUrl("http://172.16.5.5")).toThrow();
    expect(() => assertPublicHttpUrl("http://192.168.0.1")).toThrow();
    expect(() =>
      assertPublicHttpUrl("http://169.254.169.254/latest/meta-data"),
    ).toThrow();
    expect(() => assertPublicHttpUrl("http://0.0.0.0")).toThrow();
  });

  it("rejects loopback and link-local IPv6", () => {
    expect(() => assertPublicHttpUrl("http://[::1]")).toThrow();
    expect(() => assertPublicHttpUrl("http://[fe80::1]")).toThrow();
    expect(() => assertPublicHttpUrl("http://[fc00::1]")).toThrow();
    expect(() => assertPublicHttpUrl("http://[::ffff:127.0.0.1]")).toThrow();
  });
});
