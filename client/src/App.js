import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import './App.css';
import AdminPanel from './components/AdminPanel';
import MainDashboard from './components/MainDashboard';

// Navigation component
const Navigation = () => {
  const location = useLocation();
  
  return (
    <nav className="navigation">
      <div className="nav-content">
        <div className="nav-brand">
          <h1>🚀 Product Hunt Finder</h1>
        </div>
        <div className="nav-links">
          <Link 
            to="/" 
            className={location.pathname === '/' ? 'nav-link active' : 'nav-link'}
          >
            📊 Dashboard
          </Link>
          <Link 
            to="/admin" 
            className={location.pathname === '/admin' ? 'nav-link active' : 'nav-link'}
          >
            🛠️ Admin Panel
          </Link>
        </div>
      </div>
    </nav>
  );
};

function App() {
  return (
    <Router>
      <div className="app">
        <Navigation />
        
        <Routes>
          <Route path="/" element={<MainDashboard />} />
          <Route path="/admin" element={<AdminPanel />} />
        </Routes>
        
        {/* Footer */}
        <footer className="footer">
          <div>
            <p>© 2025 Product Hunt Finder - Built for discovering amazing products</p>
          </div>
        </footer>
      </div>
    </Router>
  );
}

export default App;
