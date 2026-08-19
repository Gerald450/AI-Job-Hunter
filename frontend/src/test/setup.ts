import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

const memoryStore = new Map<string, string>();

const localStorageMock = {
  getItem: (key: string) => memoryStore.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memoryStore.set(key, String(value));
  },
  removeItem: (key: string) => {
    memoryStore.delete(key);
  },
  clear: () => {
    memoryStore.clear();
  },
  key: (index: number) => Array.from(memoryStore.keys())[index] ?? null,
  get length() {
    return memoryStore.size;
  },
};

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  writable: true,
});

afterEach(() => {
  cleanup();
  memoryStore.clear();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
    writable: true,
  });
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({
      children,
      href,
      ...props
    }: {
      children?: React.ReactNode;
      href: string;
    }) => React.createElement("a", { href, ...props }, children),
  };
});
