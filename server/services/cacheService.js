const dbService = require('./dbService');

class CacheService {
  constructor() {
    this.inMemoryCache = new Map();
    this.cacheExpiry = parseInt(process.env.CACHE_EXPIRY_HOURS || '24') * 60 * 60 * 1000; // Default 24 hours
    this.maxInMemorySize = parseInt(process.env.MAX_CACHE_SIZE || '1000'); // Max items in memory
  }

  /**
   * Get cached LinkedIn result for a maker
   * @param {string} makerName - Name of the maker
   * @returns {Promise<string|null>} - Cached LinkedIn URL or null
   */
  async getLinkedInCache(makerName) {
    const cleanName = this.cleanKey(makerName);
    
    // Check in-memory cache first
    if (this.inMemoryCache.has(cleanName)) {
      const cached = this.inMemoryCache.get(cleanName);
      if (!this.isExpired(cached.timestamp)) {
        console.log(`In-memory cache hit for: ${cleanName}`);
        return cached.linkedin;
      } else {
        // Remove expired entry
        this.inMemoryCache.delete(cleanName);
      }
    }

    // Check database cache
    try {
      const cacheKey = `linkedin_cache:${cleanName}`;
      const cached = await dbService.getItem(cacheKey);
      
      if (cached && !this.isExpired(cached.lastChecked)) {
        console.log(`Database cache hit for: ${cleanName}`);
        
        // Add to in-memory cache for faster future access
        this.addToMemoryCache(cleanName, cached.linkedin, cached.lastChecked);
        
        return cached.linkedin;
      }
      
      // Clean up expired cache entry
      if (cached && this.isExpired(cached.lastChecked)) {
        await dbService.deleteItem(cacheKey);
      }
    } catch (error) {
      console.error('Error reading LinkedIn cache:', error.message);
    }

    return null;
  }

  /**
   * Set cached LinkedIn result for a maker
   * @param {string} makerName - Name of the maker
   * @param {string|null} linkedinUrl - LinkedIn URL or null
   * @returns {Promise<void>}
   */
  async setLinkedInCache(makerName, linkedinUrl) {
    const cleanName = this.cleanKey(makerName);
    const timestamp = new Date().toISOString();
    
    // Add to in-memory cache
    this.addToMemoryCache(cleanName, linkedinUrl, timestamp);
    
    // Save to database cache
    try {
      const cacheKey = `linkedin_cache:${cleanName}`;
      const cacheData = {
        makerName: cleanName,
        linkedin: linkedinUrl,
        lastChecked: timestamp
      };
      
      await dbService.setItem(cacheKey, cacheData);
      console.log(`Cached LinkedIn result for: ${cleanName} -> ${linkedinUrl || 'null'}`);
    } catch (error) {
      console.error('Error saving LinkedIn cache:', error.message);
    }
  }

  /**
   * Add entry to in-memory cache with size management
   * @param {string} key - Cache key
   * @param {string|null} linkedin - LinkedIn URL
   * @param {string} timestamp - Timestamp
   */
  addToMemoryCache(key, linkedin, timestamp) {
    // Remove oldest entries if cache is full
    if (this.inMemoryCache.size >= this.maxInMemorySize) {
      const oldestKey = this.inMemoryCache.keys().next().value;
      this.inMemoryCache.delete(oldestKey);
    }
    
    this.inMemoryCache.set(key, {
      linkedin,
      timestamp
    });
  }

  /**
   * Check if cache entry is expired
   * @param {string} timestamp - Timestamp to check
   * @returns {boolean} - True if expired
   */
  isExpired(timestamp) {
    const cacheTime = new Date(timestamp).getTime();
    const now = Date.now();
    return (now - cacheTime) > this.cacheExpiry;
  }

  /**
   * Clean key for consistent caching
   * @param {string} key - Raw key
   * @returns {string} - Cleaned key
   */
  cleanKey(key) {
    return key
      .toLowerCase()
      .replace(/[^\w\s\-\.]/g, '')
      .replace(/\s+/g, '_')
      .trim()
      .substring(0, 50);
  }

  /**
   * Clear all LinkedIn cache
   * @returns {Promise<Object>} - Clear results
   */
  async clearLinkedInCache() {
    const results = {
      memoryCleared: 0,
      databaseCleared: 0,
      errors: []
    };

    // Clear in-memory cache
    results.memoryCleared = this.inMemoryCache.size;
    this.inMemoryCache.clear();

    // Clear database cache
    try {
      const allKeys = await dbService.getKeysByPattern('linkedin_cache:*');
      
      for (const key of allKeys) {
        try {
          await dbService.deleteItem(key);
          results.databaseCleared++;
        } catch (error) {
          results.errors.push(`Failed to delete ${key}: ${error.message}`);
        }
      }
    } catch (error) {
      results.errors.push(`Failed to clear database cache: ${error.message}`);
    }

    console.log(`Cache cleared: ${results.memoryCleared} memory, ${results.databaseCleared} database`);
    return results;
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>} - Cache statistics
   */
  async getCacheStats() {
    const stats = {
      inMemory: {
        size: this.inMemoryCache.size,
        maxSize: this.maxInMemorySize
      },
      database: {
        totalEntries: 0,
        validEntries: 0,
        expiredEntries: 0
      },
      settings: {
        expiryHours: this.cacheExpiry / (60 * 60 * 1000),
        maxInMemorySize: this.maxInMemorySize
      }
    };

    try {
      const allKeys = await dbService.getKeysByPattern('linkedin_cache:*');
      stats.database.totalEntries = allKeys.length;

      for (const key of allKeys) {
        try {
          const cached = await dbService.getItem(key);
          if (cached && !this.isExpired(cached.lastChecked)) {
            stats.database.validEntries++;
          } else {
            stats.database.expiredEntries++;
          }
        } catch (error) {
          // Count as expired if we can't read it
          stats.database.expiredEntries++;
        }
      }
    } catch (error) {
      console.error('Error getting cache stats:', error.message);
    }

    return stats;
  }

  /**
   * Clean up expired cache entries
   * @returns {Promise<Object>} - Cleanup results
   */
  async cleanupExpiredCache() {
    const results = {
      checked: 0,
      removed: 0,
      errors: []
    };

    try {
      const allKeys = await dbService.getKeysByPattern('linkedin_cache:*');
      results.checked = allKeys.length;

      for (const key of allKeys) {
        try {
          const cached = await dbService.getItem(key);
          if (!cached || this.isExpired(cached.lastChecked)) {
            await dbService.deleteItem(key);
            results.removed++;
          }
        } catch (error) {
          results.errors.push(`Failed to process ${key}: ${error.message}`);
        }
      }
    } catch (error) {
      results.errors.push(`Failed to cleanup cache: ${error.message}`);
    }

    console.log(`Cache cleanup: ${results.removed} expired entries removed from ${results.checked} total`);
    return results;
  }

  /**
   * Get all cached LinkedIn entries (for debugging)
   * @returns {Promise<Array>} - Array of cached entries
   */
  async getAllCachedEntries() {
    const entries = [];

    try {
      const allKeys = await dbService.getKeysByPattern('linkedin_cache:*');

      for (const key of allKeys) {
        try {
          const cached = await dbService.getItem(key);
          if (cached) {
            entries.push({
              makerName: cached.makerName,
              linkedin: cached.linkedin,
              lastChecked: cached.lastChecked,
              isExpired: this.isExpired(cached.lastChecked)
            });
          }
        } catch (error) {
          entries.push({
            key,
            error: error.message
          });
        }
      }
    } catch (error) {
      console.error('Error getting cached entries:', error.message);
    }

    return entries;
  }
}

module.exports = new CacheService();
