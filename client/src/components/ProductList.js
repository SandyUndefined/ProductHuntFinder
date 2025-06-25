import React from 'react';

function ProductList({ products, formatDate, selectedCategory, selectedStatus }) {
  if (!products || products.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-6xl mb-6">🔍</div>
        <h3 className="text-2xl font-semibold text-gray-900 mb-4">No products found</h3>
        <p className="text-gray-600 max-w-md mx-auto">
          {selectedCategory !== 'all' || selectedStatus !== 'all' 
            ? 'Try adjusting your filters or fetch new products from RSS feeds.'
            : 'Click "Fetch Latest Products" to get started and populate the database with Product Hunt listings.'
          }
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Products Header */}
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          {selectedCategory !== 'all' 
            ? `${selectedCategory.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())} Products`
            : 'All Products'
          }
          {selectedStatus !== 'all' && ` (${selectedStatus})`}
        </h2>
        <p className="text-gray-600">Showing {products.length} product{products.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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

  const getStatusBadgeClasses = (status) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'approved':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="card">
      {/* Card Header */}
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-xl font-semibold text-gray-900 flex-1 mr-3 leading-tight">
          {product.name}
        </h3>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-primary-500 to-secondary-500 text-white whitespace-nowrap">
          {getCategoryDisplayName(product.category)}
        </span>
      </div>

      {/* Product Description */}
      <p className="text-gray-600 mb-4 line-clamp-3">
        {product.description || 'No description available.'}
      </p>

      {/* Product Meta Info */}
      <div className="flex justify-between items-center mb-4 text-sm text-gray-500">
        <div className="font-medium text-gray-700">
          {product.makerName ? `By ${product.makerName}` : 'Maker unknown'}
        </div>
        <div className="text-gray-500">
          {formatDate(product.publishedAt)}
        </div>
      </div>

      {/* LinkedIn Section */}
      {product.linkedin && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-blue-600 mr-2" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
              <span className="text-sm font-medium text-blue-800">LinkedIn Profile</span>
            </div>
            <a
              href={product.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-blue-600 hover:text-blue-800 font-medium text-sm transition-colors duration-200"
            >
              View Profile
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      )}

      {/* Product Footer */}
      <div className="flex justify-between items-center pt-4 border-t border-gray-200">
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getStatusBadgeClasses(product.status)}`}>
          {product.status.charAt(0).toUpperCase() + product.status.slice(1)}
        </span>
        
        <a
          href={product.phLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center text-orange-600 hover:text-orange-800 font-medium text-sm transition-colors duration-200"
        >
          View on Product Hunt
          <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>
    </div>
  );
}

export default ProductList;
