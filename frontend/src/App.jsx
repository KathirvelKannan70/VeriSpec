import React, { useState, useEffect } from 'react';
import { 
  FileText, Shield, LogOut, Cpu, 
  HelpCircle, CheckCircle, RefreshCw, LogIn
} from 'lucide-react';
import UserPanel from './components/UserPanel.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import { API_BASE_URL } from './config.js';

export default function App() {
  const [activeTab, setActiveTab] = useState('user'); // 'user' | 'admin'
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [testCases, setTestCases] = useState([]);
  const [script, setScript] = useState(null);
  const [defects, setDefects] = useState([]);
  const [testRuns, setTestRuns] = useState([]);
  
  // Auth state
  const [token, setToken] = useState(localStorage.getItem('wk_auth_token') || '');
  const [user, setUser] = useState(localStorage.getItem('wk_username') || '');
  const [role, setRole] = useState(localStorage.getItem('wk_role') || '');
  
  // Login Modal
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Fetch documents list on load
  const fetchDocuments = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
        
        // Auto-select first document if none selected
        if (data.length > 0 && !selectedDoc) {
          fetchDocumentDetails(data[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    }
  };

  const fetchDocumentDetails = async (docId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/${docId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedDoc(data.doc);
        setTestCases(data.testCases);
        setScript(data.script);
        setDefects(data.defects || []);
        setTestRuns(data.testRuns || []);
      }
    } catch (err) {
      console.error('Failed to fetch document details:', err);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [selectedDoc?.id]);

  const handleSelectDoc = (docId) => {
    fetchDocumentDetails(docId);
  };

  // Auth Handling
  const handleOpenLogin = () => {
    setLoginUsername('');
    setLoginPassword('');
    setLoginError('');
    setIsLoginModalOpen(true);
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || 'Login failed');
        return;
      }
      // Save credentials
      localStorage.setItem('wk_auth_token', data.token);
      localStorage.setItem('wk_username', data.username);
      localStorage.setItem('wk_role', data.role);
      
      setToken(data.token);
      setUser(data.username);
      setRole(data.role);
      setIsLoginModalOpen(false);

      if (data.role === 'admin') {
        setActiveTab('admin');
      }
    } catch (err) {
      setLoginError('Server connection error.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('wk_auth_token');
    localStorage.removeItem('wk_username');
    localStorage.removeItem('wk_role');
    setToken('');
    setUser('');
    setRole('');
    setActiveTab('user');
  };

  return (
    <div className="app-container">
      {/* Premium Navbar */}
      <header className="navbar">
        <div className="brand">
          <div className="logo-dot"></div>
          Wolters Kluwer <span>VeriSpec</span>
        </div>

        <div className="nav-links">
          <button 
            className={`nav-btn ${activeTab === 'user' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('user')}
          >
            <Cpu size={16} /> User Portal
          </button>
          
          {role === 'admin' ? (
            <button 
              className={`nav-btn ${activeTab === 'admin' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('admin')}
            >
              <Shield size={16} /> Admin Panel
            </button>
          ) : (
            <button 
              className="nav-btn btn-secondary"
              onClick={handleOpenLogin}
            >
              <LogIn size={16} /> Admin Login
            </button>
          )}

          {user && (
            <div className="user-tag">
              <Shield size={14} style={{ color: role === 'admin' ? '#10b981' : '#f59e0b' }} />
              <span>{user} ({role})</span>
              <button 
                onClick={handleLogout} 
                style={{ background: 'none', border: 'none', color: '#ef4444', marginLeft: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                title="Logout"
              >
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="main-content">
        {activeTab === 'user' ? (
          <UserPanel 
            documents={documents}
            selectedDoc={selectedDoc}
            testCases={testCases}
            onSelectDoc={handleSelectDoc}
            onUploadSuccess={fetchDocuments}
            fetchDocDetails={fetchDocumentDetails}
          />
        ) : (
          <AdminPanel 
            token={token}
            documents={documents}
            selectedDoc={selectedDoc}
            testCases={testCases}
            script={script}
            defects={defects}
            testRuns={testRuns}
            onSelectDoc={handleSelectDoc}
            onRefreshDocs={fetchDocuments}
            fetchDocDetails={fetchDocumentDetails}
          />
        )}
      </main>

      {/* Login Modal */}
      {isLoginModalOpen && (
        <div className="modal-overlay">
          <div className="login-modal glass-card">
            <div className="login-header">
              <h2 className="login-title">Admin Authorization</h2>
              <p className="login-subtitle">Enter Wolters Kluwer administrative credentials</p>
            </div>
            
            <form onSubmit={handleLoginSubmit} className="login-body">
              {loginError && <div className="error-message">{loginError}</div>}
              
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Username</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="e.g. admin"
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">Password</label>
                <input 
                  type="password" 
                  className="form-input" 
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              <button type="submit" className="btn-primary" style={{ width: '100%', padding: '0.8rem', borderRadius: 'var(--radius-md)', fontWeight: 'bold', cursor: 'pointer' }}>
                Authenticate Securely
              </button>
            </form>

            <div className="login-footer">
              <button 
                className="btn-secondary" 
                onClick={() => setIsLoginModalOpen(false)}
                style={{ width: '100%', padding: '0.8rem', borderRadius: 'var(--radius-md)' }}
              >
                Cancel
              </button>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '1rem' }}>
                Tip: Seeded admin credentials are <code>admin</code> / <code>admin123</code>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
