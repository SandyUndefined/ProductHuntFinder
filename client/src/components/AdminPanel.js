import React, { useState, useEffect } from 'react';

const AdminPanel = () => {
  const [makers, setMakers] = useState([]);
  const [filteredMakers, setFilteredMakers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [statusFilter, setStatusFilter] = useState('pending');
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
  }, [makers, statusFilter]);

  const fetchAuthInfo = async () => {
    try {
      const response = await fetch('/api/health');
      if (response.ok) {
        // Server is running, try to get auth method from root endpoint
        const rootResponse = await fetch('/');
        if (rootResponse.ok) {
          const data = await rootResponse.json();
          if (data.authentication?.method) {
            setAuthMethod(data.authentication.method);
          }
        }
      }
    } catch (err) {
      console.log('Could not fetch auth info, using default');
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
      <div className="admin-panel">
        <div className="admin-header">
          <h1>🔐 Admin Login</h1>
          <p>Please authenticate to access the admin panel</p>
        </div>

        <div className="login-container">
          <form onSubmit={handleLogin} className="login-form">
            <div className="auth-method-selector">
              <label>
                <input
                  type="radio"
                  value="basic"
                  checked={authMethod === 'basic'}
                  onChange={(e) => setAuthMethod(e.target.value)}
                />
                Username & Password
              </label>
              <label>
                <input
                  type="radio"
                  value="token"
                  checked={authMethod === 'token'}
                  onChange={(e) => setAuthMethod(e.target.value)}
                />
                Access Token
              </label>
            </div>

            {authMethod === 'basic' ? (
              <>
                <div className="form-group">
                  <label htmlFor="username">Username:</label>
                  <input
                    type="text"
                    id="username"
                    value={credentials.username}
                    onChange={(e) => setCredentials(prev => ({ ...prev, username: e.target.value }))}
                    required
                    placeholder="Enter admin username"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="password">Password:</label>
                  <input
                    type="password"
                    id="password"
                    value={credentials.password}
                    onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                    required
                    placeholder="Enter admin password"
                  />
                </div>
              </>
            ) : (
              <div className="form-group">
                <label htmlFor="token">Access Token:</label>
                <input
                  type="password"
                  id="token"
                  value={credentials.token}
                  onChange={(e) => setCredentials(prev => ({ ...prev, token: e.target.value }))}
                  required
                  placeholder="Enter access token"
                />
              </div>
            )}

            {authError && (
              <div className="error">
                <strong>Authentication Error:</strong> {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary login-btn"
            >
              {loading ? (
                <>
                  <span className="loading-spinner"></span>
                  Authenticating...
                </>
              ) : (
                'Login'
              )}
            </button>
          </form>

          <div className="login-help">
            <h3>Authentication Help</h3>
            <p>Default credentials for development:</p>
            <ul>
              <li><strong>Username:</strong> admin</li>
              <li><strong>Password:</strong> admin123</li>
              <li><strong>Token:</strong> secure-admin-token-123</li>
            </ul>
            <p><em>In production, these should be changed via environment variables.</em></p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h1>🛠️ Admin Panel</h1>
        <p>Review and approve or reject enriched makers from Product Hunt listings</p>
        <div className="auth-info">
          <span>Authenticated via {authMethod.toUpperCase()}</span>
          <button onClick={handleLogout} className="btn-secondary logout-btn">
            Logout
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="admin-controls">
        <div className="control-group">
          <label htmlFor="status-filter">Filter by Status:</label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="pending">Pending ({makers.filter(m => m.status === 'pending').length})</option>
            <option value="approved">Approved ({makers.filter(m => m.status === 'approved').length})</option>
            <option value="rejected">Rejected ({makers.filter(m => m.status === 'rejected').length})</option>
            <option value="all">All ({makers.length})</option>
          </select>
        </div>

        <button
          onClick={loadMakers}
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

      {/* Loading State */}
      {loading ? (
        <div className="loading">
          <div className="loading-spinner"></div>
          Loading makers...
        </div>
      ) : (
        <div className="makers-container">
          {filteredMakers.length === 0 ? (
            <div className="no-makers">
              <p>No makers found with status: {statusFilter}</p>
            </div>
          ) : (
            <div className="makers-table">
              <div className="table-header">
                <div className="table-row header-row">
                  <div className="col-product">Product</div>
                  <div className="col-category">Category</div>
                  <div className="col-date">Published</div>
                  <div className="col-description">Description</div>
                  <div className="col-maker">Maker</div>
                  <div className="col-linkedin">LinkedIn</div>
                  <div className="col-links">Links</div>
                  {statusFilter === 'pending' && <div className="col-actions">Actions</div>}
                </div>
              </div>
              
              <div className="table-body">
                {filteredMakers.map(maker => (
                  <div key={maker.id} className="table-row">
                    <div className="col-product" data-label="Product">
                      <strong>{maker.name}</strong>
                    </div>
                    
                    <div className="col-category" data-label="Category">
                      <span className="category-tag">
                        {maker.category.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                    </div>
                    
                    <div className="col-date" data-label="Published">
                      {formatDate(maker.publishedAt)}
                    </div>
                    
                    <div className="col-description" data-label="Description">
                      {truncateText(maker.description)}
                    </div>
                    
                    <div className="col-maker" data-label="Maker">
                      {maker.makerName || 'N/A'}
                    </div>
                    
                    <div className="col-linkedin" data-label="LinkedIn">
                      {maker.linkedin ? (
                        <a 
                          href={maker.linkedin} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="linkedin-link"
                        >
                          LinkedIn ↗
                        </a>
                      ) : (
                        <span className="no-linkedin">No LinkedIn</span>
                      )}
                    </div>
                    
                    <div className="col-links" data-label="Links">
                      <a 
                        href={maker.phLink} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="ph-link"
                      >
                        Product Hunt ↗
                      </a>
                    </div>
                    
                    {statusFilter === 'pending' && (
                      <div className="col-actions" data-label="Actions">
                        <button
                          onClick={() => handleApprove(maker.id)}
                          disabled={processingIds.has(maker.id)}
                          className="btn-approve"
                        >
                          {processingIds.has(maker.id) ? (
                            <span className="loading-spinner"></span>
                          ) : (
                            '✅'
                          )}
                          Approve
                        </button>
                        
                        <button
                          onClick={() => handleReject(maker.id)}
                          disabled={processingIds.has(maker.id)}
                          className="btn-reject"
                        >
                          {processingIds.has(maker.id) ? (
                            <span className="loading-spinner"></span>
                          ) : (
                            '❌'
                          )}
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
