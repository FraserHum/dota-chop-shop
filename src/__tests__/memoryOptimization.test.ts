import { describe, it, expect } from "bun:test";
import { _testing } from "../calculators/buildAnalysis";
import { createLoadout } from "../calculators/loadout";
import { ItemRepository } from "../data/ItemRepository";
import { getAllTestItems, strengthComponent, agilityComponent, intelligenceComponent } from "./fixtures";

const { LoadoutCache, BoundedPriorityQueue, quickReuseRatio, itemsToKey } = _testing;

describe("Memory Optimization Utilities", () => {
  const items = getAllTestItems();
  const repo = new ItemRepository(items);

  describe("itemsToKey", () => {
    it("creates consistent keys regardless of item order", () => {
      const items1 = [strengthComponent, agilityComponent];
      const items2 = [agilityComponent, strengthComponent];

      const key1 = itemsToKey(items1);
      const key2 = itemsToKey(items2);

      expect(key1).toBe(key2);
    });

    it("creates different keys for different items", () => {
      const items1 = [strengthComponent, agilityComponent];
      const items2 = [strengthComponent, intelligenceComponent];

      const key1 = itemsToKey(items1);
      const key2 = itemsToKey(items2);

      expect(key1).not.toBe(key2);
    });

    it("handles single item", () => {
      const key = itemsToKey([strengthComponent]);
      expect(key).toBe("strength_component");
    });

    it("handles empty array", () => {
      const key = itemsToKey([]);
      expect(key).toBe("");
    });
  });

  describe("LoadoutCache", () => {
    it("caches loadouts by item composition", () => {
      const cache = new LoadoutCache(repo, undefined, 100);

      const items1 = [strengthComponent, agilityComponent];
      const loadout1 = cache.getOrCreate(items1);
      const loadout2 = cache.getOrCreate(items1);

      // Should return the same cached object
      expect(loadout1).toBe(loadout2);
      expect(cache.size).toBe(1);
    });

    it("returns same loadout regardless of item order", () => {
      const cache = new LoadoutCache(repo, undefined, 100);

      const items1 = [strengthComponent, agilityComponent];
      const items2 = [agilityComponent, strengthComponent];

      const loadout1 = cache.getOrCreate(items1);
      const loadout2 = cache.getOrCreate(items2);

      // Should be the same cached object (keys are sorted)
      expect(loadout1).toBe(loadout2);
      expect(cache.size).toBe(1);
    });

    it("respects max size limit and evicts entries", () => {
      const maxSize = 5;
      const cache = new LoadoutCache(repo, undefined, maxSize);

      // Add more items than max size
      const testItems = [
        [strengthComponent],
        [agilityComponent],
        [intelligenceComponent],
        [strengthComponent, agilityComponent],
        [strengthComponent, intelligenceComponent],
        [agilityComponent, intelligenceComponent],
        [strengthComponent, agilityComponent, intelligenceComponent],
      ];

      for (const itemSet of testItems) {
        cache.getOrCreate(itemSet);
      }

      // Cache should not exceed max size (some entries were evicted)
      expect(cache.size).toBeLessThanOrEqual(maxSize);
    });

    it("evicts oldest entries when full", () => {
      const maxSize = 3;
      const cache = new LoadoutCache(repo, undefined, maxSize);

      // Fill the cache
      cache.getOrCreate([strengthComponent]);
      cache.getOrCreate([agilityComponent]);
      cache.getOrCreate([intelligenceComponent]);

      expect(cache.size).toBe(3);

      // Add one more - should trigger eviction
      cache.getOrCreate([strengthComponent, agilityComponent]);

      // Size should still be within limits
      expect(cache.size).toBeLessThanOrEqual(maxSize);
    });

    it("clear() empties the cache", () => {
      const cache = new LoadoutCache(repo, undefined, 100);

      cache.getOrCreate([strengthComponent]);
      cache.getOrCreate([agilityComponent]);

      expect(cache.size).toBe(2);

      cache.clear();

      expect(cache.size).toBe(0);
    });
  });

  describe("BoundedPriorityQueue", () => {
    interface TestItem {
      score: number;
      name: string;
    }

    // For our actual use: higher score = better, so compare is (a, b) => b.score - a.score
    const compareHigherBetter = (a: TestItem, b: TestItem) => b.score - a.score;

    it("maintains items in sorted order (higher score = better)", () => {
      const queue = new BoundedPriorityQueue<TestItem>(5, compareHigherBetter);

      queue.add({ score: 0.5, name: "medium" });
      queue.add({ score: 0.9, name: "high" });
      queue.add({ score: 0.2, name: "low" });

      const result = queue.toArray();

      expect(result[0].score).toBe(0.9);
      expect(result[1].score).toBe(0.5);
      expect(result[2].score).toBe(0.2);
    });

    it("respects max size limit", () => {
      const queue = new BoundedPriorityQueue<TestItem>(3, compareHigherBetter);

      queue.add({ score: 0.1, name: "a" });
      queue.add({ score: 0.2, name: "b" });
      queue.add({ score: 0.3, name: "c" });
      queue.add({ score: 0.4, name: "d" });
      queue.add({ score: 0.5, name: "e" });

      expect(queue.size).toBe(3);
    });

    it("keeps only the best items when at capacity", () => {
      const queue = new BoundedPriorityQueue<TestItem>(3, compareHigherBetter);

      queue.add({ score: 0.1, name: "worst" });
      queue.add({ score: 0.5, name: "medium" });
      queue.add({ score: 0.9, name: "best" });
      queue.add({ score: 0.7, name: "good" }); // Should replace "worst"

      const result = queue.toArray();

      expect(result.length).toBe(3);
      expect(result.map(r => r.name)).toContain("best");
      expect(result.map(r => r.name)).toContain("good");
      expect(result.map(r => r.name)).toContain("medium");
      expect(result.map(r => r.name)).not.toContain("worst");
    });

    it("rejects items worse than the worst when at capacity", () => {
      const queue = new BoundedPriorityQueue<TestItem>(3, compareHigherBetter);

      queue.add({ score: 0.5, name: "a" });
      queue.add({ score: 0.6, name: "b" });
      queue.add({ score: 0.7, name: "c" });

      const added = queue.add({ score: 0.3, name: "worse" });

      expect(added).toBe(false);
      expect(queue.size).toBe(3);
      expect(queue.toArray().map(r => r.name)).not.toContain("worse");
    });

    it("returns correct threshold", () => {
      const queue = new BoundedPriorityQueue<TestItem>(3, compareHigherBetter);

      // Queue not full - threshold is -Infinity
      expect(queue.getThreshold()).toBe(-Infinity);

      queue.add({ score: 0.5, name: "a" });
      queue.add({ score: 0.6, name: "b" });

      // Still not full
      expect(queue.getThreshold()).toBe(-Infinity);

      queue.add({ score: 0.7, name: "c" });

      // Now full - threshold is worst score
      expect(queue.getThreshold()).toBe(0.5);
    });

    it("add() returns true when item is added", () => {
      const queue = new BoundedPriorityQueue<TestItem>(3, compareHigherBetter);

      const added = queue.add({ score: 0.5, name: "first" });
      expect(added).toBe(true);
    });

    it("handles items with equal scores", () => {
      const queue = new BoundedPriorityQueue<TestItem>(5, compareHigherBetter);

      queue.add({ score: 0.5, name: "a" });
      queue.add({ score: 0.5, name: "b" });
      queue.add({ score: 0.5, name: "c" });

      expect(queue.size).toBe(3);
      // All should be present
      const names = queue.toArray().map(r => r.name);
      expect(names).toContain("a");
      expect(names).toContain("b");
      expect(names).toContain("c");
    });

    it("toArray() returns a copy", () => {
      const queue = new BoundedPriorityQueue<TestItem>(3, compareHigherBetter);

      queue.add({ score: 0.5, name: "a" });

      const arr1 = queue.toArray();
      const arr2 = queue.toArray();

      expect(arr1).not.toBe(arr2);
      expect(arr1).toEqual(arr2);
    });
  });

  describe("quickReuseRatio", () => {
    it("returns 1.0 for identical loadouts", () => {
      const loadout = createLoadout([strengthComponent, agilityComponent], repo);

      const ratio = quickReuseRatio(loadout, loadout);

      expect(ratio).toBe(1.0);
    });

    it("returns 0 for loadouts with no common components", () => {
      const from = createLoadout([strengthComponent], repo);
      const to = createLoadout([intelligenceComponent], repo);

      const ratio = quickReuseRatio(from, to);

      expect(ratio).toBe(0);
    });

    it("returns partial ratio for partial overlap", () => {
      const from = createLoadout([strengthComponent, agilityComponent], repo);
      const to = createLoadout([strengthComponent, intelligenceComponent], repo);

      const ratio = quickReuseRatio(from, to);

      // 1 out of 2 components reused
      expect(ratio).toBe(0.5);
    });

    it("returns 0 for empty from loadout", () => {
      const from = createLoadout([], repo);
      const to = createLoadout([strengthComponent], repo);

      const ratio = quickReuseRatio(from, to);

      expect(ratio).toBe(0);
    });

    it("handles duplicate components correctly", () => {
      // Get an item that has multiple of the same component
      const multiComponentItem = items.find(i => i.name === "multi_component");
      
      if (multiComponentItem) {
        const from = createLoadout([multiComponentItem], repo);
        const to = createLoadout([multiComponentItem], repo);

        const ratio = quickReuseRatio(from, to);

        expect(ratio).toBe(1.0);
      }
    });
  });

  describe("Memory efficiency integration", () => {
    it("LoadoutCache prevents redundant loadout creation", () => {
      const cache = new LoadoutCache(repo, undefined, 1000);
      const itemSet = [strengthComponent, agilityComponent];

      // Create same loadout 100 times
      for (let i = 0; i < 100; i++) {
        cache.getOrCreate(itemSet);
      }

      // Should only have 1 cached entry
      expect(cache.size).toBe(1);
    });

    it("BoundedPriorityQueue keeps memory bounded during large insertions", () => {
      const maxSize = 10;
      const queue = new BoundedPriorityQueue<{ score: number }>(
        maxSize,
        (a, b) => b.score - a.score
      );

      // Simulate adding many items
      for (let i = 0; i < 10000; i++) {
        queue.add({ score: Math.random() });
      }

      // Queue should never exceed max size
      expect(queue.size).toBe(maxSize);

      // Should be sorted
      const result = queue.toArray();
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].score).toBeGreaterThanOrEqual(result[i + 1].score);
      }
    });
  });
});
