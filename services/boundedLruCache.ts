export class BoundedLruCache<K, V> {
    private readonly entries = new Map<K, V>();

    constructor(private readonly capacity: number) {
        if (!Number.isInteger(capacity) || capacity <= 0) {
            throw new RangeError('LRU cache capacity must be a positive integer');
        }
    }

    get size(): number {
        return this.entries.size;
    }

    get(key: K): V | undefined {
        if (!this.entries.has(key)) return undefined;

        const value = this.entries.get(key)!;
        this.entries.delete(key);
        this.entries.set(key, value);
        return value;
    }

    set(key: K, value: V): void {
        this.entries.delete(key);
        this.entries.set(key, value);

        while (this.entries.size > this.capacity) {
            const oldest = this.entries.keys().next().value as K;
            this.entries.delete(oldest);
        }
    }

    clear(): void {
        this.entries.clear();
    }
}
