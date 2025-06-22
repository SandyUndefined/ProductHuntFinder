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
        setMessage({
          type: 'success',
          text: `RSS fetch completed! Processed: ${data.results.summary.totalProcessed}, New: ${data.results.summary.totalNew}, Duplicates: ${data.results.summary.totalDuplicates}`
        });
        
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
    <div className="main-dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-content">
          <p>Discover and track the latest products from Product Hunt by category</p>
          
          {stats && (
            <div className="stats-bar">
              <div className="stat-item">
                <span className="stat-number">{stats.totalProducts}</span>
                <span className="stat-label">Total Products</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">{Object.keys(stats.byCategory || {}).length}</span>
                <span className="stat-label">Categories</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">{stats.byStatus?.pending || 0}</span>
                <span className="stat-label">Pending Review</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">{stats.byStatus?.approved || 0}</span>
                <span className="stat-label">Approved</span>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {/* Controls */}
        <div className="controls">
          <div className="controls-row">
            <div className="control-group">
              <label htmlFor="category-filter">Filter by Category:</label>
              <select
                id="category-filter"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="all">All Categories</option>
                {categories.map(category => (
                  <option key={category} value={category}>
                    {category.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>

            <div className="control-group">
              <label htmlFor="status-filter">Filter by Status:</label>
              <select
                id="status-filter"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            <div className="control-group">
              <label>&nbsp;</label>
              <button
                className="btn-primary"
                onClick={handleFetchRSS}
                disabled={fetching}
              >
                {fetching ? (
                  <>
                    <span className="loading-spinner"></span>
                    Fetching RSS...
                  </>
                ) : (
                  '🔄 Fetch Latest Products'
                )}
              </button>
            </div>

            <div className="control-group">
              <label>&nbsp;</label>
              <button
                onClick={loadProducts}
                disabled={loading}
                className="btn-secondary"
              >
                {loading ? (
                  <>
                    <span className="loading-spinner"></span>
                    Refreshing...
                  </>
                ) : (
                  '↻ Refresh'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="error">
            <strong>Error:</strong> {error}
            <button onClick={clearMessage} className="close-btn">×</button>
          </div>
        )}

        {message && (
          <div className={message.type}>
            <strong>Success:</strong> {message.text}
            <button onClick={clearMessage} className="close-btn">×</button>
          </div>
        )}

        {/* Products */}
        {loading ? (
          <div className="loading">
            <div className="loading-spinner"></div>
            Loading products...
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
