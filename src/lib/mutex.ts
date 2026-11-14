/**
 * Minimal async mutex: runs callbacks one at a time, in call order.
 * For read-modify-write sequences against Discord that must not interleave.
 */
export class Mutex {
	#tail: Promise<unknown> = Promise.resolve();

	run<T>(fn: () => Promise<T>): Promise<T> {
		const result = this.#tail.then(fn, fn);
		// Keep the chain alive even if this callback fails
		this.#tail = result.catch(() => undefined);
		return result;
	}
}
