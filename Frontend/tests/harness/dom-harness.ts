/**
 * DOM and Browser Environment Test Harness
 * Provides isolated mock implementations of browser storage, window metrics,
 * events, and file objects for headless opaque-box E2E testing.
 */

export class MockLocalStorage {
  private store: Map<string, string> = new Map();
  public shouldFail: boolean = false;

  getItem(key: string): string | null {
    if (this.shouldFail) {
      throw new Error("QuotaExceededError: DOM Exception 22");
    }
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    if (this.shouldFail) {
      throw new Error("QuotaExceededError: DOM Exception 22");
    }
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] || null;
  }
}

export interface MockViewport {
  width: number;
  height: number;
}

export class MockWindow {
  public innerWidth: number;
  public innerHeight: number;
  public localStorage: MockLocalStorage;
  private listeners: Map<string, Array<(event: unknown) => void>> = new Map();

  constructor(initialViewport: MockViewport = { width: 1280, height: 800 }) {
    this.innerWidth = initialViewport.width;
    this.innerHeight = initialViewport.height;
    this.localStorage = new MockLocalStorage();
  }

  setViewport(width: number, height: number): void {
    this.innerWidth = width;
    this.innerHeight = height;
    this.dispatchEvent("resize", { innerWidth: width, innerHeight: height });
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(listener);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    const list = this.listeners.get(type);
    if (!list) return;
    const idx = list.indexOf(listener);
    if (idx !== -1) {
      list.splice(idx, 1);
    }
  }

  dispatchEvent(type: string, eventObj: unknown = {}): boolean {
    const list = this.listeners.get(type);
    if (list) {
      for (const listener of list) {
        listener(eventObj);
      }
    }
    return true;
  }
}

export class MockFile {
  public name: string;
  public size: number;
  public type: string;
  public lastModified: number;
  public content: string;

  constructor(name: string, size: number, type: string, content: string = "") {
    this.name = name;
    this.size = size;
    this.type = type;
    this.lastModified = Date.now();
    this.content = content;
  }

  async toBase64(): Promise<string> {
    if (this.content) {
      return Buffer.from(this.content, "utf-8").toString("base64");
    }
    // Generate simulated byte payload
    return Buffer.alloc(Math.min(this.size, 1024), "a").toString("base64");
  }
}
