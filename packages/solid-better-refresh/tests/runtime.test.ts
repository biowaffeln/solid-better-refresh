import { describe, it, expect } from "vitest";
import { __hmr_persist, __hmr_checkStructure } from "../src/runtime";

function makeHotData(): Record<string, unknown> {
  return {};
}

function makeHot() {
  return { data: makeHotData() };
}

describe("__hmr_persist", () => {
  it("passes through when hot is null", () => {
    const factory = (...args: unknown[]) => ["value", args[0]];
    const result = __hmr_persist(null, "key", factory, [42]);
    expect(result).toEqual(["value", 42]);
  });

  it("passes through when hot is undefined", () => {
    const factory = (...args: unknown[]) => args[0];
    const result = __hmr_persist(undefined, "key", factory, ["hello"]);
    expect(result).toBe("hello");
  });

  it("creates and caches on first call", () => {
    const hot = makeHot();
    let callCount = 0;
    const factory = () => {
      callCount++;
      return "created";
    };

    const result = __hmr_persist(hot, "file::App::signal::0", factory, []);
    expect(result).toBe("created");
    expect(callCount).toBe(1);
  });

  it("returns cached value on second call with same key", () => {
    const hot = makeHot();
    let callCount = 0;
    const factory = () => {
      callCount++;
      return `created-${callCount}`;
    };

    const first = __hmr_persist(hot, "file::App::signal::0", factory, []);
    const second = __hmr_persist(hot, "file::App::signal::0", factory, []);

    expect(first).toBe("created-1");
    expect(second).toBe("created-1"); // same cached value
    expect(callCount).toBe(1); // factory only called once
  });

  it("creates separate entries for different keys", () => {
    const hot = makeHot();
    const factoryA = () => "a";
    const factoryB = () => "b";

    const a = __hmr_persist(hot, "file::App::signal::0", factoryA, []);
    const b = __hmr_persist(hot, "file::App::signal::1", factoryB, []);

    expect(a).toBe("a");
    expect(b).toBe("b");
  });

  it("creates fresh value after per-component invalidation", () => {
    const hot = makeHot();
    let callCount = 0;
    const factory = () => {
      callCount++;
      return `v${callCount}`;
    };

    // First call - creates
    __hmr_persist(hot, "file::App::signal::0", factory, []);
    expect(callCount).toBe(1);

    // Simulate per-component invalidation
    hot.data["__hmr_invalidated"] = new Set(["App"]);

    // Second call - should create fresh because App is invalidated
    const result = __hmr_persist(hot, "file::App::signal::0", factory, []);
    expect(result).toBe("v2");
    expect(callCount).toBe(2);
  });

  it("does NOT invalidate a different component", () => {
    const hot = makeHot();
    let headerCalls = 0;
    const headerFactory = () => {
      headerCalls++;
      return `header-v${headerCalls}`;
    };

    // Create header's signal
    __hmr_persist(hot, "file::Header::signal::0", headerFactory, []);
    expect(headerCalls).toBe(1);

    // Invalidate only App, not Header
    hot.data["__hmr_invalidated"] = new Set(["App"]);

    // Header should still return cached
    const result = __hmr_persist(hot, "file::Header::signal::0", headerFactory, []);
    expect(result).toBe("header-v1");
    expect(headerCalls).toBe(1);
  });
});

describe("__hmr_checkStructure", () => {
  it("does nothing when hotData is null", () => {
    __hmr_checkStructure(null, { App: 2 });
  });

  it("does nothing when hotData is undefined", () => {
    __hmr_checkStructure(undefined, { App: 2 });
  });

  it("stores structure on first call without invalidation", () => {
    const hotData = makeHotData();
    __hmr_checkStructure(hotData, { App: 2 });

    expect(hotData["__hmr_prevStructure"]).toEqual({ App: 2 });
    // No invalidation on first call (no previous structure)
    expect(hotData["__hmr_invalidated"]).toBeUndefined();
  });

  it("does not invalidate when structure is the same", () => {
    const hotData = makeHotData();

    __hmr_checkStructure(hotData, { App: 2 });
    __hmr_checkStructure(hotData, { App: 2 });

    expect(hotData["__hmr_invalidated"]).toBeNull();
  });

  it("invalidates only the changed component", () => {
    const hotData = makeHotData();

    __hmr_checkStructure(hotData, { App: 2, Header: 1 });
    __hmr_checkStructure(hotData, { App: 3, Header: 1 }); // only App changed

    const invalidated = hotData["__hmr_invalidated"] as Set<string>;
    expect(invalidated).toBeInstanceOf(Set);
    expect(invalidated.has("App")).toBe(true);
    expect(invalidated.has("Header")).toBe(false);
  });

  it("invalidates when a component is added", () => {
    const hotData = makeHotData();

    __hmr_checkStructure(hotData, { App: 2 });
    __hmr_checkStructure(hotData, { App: 2, Header: 1 });

    const invalidated = hotData["__hmr_invalidated"] as Set<string>;
    expect(invalidated.has("Header")).toBe(true);
    expect(invalidated.has("App")).toBe(false);
  });

  it("invalidates when a component is removed", () => {
    const hotData = makeHotData();

    __hmr_checkStructure(hotData, { App: 2, Header: 1 });
    __hmr_checkStructure(hotData, { App: 2 });

    const invalidated = hotData["__hmr_invalidated"] as Set<string>;
    expect(invalidated.has("Header")).toBe(true);
    expect(invalidated.has("App")).toBe(false);
  });

  it("clears only changed component's registry entries", () => {
    const hotData = makeHotData();
    hotData["__hmr_registry"] = {
      "file::App::signal::0": ["app-value"],
      "file::App::signal::1": ["app-value-2"],
      "file::Header::signal::0": ["header-value"],
    };

    __hmr_checkStructure(hotData, { App: 2, Header: 1 });
    __hmr_checkStructure(hotData, { App: 3, Header: 1 }); // only App changed

    const registry = hotData["__hmr_registry"] as Record<string, unknown>;
    // App's entries should be cleared
    expect(registry["file::App::signal::0"]).toBeUndefined();
    expect(registry["file::App::signal::1"]).toBeUndefined();
    // Header's entry should be preserved
    expect(registry["file::Header::signal::0"]).toEqual(["header-value"]);
  });

  it("updates stored structure after check", () => {
    const hotData = makeHotData();

    __hmr_checkStructure(hotData, { App: 2 });
    __hmr_checkStructure(hotData, { App: 3 });

    expect(hotData["__hmr_prevStructure"]).toEqual({ App: 3 });
  });
});
