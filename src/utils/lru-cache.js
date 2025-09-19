/**
 * SLM Business Service Layer - LRU Cache Implementation
 *
 * @author Partha Chandramohan
 * @description Memory-efficient LRU cache with automatic cleanup and monitoring
 */

class LRUNode {
  constructor(key, value) {
    this.key = key;
    this.value = value;
    this.prev = null;
    this.next = null;
    this.accessCount = 1;
    this.lastAccessed = Date.now();
  }
}

class LRUCache {
  constructor(maxSize = 500, ttlMs = 3600000) { // Default 1 hour TTL
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.cache = new Map();
    this.size = 0;

    // Doubly linked list for LRU tracking
    this.head = new LRUNode('head', null);
    this.tail = new LRUNode('tail', null);
    this.head.next = this.tail;
    this.tail.prev = this.head;

    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      sets: 0,
      gets: 0,
      cleanups: 0
    };

    // Auto-cleanup timer
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, Math.max(ttlMs / 10, 60000)); // Cleanup every 10% of TTL or minimum 1 minute
  }

  get(key) {
    this.stats.gets++;

    const node = this.cache.get(key);
    if (!node) {
      this.stats.misses++;
      return null;
    }

    // Check TTL
    if (this.isExpired(node)) {
      this.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access statistics
    node.accessCount++;
    node.lastAccessed = Date.now();

    // Move to front (most recently used)
    this.moveToFront(node);

    this.stats.hits++;
    return node.value;
  }

  set(key, value) {
    this.stats.sets++;

    const existingNode = this.cache.get(key);
    if (existingNode) {
      // Update existing node
      existingNode.value = value;
      existingNode.lastAccessed = Date.now();
      existingNode.accessCount++;
      this.moveToFront(existingNode);
      return;
    }

    // Create new node
    const newNode = new LRUNode(key, value);

    // Check if we need to evict
    if (this.size >= this.maxSize) {
      this.evictLRU();
    }

    // Add to cache
    this.cache.set(key, newNode);
    this.addToFront(newNode);
    this.size++;
  }

  delete(key) {
    const node = this.cache.get(key);
    if (!node) {
      return false;
    }

    this.cache.delete(key);
    this.removeNode(node);
    this.size--;
    return true;
  }

  has(key) {
    const node = this.cache.get(key);
    return node && !this.isExpired(node);
  }

  clear() {
    this.cache.clear();
    this.head.next = this.tail;
    this.tail.prev = this.head;
    this.size = 0;
    this.stats.evictions += this.size;
  }

  // Memory management methods
  cleanup() {
    const now = Date.now();
    let cleanedCount = 0;

    // Collect expired keys
    const expiredKeys = [];
    for (const [key, node] of this.cache) {
      if (this.isExpired(node, now)) {
        expiredKeys.push(key);
      }
    }

    // Remove expired entries
    for (const key of expiredKeys) {
      this.delete(key);
      cleanedCount++;
    }

    this.stats.cleanups++;

    if (cleanedCount > 0) {
      console.log(`LRU Cache cleaned up ${cleanedCount} expired entries`);
    }

    return cleanedCount;
  }

  // Force garbage collection by removing least accessed items
  forceCleanup(targetSize) {
    if (this.size <= targetSize) {
      return 0;
    }

    const nodesToRemove = [];
    let current = this.tail.prev;

    while (current !== this.head && nodesToRemove.length < (this.size - targetSize)) {
      nodesToRemove.push(current);
      current = current.prev;
    }

    // Remove nodes with lowest access count first
    nodesToRemove.sort((a, b) => a.accessCount - b.accessCount);

    let removedCount = 0;
    for (const node of nodesToRemove) {
      if (this.delete(node.key)) {
        removedCount++;
      }
    }

    this.stats.evictions += removedCount;
    return removedCount;
  }

  // Internal methods
  isExpired(node, now = Date.now()) {
    return (now - node.lastAccessed) > this.ttlMs;
  }

  moveToFront(node) {
    this.removeNode(node);
    this.addToFront(node);
  }

  addToFront(node) {
    node.prev = this.head;
    node.next = this.head.next;
    this.head.next.prev = node;
    this.head.next = node;
  }

  removeNode(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
  }

  evictLRU() {
    const lru = this.tail.prev;
    if (lru !== this.head) {
      this.cache.delete(lru.key);
      this.removeNode(lru);
      this.size--;
      this.stats.evictions++;
    }
  }

  // Statistics and monitoring
  getStats() {
    const hitRate = this.stats.gets > 0 ? (this.stats.hits / this.stats.gets) * 100 : 0;
    const memoryUsage = this.estimateMemoryUsage();

    return {
      size: this.size,
      maxSize: this.maxSize,
      hitRate: Math.round(hitRate * 100) / 100,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      sets: this.stats.sets,
      gets: this.stats.gets,
      cleanups: this.stats.cleanups,
      memoryUsage
    };
  }

  estimateMemoryUsage() {
    let totalSize = 0;
    for (const [key, node] of this.cache) {
      totalSize += this.estimateObjectSize(key) + this.estimateObjectSize(node.value);
    }
    return {
      estimated_bytes: totalSize,
      estimated_mb: Math.round((totalSize / 1024 / 1024) * 100) / 100
    };
  }

  estimateObjectSize(obj) {
    if (obj === null || obj === undefined) return 0;
    if (typeof obj === 'string') return obj.length * 2; // Unicode characters
    if (typeof obj === 'number') return 8;
    if (typeof obj === 'boolean') return 4;
    if (typeof obj === 'object') {
      return JSON.stringify(obj).length * 2;
    }
    return 0;
  }

  // Get all keys (for debugging)
  keys() {
    return Array.from(this.cache.keys());
  }

  // Get cache contents ordered by access time
  getOrderedContents() {
    const contents = [];
    let current = this.head.next;

    while (current !== this.tail) {
      contents.push({
        key: current.key,
        accessCount: current.accessCount,
        lastAccessed: new Date(current.lastAccessed).toISOString(),
        expired: this.isExpired(current)
      });
      current = current.next;
    }

    return contents;
  }

  // Destroy cache and cleanup
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}

module.exports = LRUCache;