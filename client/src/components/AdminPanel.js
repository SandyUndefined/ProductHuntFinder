import React, { useState, useEffect } from 'react';

const AdminPanel = () => {
  const [makers, setMakers] = useState([]);
  const [filteredMakers, setFilteredMakers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [processingIds, setProcessingIds] = useState(new Set());
  
  // Authentication state
  const [authMethod, setAuthMethod] = useState('basic'); // 'basic' or 'token'
  const [credentials, setCredentials] = useState({
    username: '',
    password: '',
    token: ''
  });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    // Load authentication method from server info
    fetchAuthInfo();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadMakers();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    filterMakers();
  }, [makers, statusFilter, categoryFilter]);

  const fetchAuthInfo = async () => {
    try {
      const response = await fetch('/api/health');
      if (response.ok) {
        // Server is running, use default authentication method
        setAuthMethod('basic');
      }
    } catch (err) {
      console.log('Could not fetch auth info, using default');
      setAuthMethod('basic');
    }
  };

  const getAuthHeaders = () => {
    const headers = {
      'Content-Type': 'application/json',
    };

    if (authMethod === 'token' && credentials.token) {
      headers['X-Auth-Token'] = credentials.token;
    } else if (authMethod === 'basic' && credentials.username && credentials.password) {
      const base64Credentials = btoa(`${credentials.username}:${credentials.password}`);
      headers['Authorization'] = `Basic ${base64Credentials}`;
    }

    return headers;
  };

  const makeAuthenticatedRequest = async (url, options = {}) => {
    const headers = getAuthHeaders();
    
    const requestOptions = {
      ...options,
      headers: {
        ...headers,
        ...options.headers
      }
    };

    const response = await fetch(url, requestOptions);
    
    if (response.status === 401) {
      setIsAuthenticated(false);
      setAuthError('Authentication failed. Please check your credentials.');
      throw new Error('Authentication required');
    }
    
    return response;
  };

  const loadMakers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await makeAuthenticatedRequest('/api/makers');
      const data = await response.json();
      
      if (data.success) {
        setMakers(data.makers);
        setIsAuthenticated(true);
        setAuthError(null);
      } else {
        setError(data.error?.message || 'Failed to load makers');
      }
    } catch (err) {
      if (err.message === 'Authentication required') {
        // Auth error is already handled
        return;
      }
      setError('Failed to connect to server');
      console.error('Error loading makers:', err);
    } finally {
      setLoading(false);
    }
  };

  const filterMakers = () => {
    let filtered = [...makers];

    if (statusFilter !== 'all') {
      filtered = filtered.filter(maker => maker.status === statusFilter);
    }

    if (categoryFilter !== 'all') {
      filtered = filtered.filter(maker => maker.category === categoryFilter);
    }

    setFilteredMakers(filtered);
  };

  const handleApprove = async (makerId) => {
    if (processingIds.has(makerId)) return;

    try {
      setProcessingIds(prev => new Set(prev).add(makerId));
      setError(null);

      const response = await makeAuthenticatedRequest(`/api/makers/${makerId}/approve`, {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success) {
        setMessage({
          type: 'success',
          text: 'Maker approved successfully!'
        });
        
        // Update the maker's status in the local state
        setMakers(prev => prev.map(maker => 
          maker.id === makerId 
            ? { ...maker, status: 'approved', updatedAt: new Date().toISOString() }
            : maker
        ));
        
        // Clear message after 3 seconds
        setTimeout(() => setMessage(null), 3000);
      } else {
        setError(data.error?.message || 'Failed to approve maker');
      }
    } catch (err) {
      setError('Failed to approve maker');
      console.error('Error approving maker:', err);
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(makerId);
        return newSet;
      });
    }
  };

  const handleReject = async (makerId) => {
    if (processingIds.has(makerId)) return;

    try {
      setProcessingIds(prev => new Set(prev).add(makerId));
      setError(null);

      const response = await makeAuthenticatedRequest(`/api/makers/${makerId}/reject`, {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success) {
        setMessage({
          type: 'success',
          text: 'Maker rejected successfully!'
        });
        
        // Update the maker's status in the local state
        setMakers(prev => prev.map(maker => 
          maker.id === makerId 
            ? { ...maker, status: 'rejected', updatedAt: new Date().toISOString() }
            : maker
        ));
        
        // Clear message after 3 seconds
        setTimeout(() => setMessage(null), 3000);
      } else {
        setError(data.error?.message || 'Failed to reject maker');
      }
    } catch (err) {
      setError('Failed to reject maker');
      console.error('Error rejecting maker:', err);
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(makerId);
        return newSet;
      });
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

  const truncateText = (text, maxLength = 100) => {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError(null);
    
    try {
      setLoading(true);
      await loadMakers(); // This will test authentication
    } catch (err) {
      // Error handling is done in loadMakers
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCredentials({ username: '', password: '', token: '' });
    setMakers([]);
    setAuthError(null);
  };

  const clearMessage = () => {
    setMessage(null);
    setError(null);
  };

  // Show login form if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-md mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">🔐 Admin Login</h1>
            <p className="text-gray-600">Please authenticate to access the admin panel</p>
          </div>

          {/* Login Form */}
          <div className="card mb-6">
            <form onSubmit={handleLogin} className="space-y-6">
              {/* Authentication Method Selector */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex space-x-4">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      value="basic"
                      checked={authMethod === 'basic'}
                      onChange={(e) => setAuthMethod(e.target.value)}
                      className="text-primary-500 focus:ring-primary-500"
                    />
                    <span className="font-semibold text-gray-700">Username & Password</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      value="token"
                      checked={authMethod === 'token'}
                      onChange={(e) => setAuthMethod(e.target.value)}
                      className="text-primary-500 focus:ring-primary-500"
                    />
                    <span className="font-semibold text-gray-700">Access Token</span>
                  </label>
                </div>
              </div>

              {/* Conditional Form Fields */}
              {authMethod === 'basic' ? (
                <>
                  <div>
                    <label htmlFor="username" className="block text-sm font-semibold text-gray-700 mb-2">
                      Username:
                    </label>
                    <input
                      type="text"
                      id="username"
                      value={credentials.username}
                      onChange={(e) => setCredentials(prev => ({ ...prev, username: e.target.value }))}
                      required
                      placeholder="Enter admin username"
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                      Password:
                    </label>
                    <input
                      type="password"
                      id="password"
                      value={credentials.password}
                      onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                      required
                      placeholder="Enter admin password"
                      className="form-input"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label htmlFor="token" className="block text-sm font-semibold text-gray-700 mb-2">
                    Access Token:
                  </label>
                  <input
                    type="password"
                    id="token"
                    value={credentials.token}
                    onChange={(e) => setCredentials(prev => ({ ...prev, token: e.target.value }))}
                    required
                    placeholder="Enter access token"
                    className="form-input"
                  />
                </div>
              )}

              {/* Error Message */}
              {authError && (
                <div className="error-message">
                  <strong>Authentication Error:</strong> {authError}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full"
              >
                {loading ? (
                  <>
                    <div className="loading-spinner"></div>
                    Authenticating...
                  </>
                ) : (
                  'Login'
                )}
              </button>
            </form>
          </div>

          {/* Help Section */}
          <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Authentication Help</h3>
            <p className="text-gray-600 mb-3">Default credentials for development:</p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li><strong>Username:</strong> admin</li>
              <li><strong>Password:</strong> admin123</li>
              <li><strong>Token:</strong> secure-admin-token-123</li>
            </ul>
            <p className="text-xs text-gray-500 mt-4 italic">
              In production, these should be changed via environment variables.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
            <div className="mb-4 lg:mb-0">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">🛠️ Admin Panel</h1>
              <p className="text-gray-600">Review and approve or reject enriched makers from Product Hunt listings</p>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">Authenticated via {authMethod.toUpperCase()}</span>
              <button onClick={handleLogout} className="btn-secondary">
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex flex-col">
                <label htmlFor="status-filter" className="block text-sm font-semibold text-gray-700 mb-2">
                  Filter by Status:
                </label>
                <select
                  id="status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="form-input max-w-xs"
                >
                  <option value="pending">Pending ({makers.filter(m => m.status === 'pending').length})</option>
                  <option value="approved">Approved ({makers.filter(m => m.status === 'approved').length})</option>
                  <option value="rejected">Rejected ({makers.filter(m => m.status === 'rejected').length})</option>
                  <option value="all">All ({makers.length})</option>
                </select>
              </div>

              <div className="flex flex-col">
                <label htmlFor="category-filter" className="block text-sm font-semibold text-gray-700 mb-2">
                  Filter by Category:
                </label>
                <select
                  id="category-filter"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="form-input max-w-xs"
                >
                  <option value="all">All Categories ({makers.length})</option>
                  <option value="artificial-intelligence">AI ({makers.filter(m => m.category === 'artificial-intelligence').length})</option>
                  <option value="developer-tools">Developer Tools ({makers.filter(m => m.category === 'developer-tools').length})</option>
                  <option value="saas">SaaS ({makers.filter(m => m.category === 'saas').length})</option>
                </select>
              </div>
            </div>

            <button
              onClick={loadMakers}
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

        {/* Messages */}
        {error && (
          <div className="error-message relative">
            <strong>Error:</strong> {error}
            <button onClick={clearMessage} className="absolute top-4 right-4 text-red-500 hover:text-red-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {message && (
          <div className="success-message relative">
            <strong>Success:</strong> {message.text}
            <button onClick={clearMessage} className="absolute top-4 right-4 text-green-500 hover:text-green-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="text-center py-12">
            <div className="loading-spinner mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading makers...</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {filteredMakers.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">📭</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No makers found</h3>
                <p className="text-gray-600">No makers found with status: {statusFilter}</p>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Published</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Maker</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">LinkedIn</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Links</th>
                        {statusFilter === 'pending' && (
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredMakers.map(maker => (
                        <tr key={maker.id} className="hover:bg-gray-50 transition-colors duration-150">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="font-semibold text-gray-900">{maker.name}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-primary-500 to-secondary-500 text-white">
                              {maker.category.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {formatDate(maker.publishedAt)}
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900 max-w-xs">
                              {truncateText(maker.description)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {maker.makerName || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {maker.linkedin ? (
                              <a 
                                href={maker.linkedin} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center"
                              >
                                LinkedIn
                                <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                            ) : (
                              <span className="text-gray-400 italic text-sm">No LinkedIn</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <a 
                              href={maker.phLink} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-orange-600 hover:text-orange-800 font-medium text-sm flex items-center"
                            >
                              Product Hunt
                              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </a>
                          </td>
                          {statusFilter === 'pending' && (
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => handleApprove(maker.id)}
                                  disabled={processingIds.has(maker.id)}
                                  className="btn-approve"
                                >
                                  {processingIds.has(maker.id) ? (
                                    <div className="loading-spinner"></div>
                                  ) : (
                                    <span>✅</span>
                                  )}
                                  Approve
                                </button>
                                
                                <button
                                  onClick={() => handleReject(maker.id)}
                                  disabled={processingIds.has(maker.id)}
                                  className="btn-reject"
                                >
                                  {processingIds.has(maker.id) ? (
                                    <div className="loading-spinner"></div>
                                  ) : (
                                    <span>❌</span>
                                  )}
                                  Reject
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="lg:hidden divide-y divide-gray-200">
                  {filteredMakers.map(maker => (
                    <div key={maker.id} className="p-6 space-y-4">
                      <div className="flex justify-between items-start">
                        <h3 className="font-semibold text-gray-900 text-lg">{maker.name}</h3>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-primary-500 to-secondary-500 text-white">
                          {maker.category.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </span>
                      </div>
                      
                      <p className="text-gray-600 text-sm">{truncateText(maker.description)}</p>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium text-gray-500">Maker:</span>
                          <div className="text-gray-900">{maker.makerName || 'N/A'}</div>
                        </div>
                        <div>
                          <span className="font-medium text-gray-500">Published:</span>
                          <div className="text-gray-900">{formatDate(maker.publishedAt)}</div>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-3">
                        {maker.linkedin && (
                          <a 
                            href={maker.linkedin} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center"
                          >
                            LinkedIn
                            <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        )}
                        <a 
                          href={maker.phLink} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-orange-600 hover:text-orange-800 font-medium text-sm flex items-center"
                        >
                          Product Hunt
                          <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </div>
                      
                      {statusFilter === 'pending' && (
                        <div className="flex space-x-3">
                          <button
                            onClick={() => handleApprove(maker.id)}
                            disabled={processingIds.has(maker.id)}
                            className="btn-approve flex-1"
                          >
                            {processingIds.has(maker.id) ? (
                              <div className="loading-spinner"></div>
                            ) : (
                              <span>✅</span>
                            )}
                            Approve
                          </button>
                          
                          <button
                            onClick={() => handleReject(maker.id)}
                            disabled={processingIds.has(maker.id)}
                            className="btn-reject flex-1"
                          >
                            {processingIds.has(maker.id) ? (
                              <div className="loading-spinner"></div>
                            ) : (
                              <span>❌</span>
                            )}
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
