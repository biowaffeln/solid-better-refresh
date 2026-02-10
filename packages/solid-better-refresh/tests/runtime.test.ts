import { describe, it, expect, vi } from "vitest";
import { __hmr_persist, __hmr_checkStructure } from "../src/runtime";

function makeHotData(): Record<string, unknown> {
  return {};
}

function makeHot() {
  return { data: makeHotData() };
}

/** Simulate a full cycle: call checkStructure then return hot for persist calls */
function cycle(hot: { data: Record<string, unknown> }, structure: Record<string, number>) {
  __hmr_checkStructure(hot.data, structure);
  return hot;
}

/** Flush the microtask that resets instance counters */
function flushMicrotasks(): Promise<void> {
  return new Promise<void>((r) => queueMicrotask(r));
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
    cycle(hot, { App: 1 });
    let callCount = 0;
    const factory = () => {
      callCount++;
      return "created";
    };

    const result = __hmr_persist(hot, "file::App::signal::0", factory, []);
    expect(result).toBe("created");
    expect(callCount).toBe(1);
  });

  it("returns cached value on HMR reload with same key", () => {
    const hot = makeHot();

    // Cycle 0: create the signal
    cycle(hot, { App: 1 });
    let callCount = 0;
    const factory = () => {
      callCount++;
      return `created-${callCount}`;
    };

    const first = __hmr_persist(hot, "file::App::signal::0", factory, []);
    expect(first).toBe("created-1");
    expect(callCount).toBe(1);

    // Cycle 1: HMR reload — should restore
    cycle(hot, { App: 1 });
    const second = __hmr_persist(hot, "file::App::signal::0", factory, []);
    expect(second).toBe("created-1"); // same cached value
    expect(callCount).toBe(1); // factory NOT called again
  });

  it("creates separate entries for different keys", () => {
    const hot = makeHot();
    cycle(hot, { App: 2 });
    const factoryA = () => "a";
    const factoryB = () => "b";

    const a = __hmr_persist(hot, "file::App::signal::0", factoryA, []);
    const b = __hmr_persist(hot, "file::App::signal::1", factoryB, []);

    expect(a).toBe("a");
    expect(b).toBe("b");
  });

  it("creates fresh value after per-component invalidation", () => {
    const hot = makeHot();

    // Cycle 0: create
    cycle(hot, { App: 1 });
    let callCount = 0;
    const factory = () => {
      callCount++;
      return `v${callCount}`;
    };

    __hmr_persist(hot, "file::App::signal::0", factory, []);
    expect(callCount).toBe(1);

    // Cycle 1: structure change triggers invalidation for App
    cycle(hot, { App: 2 });
    const result = __hmr_persist(hot, "file::App::signal::0", factory, []);
    expect(result).toBe("v2");
    expect(callCount).toBe(2);
  });

  it("does NOT invalidate a different component", () => {
    const hot = makeHot();

    // Cycle 0: create signals for both App and Header
    cycle(hot, { App: 1, Header: 1 });
    let appCalls = 0;
    const appFactory = () => {
      appCalls++;
      return `app-v${appCalls}`;
    };
    let headerCalls = 0;
    const headerFactory = () => {
      headerCalls++;
      return `header-v${headerCalls}`;
    };

    __hmr_persist(hot, "file::App::signal::0", appFactory, []);
    __hmr_persist(hot, "file::Header::signal::0", headerFactory, []);
    expect(appCalls).toBe(1);
    expect(headerCalls).toBe(1);

    // Cycle 1: only App's structure changed
    cycle(hot, { App: 2, Header: 1 });
    const appResult = __hmr_persist(hot, "file::App::signal::0", appFactory, []);
    const headerResult = __hmr_persist(hot, "file::Header::signal::0", headerFactory, []);

    // App should be fresh (invalidated)
    expect(appResult).toBe("app-v2");
    expect(appCalls).toBe(2);
    // Header should be restored (not invalidated)
    expect(headerResult).toBe("header-v1");
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

  it("resets instance counters on each call", () => {
    const hotData = makeHotData();
    __hmr_checkStructure(hotData, { App: 2 });
    const counters1 = hotData["__hmr_instanceCounters"] as Map<string, number>;
    counters1.set("test", 5);

    __hmr_checkStructure(hotData, { App: 2 });
    const counters2 = hotData["__hmr_instanceCounters"] as Map<string, number>;
    expect(counters2.size).toBe(0);
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
      "file::App::signal::0::0": ["app-value"],
      "file::App::signal::1::0": ["app-value-2"],
      "file::Header::signal::0::0": ["header-value"],
    };

    __hmr_checkStructure(hotData, { App: 2, Header: 1 });
    __hmr_checkStructure(hotData, { App: 3, Header: 1 }); // only App changed

    const registry = hotData["__hmr_registry"] as Record<string, unknown>;
    // App's entries should be cleared
    expect(registry["file::App::signal::0::0"]).toBeUndefined();
    expect(registry["file::App::signal::1::0"]).toBeUndefined();
    // Header's entry should be preserved
    expect(registry["file::Header::signal::0::0"]).toEqual(["header-value"]);
  });

  it("updates stored structure after check", () => {
    const hotData = makeHotData();

    __hmr_checkStructure(hotData, { App: 2 });
    __hmr_checkStructure(hotData, { App: 3 });

    expect(hotData["__hmr_prevStructure"]).toEqual({ App: 3 });
  });
});

describe("multi-instance support", () => {
  it("first load: multiple instances get separate signals", () => {
    const hot = makeHot();
    cycle(hot, { Counter: 1 });

    let callCount = 0;
    const factory = () => {
      callCount++;
      return `instance-${callCount}`;
    };

    const a = __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    const b = __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    const c = __hmr_persist(hot, "file::Counter::signal::0", factory, []);

    expect(a).toBe("instance-1");
    expect(b).toBe("instance-2");
    expect(c).toBe("instance-3");
    expect(callCount).toBe(3); // factory called 3 times
  });

  it("HMR reload: instances restored by position", () => {
    const hot = makeHot();

    // Cycle 0: create 3 instances
    cycle(hot, { Counter: 1 });
    let callCount = 0;
    const factory = () => {
      callCount++;
      return `instance-${callCount}`;
    };

    __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    expect(callCount).toBe(3);

    // Cycle 1: HMR reload — all 3 should restore
    cycle(hot, { Counter: 1 });
    const a = __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    const b = __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    const c = __hmr_persist(hot, "file::Counter::signal::0", factory, []);

    expect(a).toBe("instance-1");
    expect(b).toBe("instance-2");
    expect(c).toBe("instance-3");
    expect(callCount).toBe(3); // factory NOT called again
  });

  it("new instance beyond old count gets fresh state", () => {
    const hot = makeHot();

    // Cycle 0: 2 instances
    cycle(hot, { Counter: 1 });
    let callCount = 0;
    const factory = () => {
      callCount++;
      return `instance-${callCount}`;
    };

    __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    expect(callCount).toBe(2);

    // Cycle 1: 3 instances — first 2 restore, third is new
    cycle(hot, { Counter: 1 });
    const a = __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    const b = __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    const c = __hmr_persist(hot, "file::Counter::signal::0", factory, []);

    expect(a).toBe("instance-1");
    expect(b).toBe("instance-2");
    expect(c).toBe("instance-3"); // fresh
    expect(callCount).toBe(3);
  });

  it("orphaned instances from count decrease are harmless", () => {
    const hot = makeHot();

    // Cycle 0: 3 instances
    cycle(hot, { Counter: 1 });
    let callCount = 0;
    const factory = () => {
      callCount++;
      return `instance-${callCount}`;
    };

    __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    expect(callCount).toBe(3);

    // Cycle 1: only 2 instances — both restore correctly
    cycle(hot, { Counter: 1 });
    const a = __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    const b = __hmr_persist(hot, "file::Counter::signal::0", factory, []);

    expect(a).toBe("instance-1");
    expect(b).toBe("instance-2");
    expect(callCount).toBe(3); // factory NOT called again
  });
});

describe("cross-module re-render (parent HMR)", () => {
  it("restores state when component re-renders without its module re-executing", async () => {
    const hot = makeHot();

    // Initial module load
    cycle(hot, { Counter: 1 });

    let callCount = 0;
    const factory = () => {
      callCount++;
      return `state-${callCount}`;
    };

    // Initial render
    const result1 = __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    expect(result1).toBe("state-1");
    expect(callCount).toBe(1);

    // Microtask fires — resets counters (simulates end of synchronous render)
    await flushMicrotasks();

    // Component re-renders due to PARENT HMR — no __hmr_checkStructure for this module
    const result2 = __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    expect(result2).toBe("state-1"); // restored, not fresh
    expect(callCount).toBe(1); // factory NOT called
  });

  it("restores multiple instances without module re-execution", async () => {
    const hot = makeHot();

    // Initial module load
    cycle(hot, { Counter: 1 });

    let callCount = 0;
    const factory = () => {
      callCount++;
      return `state-${callCount}`;
    };

    // 3 instances on initial render
    __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    expect(callCount).toBe(3);

    // End of render batch
    await flushMicrotasks();

    // Parent HMR triggers re-render of all 3 instances (no checkStructure)
    const a = __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    const b = __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    const c = __hmr_persist(hot, "file::Counter::signal::0", factory, []);

    expect(a).toBe("state-1");
    expect(b).toBe("state-2");
    expect(c).toBe("state-3");
    expect(callCount).toBe(3); // factory NOT called again
  });

  it("survives multiple parent HMR cycles", async () => {
    const hot = makeHot();

    // Initial module load
    cycle(hot, { Counter: 1 });

    let callCount = 0;
    const factory = () => {
      callCount++;
      return `state-${callCount}`;
    };

    __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    expect(callCount).toBe(1);

    // Parent HMR cycle 1
    await flushMicrotasks();
    const r2 = __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    expect(r2).toBe("state-1");

    // Parent HMR cycle 2
    await flushMicrotasks();
    const r3 = __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    expect(r3).toBe("state-1");

    expect(callCount).toBe(1); // factory called once total
  });
});

describe("props fingerprinting", () => {
  it("prefers __hmrSite over id and key", () => {
    const hot = makeHot();

    // Cycle 0: same id/key, different __hmrSite
    cycle(hot, { Counter: 1 });
    let callCount = 0;
    const factory = () => {
      callCount++;
      return `state-${callCount}`;
    };

    const a = __hmr_persist(
      hot,
      "file::Counter::signal::0",
      factory,
      [],
      { __hmrSite: "site-a", id: "same", key: 1 }
    );
    const b = __hmr_persist(
      hot,
      "file::Counter::signal::0",
      factory,
      [],
      { __hmrSite: "site-b", id: "same", key: 1 }
    );
    expect(a).toBe("state-1");
    expect(b).toBe("state-2");
    expect(callCount).toBe(2);

    // Cycle 1: reversed call order still restores by __hmrSite identity
    cycle(hot, { Counter: 1 });
    const b2 = __hmr_persist(
      hot,
      "file::Counter::signal::0",
      factory,
      [],
      { __hmrSite: "site-b", id: "same", key: 1 }
    );
    const a2 = __hmr_persist(
      hot,
      "file::Counter::signal::0",
      factory,
      [],
      { __hmrSite: "site-a", id: "same", key: 1 }
    );

    expect(b2).toBe("state-2");
    expect(a2).toBe("state-1");
    expect(callCount).toBe(2);
  });

  it("components with different props.id restore correctly after reorder", () => {
    const hot = makeHot();

    // Cycle 0: items with id:a, then id:b
    cycle(hot, { Counter: 1 });
    let callCount = 0;
    const factory = () => {
      callCount++;
      return `state-${callCount}`;
    };

    const a = __hmr_persist(hot, "file::Counter::signal::0", factory, [], { id: "a" });
    const b = __hmr_persist(hot, "file::Counter::signal::0", factory, [], { id: "b" });
    expect(a).toBe("state-1");
    expect(b).toBe("state-2");
    expect(callCount).toBe(2);

    // Cycle 1: reversed order — b first, then a
    cycle(hot, { Counter: 1 });
    const b2 = __hmr_persist(hot, "file::Counter::signal::0", factory, [], { id: "b" });
    const a2 = __hmr_persist(hot, "file::Counter::signal::0", factory, [], { id: "a" });

    expect(b2).toBe("state-2"); // b's state, not a's
    expect(a2).toBe("state-1"); // a's state, not b's
    expect(callCount).toBe(2); // factory NOT called again
  });

  it("falls back to positional when props have no primitives", () => {
    const hot = makeHot();

    // Cycle 0
    cycle(hot, { Counter: 1 });
    let callCount = 0;
    const factory = () => {
      callCount++;
      return `state-${callCount}`;
    };

    __hmr_persist(hot, "file::Counter::signal::0", factory, [], { onClick: () => {} });
    __hmr_persist(hot, "file::Counter::signal::0", factory, [], { onClick: () => {} });
    expect(callCount).toBe(2);

    // Cycle 1: same order, should restore positionally
    cycle(hot, { Counter: 1 });
    const a2 = __hmr_persist(hot, "file::Counter::signal::0", factory, [], { onClick: () => {} });
    const b2 = __hmr_persist(hot, "file::Counter::signal::0", factory, [], { onClick: () => {} });

    expect(a2).toBe("state-1");
    expect(b2).toBe("state-2");
    expect(callCount).toBe(2);
  });

  it("works without props param (undefined)", () => {
    const hot = makeHot();

    // Cycle 0
    cycle(hot, { App: 1 });
    let callCount = 0;
    const factory = () => {
      callCount++;
      return `state-${callCount}`;
    };

    const result = __hmr_persist(hot, "file::App::signal::0", factory, []);
    expect(result).toBe("state-1");

    // Cycle 1
    cycle(hot, { App: 1 });
    const result2 = __hmr_persist(hot, "file::App::signal::0", factory, []);
    expect(result2).toBe("state-1"); // restored
    expect(callCount).toBe(1);
  });

  it("warns once for ambiguous duplicate identity buckets", () => {
    const hot = makeHot();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    cycle(hot, { Counter: 1 });
    let callCount = 0;
    const factory = () => {
      callCount++;
      return `state-${callCount}`;
    };

    __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    __hmr_persist(hot, "file::Counter::signal::0", factory, []);

    cycle(hot, { Counter: 1 });
    __hmr_persist(hot, "file::Counter::signal::0", factory, []);
    __hmr_persist(hot, "file::Counter::signal::0", factory, []);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("ambiguous HMR identity");

    warnSpy.mockRestore();
  });

  it("warns for duplicate instances that only share __hmrSite identity", () => {
    const hot = makeHot();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    cycle(hot, { Counter: 1 });
    const factory = () => "state";

    __hmr_persist(hot, "file::Counter::signal::0", factory, [], { __hmrSite: "loop-site" });
    __hmr_persist(hot, "file::Counter::signal::0", factory, [], { __hmrSite: "loop-site" });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("ambiguous HMR identity");
    warnSpy.mockRestore();
  });
});
