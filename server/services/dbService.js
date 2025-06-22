const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

class DatabaseService {
  constructor() {
    // Always use local storage
    this.storage = 'local';
    this.dbPath = path.join(process.cwd(), 'data', 'products.json');
    this.initLocalStorage();
  }

  async initLocalStorage() {
    try {
      const dir = path.dirname(this.dbPath);
      await fs.mkdir(dir, { recursive: true });
      
      // Check if file exists, if not create it with empty structure
      try {
        await fs.access(this.dbPath);
      } catch {
        await fs.writeFile(this.dbPath, JSON.stringify({
          products: {},
          productList: [],
          metadata: {
            lastUpdated: null,
            totalCount: 0
          },
          cache: {},
          schedule: {},
          misc: {}
        }, null, 2));
      }
    } catch (error) {
      console.error('Error initializing local storage:', error);
    }
  }

  async readLocalData() {
    try {
      const data = await fs.readFile(this.dbPath, 'utf8');
      const parsed = JSON.parse(data);
      
      // Ensure all required sections exist
      if (!parsed.cache) parsed.cache = {};
      if (!parsed.schedule) parsed.schedule = {};
      if (!parsed.misc) parsed.misc = {};
      
      return parsed;
    } catch (error) {
      console.error('Error reading local data:', error);
      return { 
        products: {}, 
        productList: [],
        metadata: { lastUpdated: null, totalCount: 0 },
        cache: {},
        schedule: {},
        misc: {}
      };
    }
  }

  async writeLocalData(data) {
    try {
      await fs.writeFile(this.dbPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error writing local data:', error);
    }
  }

  async getItem(key) {
    try {
      const data = await this.readLocalData();
      
      // Initialize additional data structures if they don't exist
      if (!data.cache) data.cache = {};
      if (!data.schedule) data.schedule = {};
      if (!data.misc) data.misc = {};
      
      if (key === 'product:list') {
        return data.productList;
      } else if (key.startsWith('product:')) {
        const productId = key.replace('product:', '');
        return data.products[productId] || null;
      } else if (key === 'metadata') {
        return data.metadata;
      } else if (key.startsWith('linkedin_cache:')) {
        return data.cache[key] || null;
      } else if (key.startsWith('schedule:')) {
        return data.schedule[key] || null;
      } else {
        // Generic key storage
        return data.misc[key] || null;
      }
    } catch (error) {
      console.error(`Error getting item ${key}:`, error);
      return null;
    }
  }

  async setItem(key, value) {
    try {
      const data = await this.readLocalData();
      
      // Initialize additional data structures if they don't exist
      if (!data.cache) data.cache = {};
      if (!data.schedule) data.schedule = {};
      if (!data.misc) data.misc = {};
      
      if (key === 'product:list') {
        data.productList = value;
      } else if (key.startsWith('product:')) {
        const productId = key.replace('product:', '');
        data.products[productId] = value;
        data.metadata.totalCount = Object.keys(data.products).length;
        data.metadata.lastUpdated = new Date().toISOString();
      } else if (key === 'metadata') {
        data.metadata = value;
      } else if (key.startsWith('linkedin_cache:')) {
        data.cache[key] = value;
      } else if (key.startsWith('schedule:')) {
        data.schedule[key] = value;
      } else {
        // Generic key storage
        data.misc[key] = value;
      }
      
      await this.writeLocalData(data);
      return true;
    } catch (error) {
      console.error(`Error setting item ${key}:`, error);
      return false;
    }
  }

  async getProductList() {
    const list = await this.getItem('product:list');
    return list || [];
  }

  async addToProductList(productId) {
    const list = await this.getProductList();
    if (!list.includes(productId)) {
      list.push(productId);
      await this.setItem('product:list', list);
    }
  }

  /**
   * Store a product in the database
   * @param {Object} productData - Product information
   * @returns {Promise<Object>} - Saved product with ID
   */
  async saveProduct(productData) {
    try {
      // Check for duplicates by link
      const existingProduct = await this.findProductByLink(productData.phLink);
      if (existingProduct) {
        console.log(`Product already exists: ${productData.name}`);
        return existingProduct;
      }

      // Create new product with ID and timestamps
      const product = {
        id: uuidv4(),
        name: productData.name,
        description: productData.description,
        category: productData.category,
        publishedAt: productData.publishedAt,
        phLink: productData.phLink,
        makerName: productData.makerName || null,
        linkedin: productData.linkedin || null,
        status: 'pending',
        syncedToSheets: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Save to database
      const key = `product:${product.id}`;
      await this.setItem(key, product);

      // Also maintain a list of all product IDs for efficient querying
      await this.addToProductList(product.id);

      console.log(`Product saved: ${product.name} [${product.category}]`);
      return product;
    } catch (error) {
      console.error('Error saving product:', error);
      throw error;
    }
  }

  /**
   * Find a product by its Product Hunt link
   * @param {string} phLink - Product Hunt link
   * @returns {Promise<Object|null>} - Product or null if not found
   */
  async findProductByLink(phLink) {
    try {
      const productIds = await this.getProductList();
      
      for (const id of productIds) {
        const product = await this.getItem(`product:${id}`);
        if (product && product.phLink === phLink) {
          return product;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error finding product by link:', error);
      return null;
    }
  }

  /**
   * Get all products
   * @returns {Promise<Array>} - Array of all products
   */
  async getAllProducts() {
    try {
      const productIds = await this.getProductList();
      const products = [];

      for (const id of productIds) {
        const product = await this.getItem(`product:${id}`);
        if (product) {
          products.push(product);
        }
      }

      // Sort by publishedAt date (newest first)
      return products.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    } catch (error) {
      console.error('Error getting all products:', error);
      return [];
    }
  }

  /**
   * Get products by category
   * @param {string} category - Category to filter by
   * @returns {Promise<Array>} - Array of products in the category
   */
  async getProductsByCategory(category) {
    try {
      const allProducts = await this.getAllProducts();
      return allProducts.filter(product => product.category === category);
    } catch (error) {
      console.error('Error getting products by category:', error);
      return [];
    }
  }

  /**
   * Get products by status
   * @param {string} status - Status to filter by
   * @returns {Promise<Array>} - Array of products with the status
   */
  async getProductsByStatus(status) {
    try {
      const allProducts = await this.getAllProducts();
      return allProducts.filter(product => product.status === status);
    } catch (error) {
      console.error('Error getting products by status:', error);
      return [];
    }
  }

  /**
   * Update a product with LinkedIn information
   * @param {string} productId - Product ID
   * @param {string|null} linkedin - LinkedIn profile URL or null
   * @returns {Promise<Object|null>} - Updated product or null if not found
   */
  async updateProductLinkedIn(productId, linkedin) {
    try {
      const product = await this.getItem(`product:${productId}`);
      if (!product) {
        console.error(`Product not found: ${productId}`);
        return null;
      }

      // Update LinkedIn field and timestamp
      product.linkedin = linkedin;
      product.updatedAt = new Date().toISOString();

      // Save back to database
      await this.setItem(`product:${productId}`, product);
      
      console.log(`Updated LinkedIn for product: ${product.name} -> ${linkedin || 'null'}`);
      return product;
    } catch (error) {
      console.error('Error updating product LinkedIn:', error);
      return null;
    }
  }

  /**
   * Update a product's status (approve/reject)
   * @param {string} productId - Product ID
   * @param {string} status - New status ('approved' or 'rejected')
   * @returns {Promise<boolean>} - Success status
   */
  async updateProductStatus(productId, status) {
    try {
      const product = await this.getItem(`product:${productId}`);
      if (!product) {
        console.error(`Product not found: ${productId}`);
        return false;
      }

      // Update status and timestamp
      product.status = status;
      product.updatedAt = new Date().toISOString();
      
      if (status === 'approved') {
        product.approvedAt = new Date().toISOString();
      }

      // Save back to database
      await this.setItem(`product:${productId}`, product);
      
      console.log(`Updated status for product: ${product.name} -> ${status}`);
      return true;
    } catch (error) {
      console.error('Error updating product status:', error);
      return false;
    }
  }

  /**
   * Get products that need LinkedIn enrichment
   * @returns {Promise<Array>} - Array of products needing LinkedIn enrichment
   */
  async getProductsNeedingEnrichment() {
    try {
      const allProducts = await this.getAllProducts();
      return allProducts.filter(product => 
        product.status === 'pending' && 
        (product.linkedin === null || product.linkedin === undefined) && 
        product.makerName !== null
      );
    } catch (error) {
      console.error('Error getting products needing enrichment:', error);
      return [];
    }
  }

  /**
   * Update a product's Google Sheets sync status
   * @param {string} productId - Product ID
   * @param {boolean} synced - Whether the product has been synced to sheets
   * @returns {Promise<boolean>} - Success status
   */
  async updateProductSheetsSyncStatus(productId, synced) {
    try {
      const product = await this.getItem(`product:${productId}`);
      if (!product) {
        console.error(`Product not found: ${productId}`);
        return false;
      }

      // Update sync status and timestamp
      product.syncedToSheets = synced;
      product.updatedAt = new Date().toISOString();
      
      if (synced) {
        product.syncedToSheetsAt = new Date().toISOString();
      }

      // Save back to database
      await this.setItem(`product:${productId}`, product);
      
      console.log(`Updated sheets sync status for product: ${product.name} -> ${synced}`);
      return true;
    } catch (error) {
      console.error('Error updating product sheets sync status:', error);
      return false;
    }
  }

  /**
   * Get approved products that need to be synced to Google Sheets
   * @returns {Promise<Array>} - Array of approved products not yet synced
   */
  async getApprovedProductsNeedingSync() {
    try {
      const allProducts = await this.getAllProducts();
      return allProducts.filter(product => 
        product.status === 'approved' && 
        !product.syncedToSheets
      );
    } catch (error) {
      console.error('Error getting approved products needing sync:', error);
      return [];
    }
  }

  /**
   * Get database statistics
   * @returns {Promise<Object>} - Statistics about the database
   */
  async getStats() {
    try {
      const products = await this.getAllProducts();
      
      // A product is considered enriched if it has been processed (linkedin field exists, even if null)
      const enrichedCount = products.filter(p => p.hasOwnProperty('linkedin')).length;
      
      // A product needs enrichment if it's pending, has a maker name, but hasn't been processed yet
      const needingEnrichmentCount = products.filter(p => 
        p.status === 'pending' && 
        !p.hasOwnProperty('linkedin') && 
        p.makerName !== null
      ).length;

      const stats = {
        totalProducts: products.length,
        enrichedProducts: enrichedCount,
        needingEnrichment: needingEnrichmentCount,
        linkedinFound: products.filter(p => p.linkedin && p.linkedin !== null).length,
        approvedProducts: products.filter(p => p.status === 'approved').length,
        syncedToSheets: products.filter(p => p.syncedToSheets === true).length,
        needingSheetsSync: products.filter(p => p.status === 'approved' && !p.syncedToSheets).length,
        byCategory: {},
        byStatus: {},
        lastUpdated: products.length > 0 ? products[0].createdAt : null
      };

      products.forEach(product => {
        // Count by category
        stats.byCategory[product.category] = (stats.byCategory[product.category] || 0) + 1;
        
        // Count by status
        stats.byStatus[product.status] = (stats.byStatus[product.status] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error('Error getting stats:', error);
      return { totalProducts: 0, byCategory: {}, byStatus: {} };
    }
  }

  /**
   * Delete an item from the database
   * @param {string} key - Key to delete
   * @returns {Promise<boolean>} - Success status
   */
  async deleteItem(key) {
    try {
      const data = await this.readLocalData();
      
      if (key === 'product:list') {
        data.productList = [];
      } else if (key.startsWith('product:')) {
        const productId = key.replace('product:', '');
        if (data.products[productId]) {
          delete data.products[productId];
          // Remove from product list
          const index = data.productList.indexOf(productId);
          if (index > -1) {
            data.productList.splice(index, 1);
          }
        }
      } else if (key.startsWith('linkedin_cache:')) {
        if (data.cache[key]) {
          delete data.cache[key];
        }
      } else if (key.startsWith('schedule:')) {
        if (data.schedule[key]) {
          delete data.schedule[key];
        }
      } else {
        if (data.misc[key]) {
          delete data.misc[key];
        }
      }
      
      await this.writeLocalData(data);
      return true;
    } catch (error) {
      console.error(`Error deleting item ${key}:`, error);
      return false;
    }
  }

  /**
   * Get all keys matching a pattern
   * @param {string} pattern - Pattern to match (supports * wildcard)
   * @returns {Promise<Array>} - Array of matching keys
   */
  async getKeysByPattern(pattern) {
    try {
      const data = await this.readLocalData();
      const keys = [];
      
      // Handle different key types
      if (pattern.startsWith('product:')) {
        if (pattern === 'product:*') {
          data.productList.forEach(id => keys.push(`product:${id}`));
        }
      } else if (pattern.startsWith('linkedin_cache:')) {
        Object.keys(data.cache).forEach(key => {
          if (this.matchPattern(key, pattern)) {
            keys.push(key);
          }
        });
      } else if (pattern.startsWith('schedule:')) {
        Object.keys(data.schedule).forEach(key => {
          if (this.matchPattern(key, pattern)) {
            keys.push(key);
          }
        });
      } else {
        Object.keys(data.misc).forEach(key => {
          if (this.matchPattern(key, pattern)) {
            keys.push(key);
          }
        });
      }
      
      return keys;
    } catch (error) {
      console.error(`Error getting keys by pattern ${pattern}:`, error);
      return [];
    }
  }

  /**
   * Simple pattern matching with * wildcard
   * @param {string} key - Key to test
   * @param {string} pattern - Pattern with * wildcard
   * @returns {boolean} - Whether key matches pattern
   */
  matchPattern(key, pattern) {
    if (!pattern.includes('*')) {
      return key === pattern;
    }
    
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(key);
  }
}

module.exports = new DatabaseService();
