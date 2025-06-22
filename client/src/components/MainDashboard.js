import React, { useState, useEffect } from 'react';
import ProductList from './ProductList';

const MainDashboard = () => {
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  const categories = ['artificial-intelligence', 'developer-tools', 'saas'];

  // Load initial data
  useEffect(() => {
    loadProducts();
    loadStats();
  }, []);

  // Filter products when selection changes
  useEffect(() => {
    filterProducts();
  }, [products, selectedCategory, selectedStatus]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/products');
      const data = await response.json();
      
      if (data.success) {
        setProducts(data.products);
      } else {
        setError(data.error?.message || 'Failed to load products');
      }
    } catch (err) {
      setError('Failed to connect to server');
      console.error('Error loading products:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch('/api/stats');
      const data = await response.json();
      
      if (data.success) {
        setStats(data.database);
      }
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  const filterProducts = () => {
    let filtered = [...products];

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(product => product.category === selectedCategory);
    }

    // Filter by status
    if (selectedStatus !== 'all') {
      filtered = filtered.filter(product => product.status === selectedStatus);
    }

    setFilteredProducts(filtered);
  };

  const handleFetchRSS = async () => {
    try {
      setFetching(true);
      setError(null);
      setMessage(null);

      const response = await fetch('/api/cron/fetch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (data.success) {
        if (data.skipped) {
          // Handle skipped response (rate limited)
          setMessage({
            type: 'success',
            text: `RSS fetch skipped: ${data.reason}`
          });
        } else if (data.results && data.results.rss && data.results.rss.summary) {
          // Handle normal response with results
          const summary = data.results.rss.summary;
          setMessage({
            type: 'success',
            text: `RSS fetch completed! Processed: ${summary.totalProcessed}, New: ${summary.totalNew}, Duplicates: ${summary.totalDuplicates}`
          });
        } else {
          // Fallback for any other success response
          setMessage({
            type: 'success',
            text: 'RSS fetch completed successfully'
          });
        }
        
        // Reload products and stats
        await loadProducts();
        await loadStats();
      } else {
        setError(data.error?.message || 'RSS fetch failed');
      }
    } catch (err) {
      setError('Failed to trigger RSS fetch');
      console.error('Error fetching RSS:', err);
    } finally {
      setFetching(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',  
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const clearMessage = () => {
    setMessage(null);
    setError(null);
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Header Stats Section */}
      <header className="bg-gradient-to-r from-primary-500 to-secondary-500 text-white py-12 shadow-lg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-8">
            <p className="text-xl text-gray-100 mb-6">
              Discover and track the latest products from Product Hunt by category
            </p>
          </div>
          
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              <div className="bg-white bg-opacity-10 rounded-lg p-4">
                <div className="text-3xl font-bold mb-2">{stats.totalProducts}</div>
                <div className="text-sm text-gray-200">Total Products</div>
              </div>
              <div className="bg-white bg-opacity-10 rounded-lg p-4">
                <div className="text-3xl font-bold mb-2">{Object.keys(stats.byCategory || {}).length}</div>
                <div className="text-sm text-gray-200">Categories</div>
              </div>
              <div className="bg-white bg-opacity-10 rounded-lg p-4">
                <div className="text-3xl font-bold mb-2">{stats.byStatus?.pending || 0}</div>
                <div className="text-sm text-gray-200">Pending Review</div>
              </div>
              <div className="bg-white bg-opacity-10 rounded-lg p-4">
                <div className="text-3xl font-bold mb-2">{stats.byStatus?.approved || 0}</div>
                <div className="text-sm text-gray-200">Approved</div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Controls */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="flex flex-col">
              <label htmlFor="category-filter" className="block text-sm font-semibold text-gray-700 mb-2">
                Filter by Category:
              </label>
              <select
                id="category-filter"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="form-input"
              >
                <option value="all">All Categories</option>
                {categories.map(category => (
                  <option key={category} value={category}>
                    {category.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col">
              <label htmlFor="status-filter" className="block text-sm font-semibold text-gray-700 mb-2">
                Filter by Status:
              </label>
              <select
                id="status-filter"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="form-input"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            <div className="flex flex-col">
              <label className="block text-sm font-semibold text-gray-700 mb-2">&nbsp;</label>
              <button
                className="btn-primary"
                onClick={handleFetchRSS}
                disabled={fetching}
              >
                {fetching ? (
                  <>
                    <div className="loading-spinner"></div>
                    Fetching RSS...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Fetch Latest Products
                  </>
                )}
              </button>
            </div>

            <div className="flex flex-col">
              <label className="block text-sm font-semibold text-gray-700 mb-2">&nbsp;</label>
              <button
                onClick={loadProducts}
                disabled={loading}
                className="btn-secondary"
              >
                {loading ? (
                  <>
                    <div className="loading-spinner"></div>
                    Refreshing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="error-message relative mb-6">
            <strong>Error:</strong> {error}
            <button onClick={clearMessage} className="absolute top-4 right-4 text-red-500 hover:text-red-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {message && (
          <div className="success-message relative mb-6">
            <strong>Success:</strong> {message.text}
            <button onClick={clearMessage} className="absolute top-4 right-4 text-green-500 hover:text-green-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Products */}
        {loading ? (
          <div className="text-center py-12">
            <div className="loading-spinner mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading products...</p>
          </div>
        ) : (
          <ProductList 
            products={filteredProducts}
            formatDate={formatDate}
            selectedCategory={selectedCategory}
            selectedStatus={selectedStatus}
          />
        )}
      </main>
    </div>
  );
};

export default MainDashboard;
