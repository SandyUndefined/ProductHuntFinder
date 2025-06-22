import React from 'react';

function ProductList({ products, formatDate, selectedCategory, selectedStatus }) {
  if (!products || products.length === 0) {
    return (
      <div className="empty-state">
        <h3>No products found</h3>
        <p>
          {selectedCategory !== 'all' || selectedStatus !== 'all' 
            ? 'Try adjusting your filters or fetch new products from RSS feeds.'
            : 'Click "Fetch Latest Products" to get started and populate the database with Product Hunt listings.'
          }
        </p>
      </div>
    );
  }

  return (
    <div className="products-section">
      <div className="products-header">
        <h2>
          {selectedCategory !== 'all' 
            ? `${selectedCategory.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())} Products`
            : 'All Products'
          }
          {selectedStatus !== 'all' && ` (${selectedStatus})`}
        </h2>
        <p className="products-count">Showing {products.length} product{products.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="products-grid">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            formatDate={formatDate}
          />
        ))}
      </div>
    </div>
  );
}

function ProductCard({ product, formatDate }) {
  const getCategoryDisplayName = (category) => {
    return category
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getStatusClassName = (status) => {
    switch (status) {
      case 'pending':
        return 'status-pending';
      case 'approved':
        return 'status-approved';
      case 'rejected':
        return 'status-rejected';
      default:
        return 'status-pending';
    }
  };

  return (
    <div className="product-card">
      <div className="product-header">
        <h3 className="product-title">{product.name}</h3>
        <span className="product-category">
          {getCategoryDisplayName(product.category)}
        </span>
      </div>

      <p className="product-description">
        {product.description || 'No description available.'}
      </p>

      <div className="product-meta">
        <div className="product-maker">
          {product.makerName ? `By ${product.makerName}` : 'Maker unknown'}
        </div>
        <div className="product-date">
          {formatDate(product.publishedAt)}
        </div>
      </div>

      <div className="product-footer">
        <span className={`product-status ${getStatusClassName(product.status)}`}>
          {product.status}
        </span>
        
        <a
          href={product.phLink}
          target="_blank"
          rel="noopener noreferrer"
          className="product-link"
        >
          View on Product Hunt →
        </a>
      </div>
    </div>
  );
}

export default ProductList;
