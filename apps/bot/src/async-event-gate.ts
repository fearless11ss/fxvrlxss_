export class AsyncEventGate {
  readonly #onError: (error: unknown) => void;
  readonly #pending = new Set<Promise<void>>();
  #accepting = true;

  constructor(onError: (error: unknown) => void) {
    this.#onError = onError;
  }

  run(operation: () => Promise<void>): void {
    if (!this.#accepting) return;
    const pending = Promise.resolve()
      .then(operation)
      .catch(this.#onError)
      .finally(() => this.#pending.delete(pending));
    this.#pending.add(pending);
  }

  async close(): Promise<void> {
    this.#accepting = false;
    await Promise.allSettled([...this.#pending]);
  }
}
