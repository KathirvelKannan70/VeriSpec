import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, Check, X, Edit, Save, Play, Terminal, 
  Copy, CheckCircle, RefreshCw, Eye, FileCode, AlertTriangle,
  CheckSquare, Bug, Layers, Clipboard, AlertCircle
} from 'lucide-react';
import { API_BASE_URL } from '../config.js';

export default function AdminPanel({ 
  token,
  documents, 
  selectedDoc, 
  testCases, 
  script,
  defects = [],
  testRuns = [],
  onSelectDoc, 
  onRefreshDocs,
  fetchDocDetails 
}) {
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState('cases'); // 'cases' | 'manual' | 'script' | 'traceability'
  
  // Test case editing state
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSection, setEditSection] = useState('');
  const [editSteps, setEditSteps] = useState('');
  const [editExpected, setEditExpected] = useState('');

  // Terminal Runner states
  const [isRunning, setIsRunning] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [runnerStatus, setRunnerStatus] = useState(null); // 'passed' | 'failed'
  
  // Bug Ticket state
  const [bugTicket, setBugTicket] = useState(null);
  
  // Visual diff simulation
  const [showVisualDiff, setShowVisualDiff] = useState(false);
  
  // Multi-framework states
  const [selectedFramework, setSelectedFramework] = useState('playwright');
  const [frameworkCode, setFrameworkCode] = useState('');
  const [frameworkLoading, setFrameworkLoading] = useState(false);

  // Manual test runner states
  const [manualResults, setManualResults] = useState({});
  const [activeDefectTestCaseId, setActiveDefectTestCaseId] = useState(null);
  const [defectTitle, setDefectTitle] = useState('');
  const [defectDesc, setDefectDesc] = useState('');
  const [defectSeverity, setDefectSeverity] = useState('Medium');

  const terminalEndRef = useRef(null);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleLogs]);

  // Set default workspace tab and reload defaults
  useEffect(() => {
    if (selectedDoc) {
      if (selectedDoc.status === 'approved') {
        setActiveWorkspaceTab('script');
      } else {
        setActiveWorkspaceTab('cases');
      }
      
      // Initialize manual check results
      const initialResults = {};
      testCases.forEach(tc => {
        initialResults[tc.id] = { status: 'passed', actual: '' };
      });
      setManualResults(initialResults);
    }
    
    // Reset runner logs
    setConsoleLogs([]);
    setRunnerStatus(null);
    setBugTicket(null);
    setShowVisualDiff(false);
    setSelectedFramework('playwright');
  }, [selectedDoc?.id, testCases.length]);

  // Load code framework on changes
  useEffect(() => {
    if (selectedDoc && activeWorkspaceTab === 'script') {
      fetchFrameworkCode();
    }
  }, [selectedDoc?.id, selectedFramework, activeWorkspaceTab]);

  const fetchFrameworkCode = async () => {
    setFrameworkLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/${selectedDoc.id}/compile-framework?framework=${selectedFramework}`);
      if (res.ok) {
        const data = await res.json();
        setFrameworkCode(data.scriptCode);
      }
    } catch (err) {
      console.error('Failed to fetch compiled script:', err);
    } finally {
      setFrameworkLoading(false);
    }
  };

  // Approval Request Handlers
  const handleApprove = async () => {
    if (!selectedDoc) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/${selectedDoc.id}/approve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        onRefreshDocs();
        fetchDocDetails(selectedDoc.id);
        setActiveWorkspaceTab('script');
      } else {
        const err = await res.json();
        alert(err.error || 'Approval failed.');
      }
    } catch (err) {
      console.error('Approve action failed:', err);
    }
  };

  const handleReject = async () => {
    if (!selectedDoc) return;
    if (!confirm('Reject this document? It will be flagged for revisions.')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/${selectedDoc.id}/reject`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        onRefreshDocs();
        fetchDocDetails(selectedDoc.id);
      }
    } catch (err) {
      console.error('Reject action failed:', err);
    }
  };

  // Test Case Editor Handlers
  const startEdit = (tc) => {
    setEditingId(tc.id);
    setEditTitle(tc.title);
    setEditSection(tc.section);
    setEditSteps(tc.steps);
    setEditExpected(tc.expected);
  };

  const saveEdit = async (id) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/test-cases/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle,
          section: editSection,
          steps: editSteps,
          expected: editExpected
        })
      });
      if (res.ok) {
        setEditingId(null);
        fetchDocDetails(selectedDoc.id);
      } else {
        alert('Failed to save changes.');
      }
    } catch (err) {
      console.error('Error saving test case edit:', err);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  // Manual Test Run Submission
  const handleToggleManualStatus = (tcId, status) => {
    setManualResults(prev => ({
      ...prev,
      [tcId]: {
        ...prev[tcId],
        status
      }
    }));
  };

  const handleActualResultChange = (tcId, val) => {
    setManualResults(prev => ({
      ...prev,
      [tcId]: {
        ...prev[tcId],
        actual: val
      }
    }));
  };

  const handleSubmitManualRun = async () => {
    let passedCount = 0;
    let failedCount = 0;

    testCases.forEach(tc => {
      const res = manualResults[tc.id];
      if (res && res.status === 'passed') {
        passedCount++;
      } else {
        failedCount++;
      }
    });

    const status = failedCount > 0 ? 'failed' : 'passed';

    try {
      const res = await fetch(`${API_BASE_URL}/api/test-runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: selectedDoc.id,
          run_type: 'manual',
          status,
          passed_count: passedCount,
          failed_count: failedCount
        })
      });
      if (res.ok) {
        alert(`Manual run execution cycle saved! Result: ${status.toUpperCase()} (${passedCount} passed, ${failedCount} failed)`);
        fetchDocDetails(selectedDoc.id);
        setActiveWorkspaceTab('traceability');
      }
    } catch (err) {
      console.error('Failed to submit manual run:', err);
    }
  };

  // Defect Logging submit
  const openDefectForm = (tcId, defaultTitle) => {
    setActiveDefectTestCaseId(tcId);
    setDefectTitle(`[BUG] Failure in manual check: ${defaultTitle}`);
    setDefectDesc(`Steps to reproduce:\n1. Execute step checklist.\n\nActual outcome:\n\nExpected outcome:\n`);
    setDefectSeverity('High');
  };

  const handleLogDefectSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/api/defects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: selectedDoc.id,
          test_case_id: activeDefectTestCaseId,
          title: defectTitle,
          description: defectDesc,
          severity: defectSeverity
        })
      });
      if (res.ok) {
        alert('QA defect ticket logged in SQLite database!');
        setActiveDefectTestCaseId(null);
        setDefectTitle('');
        setDefectDesc('');
        fetchDocDetails(selectedDoc.id);
      }
    } catch (err) {
      console.error('Failed to log bug:', err);
    }
  };

  const handleResolveDefect = async (id) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/defects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Resolved' })
      });
      if (res.ok) {
        fetchDocDetails(selectedDoc.id);
      }
    } catch (err) {
      console.error('Failed to resolve defect:', err);
    }
  };

  // Playwright Executable Script Runner (Streams SSE)
  const handleRunScript = () => {
    if (!selectedDoc) return;
    setIsRunning(true);
    setConsoleLogs([]);
    setRunnerStatus(null);
    setBugTicket(null);
    setShowVisualDiff(false);

    const eventSource = new EventSource(`${API_BASE_URL}/api/documents/${selectedDoc.id}/run-script`);
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.log) {
        setConsoleLogs(prev => [...prev, data.log]);
        if (data.log.includes('Visual analysis reports element hidden') || data.log.includes('mismatch')) {
          setShowVisualDiff(true);
        }
      }
      
      if (data.done) {
        setRunnerStatus(data.status);
        setIsRunning(false);
        eventSource.close();
        fetchDocDetails(selectedDoc.id); // refresh executions log in dashboard
        
        if (data.status === 'failed') {
          setBugTicket({
            title: `[QA-BUG-${selectedDoc.id}] Automation Failure in: Verify Audit Trail Integrity`,
            severity: 'High',
            description: `Visual Regression detected a failure during Playwright run. The expected Audit Log history panel ('div.log-history-panel') was not rendered or was hidden.`,
            steps: `1. Log in to the application.\n2. Modify deduction audit values.\n3. Attempt to save modifications.\n4. Click 'View Audit Trail' panel.`,
            expected: `System should render full audit history table.`,
            actual: `Audit log table failed to render due to hidden element in DOM.`
          });
        }
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE connection error:', err);
      setConsoleLogs(prev => [...prev, '❌ Server connection lost or test compilation failure.']);
      setIsRunning(false);
      eventSource.close();
    };
  };

  // Helper styling for console outputs
  const getLogClassName = (line) => {
    if (line.startsWith('[WK-QA-RUNNER]')) return 'terminal-line-runner';
    if (line.startsWith('[TEST]')) return 'terminal-line-test';
    if (line.startsWith('[STEP]')) return 'terminal-line-step';
    if (line.startsWith('[ASSERT]')) return 'terminal-line-assert';
    if (line.includes('✅') || line.includes('Passed')) return 'terminal-line-success';
    if (line.includes('❌') || line.includes('Failed')) return 'terminal-line-error';
    if (line.startsWith('[AI Self-Healing]')) return 'terminal-line-healing';
    if (line.startsWith('[VISUAL REGRESSION]')) return 'terminal-line-visual';
    return '';
  };

  const copyScriptToClipboard = () => {
    if (frameworkCode) {
      navigator.clipboard.writeText(frameworkCode);
      alert('Automation script copied to clipboard!');
    }
  };

  return (
    <div className="grid-dashboard">
      {/* Sidebar: Requests Queue */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div>
          <h2 className="card-title">
            <Shield size={18} style={{ color: 'var(--primary-light)' }} />
            Approval Requests
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Review pending requirements and compile automation suites.
          </p>

          <div className="doc-list" style={{ maxHeight: '550px' }}>
            {documents.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>
                No active requirements loaded.
              </div>
            ) : (
              documents.map((doc) => (
                <div 
                  key={doc.id}
                  className={`doc-item ${selectedDoc?.id === doc.id ? 'selected' : ''}`}
                  onClick={() => onSelectDoc(doc.id)}
                >
                  <div className="doc-info">
                    <div className="doc-name" title={doc.filename}>{doc.filename}</div>
                    <div className="doc-meta">ID: #{doc.id}</div>
                  </div>
                  <span className={`status-badge status-${doc.status}`}>
                    {doc.status === 'pending_approval' ? 'Pending' : doc.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Main Panel Workspace */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
        {selectedDoc ? (
          <div>
            {/* Header with Title and Approve Actions */}
            <div className="workspace-header">
              <div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Shield size={22} style={{ color: 'var(--primary-light)' }} />
                  {selectedDoc.filename}
                </h1>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  SRS Document status: 
                  <span className={`status-badge status-${selectedDoc.status}`} style={{ marginLeft: '0.5rem' }}>
                    {selectedDoc.status === 'pending_approval' ? 'Pending Review' : selectedDoc.status}
                  </span>
                </p>
              </div>

              {selectedDoc.status === 'pending_approval' && (
                <div className="workspace-actions">
                  <button 
                    className="nav-btn btn-secondary" 
                    onClick={handleReject}
                    style={{ border: '1px solid var(--error)', color: 'var(--error)' }}
                  >
                    <X size={16} /> Reject
                  </button>
                  <button 
                    className="nav-btn btn-primary"
                    onClick={handleApprove}
                    style={{ background: 'linear-gradient(135deg, var(--success), #059669)' }}
                  >
                    <Check size={16} /> Approve & Compile
                  </button>
                </div>
              )}
            </div>

            {/* Navigation Tabs covering Manual and Automated suites */}
            <div className="tabs-header">
              <button 
                className={`tab-btn ${activeWorkspaceTab === 'cases' ? 'active' : ''}`}
                onClick={() => setActiveWorkspaceTab('cases')}
              >
                <FileCode size={16} /> Specification Review
              </button>
              
              <button 
                className={`tab-btn ${activeWorkspaceTab === 'manual' ? 'active' : ''}`}
                onClick={() => setActiveWorkspaceTab('manual')}
              >
                <CheckSquare size={16} /> Manual Worksheet
              </button>
              
              {selectedDoc.status === 'approved' && (
                <button 
                  className={`tab-btn ${activeWorkspaceTab === 'script' ? 'active' : ''}`}
                  onClick={() => setActiveWorkspaceTab('script')}
                >
                  <Terminal size={16} /> Automation Studio
                </button>
              )}

              <button 
                className={`tab-btn ${activeWorkspaceTab === 'traceability' ? 'active' : ''}`}
                onClick={() => setActiveWorkspaceTab('traceability')}
              >
                <Layers size={16} /> Traceability Hub
              </button>
            </div>

            {/* Tab 1: Test Cases Editor view */}
            {activeWorkspaceTab === 'cases' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                  <h3 style={{ fontSize: '1.1rem', color: '#fff' }}>Review & Edit Test Verification Criteria</h3>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Admin Mode: Click <b>Edit</b> to adjust requirements inline.
                  </div>
                </div>

                <div className="testcase-grid">
                  {testCases.map((tc) => (
                    <div key={tc.id} className="testcase-card">
                      {editingId === tc.id ? (
                        /* Editing view */
                        <div className="testcase-edit-form">
                          <div className="form-group">
                            <label className="form-label">Test Case Section</label>
                            <input 
                              type="text" 
                              className="form-input" 
                              value={editSection}
                              onChange={(e) => setEditSection(e.target.value)}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Test Case Title</label>
                            <input 
                              type="text" 
                              className="form-input" 
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Execution Steps</label>
                            <textarea 
                              className="form-textarea" 
                              value={editSteps}
                              onChange={(e) => setEditSteps(e.target.value)}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Expected Outcome</label>
                            <textarea 
                              className="form-textarea" 
                              value={editExpected}
                              onChange={(e) => setEditExpected(e.target.value)}
                            />
                          </div>
                          <div className="edit-actions">
                            <button className="nav-btn btn-secondary" onClick={cancelEdit}>Cancel</button>
                            <button className="nav-btn btn-primary" onClick={() => saveEdit(tc.id)}>
                              <Save size={14} /> Save Changes
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Normal read view with Edit action */
                        <div>
                          <div className="testcase-header">
                            <span className="testcase-title">TC-{tc.id}: {tc.title}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <span className="testcase-section">{tc.section}</span>
                              <button 
                                className="btn-secondary" 
                                style={{ padding: '0.2rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', borderRadius: '4px' }}
                                onClick={() => startEdit(tc)}
                              >
                                <Edit size={12} /> Edit
                              </button>
                            </div>
                          </div>
                          <div className="testcase-body">
                            <div className="tc-block">
                              <span className="tc-label">Execution Steps</span>
                              <div className="tc-value">{tc.steps}</div>
                            </div>
                            <div className="tc-block">
                              <span className="tc-label">Expected Result</span>
                              <div className="tc-value" style={{ color: 'var(--primary-light)' }}>{tc.expected}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab 2: Manual Test Run Worksheet */}
            {activeWorkspaceTab === 'manual' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                  <h3 style={{ fontSize: '1.1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CheckSquare size={20} style={{ color: 'var(--primary-light)' }} />
                    Manual Test Run Checklist
                  </h3>
                  <button 
                    className="btn-primary"
                    onClick={handleSubmitManualRun}
                    style={{ background: 'linear-gradient(135deg, var(--success), #059669)', padding: '0.5rem 1.2rem', cursor: 'pointer' }}
                  >
                    Submit Run Session
                  </button>
                </div>

                <div className="testcase-grid">
                  {testCases.map((tc) => {
                    const result = manualResults[tc.id] || { status: 'passed', actual: '' };
                    return (
                      <div key={tc.id} className="testcase-card" style={{ borderColor: result.status === 'failed' ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-color)' }}>
                        <div className="testcase-header" style={{ background: result.status === 'failed' ? 'rgba(239, 68, 68, 0.05)' : '' }}>
                          <span className="testcase-title">TC-{tc.id}: {tc.title}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            {/* Toggle pass fail */}
                            <button 
                              className={`nav-btn`}
                              style={{ 
                                padding: '0.25rem 0.6rem', 
                                fontSize: '0.7rem', 
                                background: result.status === 'passed' ? 'var(--success)' : 'transparent',
                                border: '1px solid var(--success)',
                                color: result.status === 'passed' ? 'white' : 'var(--success)',
                                cursor: 'pointer'
                              }}
                              onClick={() => handleToggleManualStatus(tc.id, 'passed')}
                            >
                              Pass
                            </button>
                            <button 
                              className={`nav-btn`}
                              style={{ 
                                padding: '0.25rem 0.6rem', 
                                fontSize: '0.7rem', 
                                background: result.status === 'failed' ? 'var(--error)' : 'transparent',
                                border: '1px solid var(--error)',
                                color: result.status === 'failed' ? 'white' : 'var(--error)',
                                cursor: 'pointer'
                              }}
                              onClick={() => handleToggleManualStatus(tc.id, 'failed')}
                            >
                              Fail
                            </button>
                          </div>
                        </div>
                        
                        <div className="testcase-body" style={{ gridTemplateColumns: '1.2fr 1fr' }}>
                          <div className="tc-block">
                            <span className="tc-label">Execution Steps Checklist</span>
                            <div className="tc-value" style={{ fontSize: '0.85rem' }}>{tc.steps}</div>
                            <div className="tc-value" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                              <b>Expected outcome:</b> {tc.expected}
                            </div>
                          </div>
                          
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div className="form-group">
                              <label className="form-label">Actual Result / Comments</label>
                              <input 
                                type="text" 
                                className="form-input" 
                                placeholder="E.g., Verified successfully, matches spec..." 
                                value={result.actual}
                                onChange={(e) => handleActualResultChange(tc.id, e.target.value)}
                              />
                            </div>
                            
                            {result.status === 'failed' && (
                              <button 
                                className="btn-secondary"
                                style={{ border: '1px solid var(--warning)', color: 'var(--warning)', fontSize: '0.75rem', padding: '0.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}
                                onClick={() => openDefectForm(tc.id, tc.title)}
                              >
                                <Bug size={13} /> Log QA Defect Ticket
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Inline Defect Modal Form overlay */}
                {activeDefectTestCaseId && (
                  <div className="modal-overlay">
                    <div className="login-modal glass-card" style={{ maxWidth: '500px' }}>
                      <div className="login-header">
                        <h2 className="login-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                          <Bug style={{ color: 'var(--error)' }} />
                          Log QA Compliance Defect
                        </h2>
                        <p className="login-subtitle">Log new issue directly in SQLite QA backlog</p>
                      </div>
                      
                      <form onSubmit={handleLogDefectSubmit} className="login-body">
                        <div className="form-group" style={{ marginBottom: '1rem' }}>
                          <label className="form-label">Bug Title</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            value={defectTitle}
                            onChange={(e) => setDefectTitle(e.target.value)}
                            required
                          />
                        </div>

                        <div className="form-group" style={{ marginBottom: '1rem' }}>
                          <label className="form-label">Severity Level</label>
                          <select 
                            className="form-input"
                            value={defectSeverity}
                            onChange={(e) => setDefectSeverity(e.target.value)}
                            style={{ background: 'var(--bg-primary)' }}
                          >
                            <option value="Low">Low (Minor UI issue)</option>
                            <option value="Medium">Medium (Functional quirk)</option>
                            <option value="High">High (Major requirement breach)</option>
                            <option value="Critical">Critical (Security/System Blocked)</option>
                          </select>
                        </div>

                        <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                          <label className="form-label">Failure Description & Steps</label>
                          <textarea 
                            className="form-textarea" 
                            value={defectDesc}
                            onChange={(e) => setDefectDesc(e.target.value)}
                            required
                            style={{ minHeight: '140px' }}
                          />
                        </div>

                        <div className="edit-actions">
                          <button type="button" className="btn-secondary" onClick={() => setActiveDefectTestCaseId(null)}>Cancel</button>
                          <button type="submit" className="btn-primary" style={{ background: 'var(--error)' }}>
                            Submit Defect Ticket
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Script Editor & Console Terminal Runner */}
            {activeWorkspaceTab === 'script' && script && (
              <div className="admin-workspace-grid">
                {/* Left: Code Editor showing generated framework tests */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <h3 style={{ fontSize: '1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FileCode size={18} style={{ color: 'var(--primary-light)' }} />
                        Automation Code
                      </h3>
                      {/* Framework compiler switcher */}
                      <select 
                        className="form-input" 
                        value={selectedFramework}
                        onChange={(e) => setSelectedFramework(e.target.value)}
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '4px', border: '1px solid var(--border-color)', color: 'white' }}
                      >
                        <option value="playwright">Playwright (JS)</option>
                        <option value="cypress">Cypress (JS)</option>
                        <option value="selenium">Selenium (Java JUnit)</option>
                      </select>
                    </div>
                    <button 
                      className="btn-secondary" 
                      onClick={copyScriptToClipboard}
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                      <Copy size={13} /> Copy Code
                    </button>
                  </div>
                  
                  <div className="editor-container">
                    <div className="editor-header">
                      <div className="editor-tabs">
                        <div className="editor-tab">
                          <span>
                            {selectedFramework === 'selenium' ? 'ComplianceTest.java' : `document_${selectedDoc.id}.spec.js`}
                          </span>
                        </div>
                      </div>
                      <span>
                        {selectedFramework === 'selenium' ? 'Java (JUnit)' : 'JavaScript'}
                      </span>
                    </div>
                    <div className="editor-body">
                      {frameworkLoading ? (
                        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '3rem' }}>
                          <RefreshCw className="spin" size={24} style={{ marginBottom: '1rem' }} />
                          Compiling test suite modules...
                        </div>
                      ) : (
                        frameworkCode
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Console execution output & visual diff validation */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifySelf: 'stretch', justifyContent: 'space-between' }}>
                    <h3 style={{ fontSize: '1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Terminal size={18} style={{ color: 'var(--primary-light)' }} />
                      Live Terminal Runner
                    </h3>
                    
                    <button 
                      className="btn-primary" 
                      onClick={handleRunScript}
                      disabled={isRunning || selectedFramework !== 'playwright'}
                      style={{ 
                        padding: '0.5rem 1rem', 
                        fontSize: '0.8rem', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.5rem',
                        cursor: (isRunning || selectedFramework !== 'playwright') ? 'not-allowed' : 'pointer',
                        opacity: selectedFramework !== 'playwright' ? 0.5 : 1
                      }}
                      title={selectedFramework !== 'playwright' ? 'Local execution runner only supports Playwright' : ''}
                    >
                      {isRunning ? <RefreshCw className="spin" size={14} /> : <Play size={14} />}
                      Run Playwright Suite
                    </button>
                  </div>

                  {/* Terminal Component */}
                  <div className="terminal-container">
                    <div className="terminal-header">
                      <div className="terminal-dots">
                        <span className="terminal-dot td-red"></span>
                        <span className="terminal-dot td-yellow"></span>
                        <span className="terminal-dot td-green"></span>
                      </div>
                      <span>bash (Playwright Runner)</span>
                    </div>
                    <div className="terminal-body">
                      {consoleLogs.length === 0 ? (
                        <div style={{ color: 'var(--text-muted)', textAlign: 'center', margin: 'auto 0' }}>
                          Console Idle. Click "Run Playwright Suite" to compile and run tests on SQLite records.
                        </div>
                      ) : (
                        consoleLogs.map((line, idx) => (
                          <div key={idx} className={`terminal-line ${getLogClassName(line)}`}>
                            {line}
                          </div>
                        ))
                      )}
                      <div ref={terminalEndRef} />
                    </div>
                  </div>

                  {/* Visual Regression Diff Simulator */}
                  {showVisualDiff && (
                    <div className="glass-card" style={{ padding: '1.25rem', borderColor: 'var(--error)' }}>
                      <h4 style={{ fontSize: '0.9rem', color: '#fff', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <AlertTriangle size={15} style={{ color: 'var(--error)' }} />
                        Visual Regression Mismatch
                      </h4>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                        Playwright visual comparator detected coordinate changes in the <b>Audit Logs panel</b> layout.
                      </p>
                      
                      <div className="visual-diff-panel">
                        <div className="diff-image-card">
                          <span className="diff-image-title">Baseline QA Spec</span>
                          <div className="diff-image-wrapper">
                            <div className="diff-canvas-preview">
                              <div className="diff-canvas-navbar"></div>
                              <div className="diff-canvas-content">
                                <div className="diff-canvas-sidebar"></div>
                                <div className="diff-canvas-body">
                                  <div className="diff-canvas-element"></div>
                                  <div className="diff-canvas-element"></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="diff-image-card">
                          <span className="diff-image-title" style={{ color: 'var(--error)' }}>Actual Run (Diff)</span>
                          <div className="diff-image-wrapper">
                            <div className="diff-canvas-preview" style={{ borderColor: 'var(--error)' }}>
                              <div className="diff-canvas-navbar"></div>
                              <div className="diff-canvas-content">
                                <div className="diff-canvas-sidebar"></div>
                                <div className="diff-canvas-body">
                                  <div className="diff-canvas-element"></div>
                                  <div className="diff-pulse-marker"></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Bug Ticket Card output (when failed) */}
                  {bugTicket && (
                    <div className="glass-card" style={{ padding: '1.25rem', borderColor: 'var(--warning)' }}>
                      <h4 style={{ fontSize: '0.9rem', color: '#fff', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <AlertTriangle size={15} style={{ color: 'var(--warning)' }} />
                        Auto-Generated Jira Ticket Template
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.8rem', border: '1px solid var(--border-color)', padding: '1rem', borderRadius: '4px', background: 'var(--bg-secondary)' }}>
                        <div><b>Summary:</b> {bugTicket.title}</div>
                        <div><b>Priority:</b> <span style={{ color: 'var(--error)' }}>{bugTicket.severity}</span></div>
                        <div><b>Description:</b> {bugTicket.description}</div>
                        <div><b>Steps to Reproduce:</b> <pre style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', marginTop: '0.25rem', fontSize: '0.75rem' }}>{bugTicket.steps}</pre></div>
                      </div>
                      <button 
                        className="btn-secondary" 
                        onClick={() => {
                          navigator.clipboard.writeText(JSON.stringify(bugTicket, null, 2));
                          alert('Bug ticket template JSON copied to clipboard!');
                        }}
                        style={{ marginTop: '0.75rem', width: '100%', padding: '0.4rem', fontSize: '0.75rem' }}
                      >
                        Copy Bug JSON Payload
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 4: Traceability Hub & Defect Backlog */}
            {activeWorkspaceTab === 'traceability' && (
              <div>
                {/* Visual stats and ratios */}
                <div className="metric-grid">
                  <div className="metric-card">
                    <div className="metric-val" style={{ color: 'var(--primary-light)' }}>
                      {testCases.length > 0 ? '100%' : '0%'}
                    </div>
                    <div className="metric-lbl">Requirement Coverage</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-val" style={{ color: 'var(--success)' }}>
                      {testRuns.filter(tr => tr.status === 'passed').length} / {testRuns.length}
                    </div>
                    <div className="metric-lbl">Successful Runs</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-val" style={{ color: defects.filter(d => d.status === 'Open').length > 0 ? 'var(--error)' : 'var(--success)' }}>
                      {defects.filter(d => d.status === 'Open').length}
                    </div>
                    <div className="metric-lbl">Open Defects</div>
                  </div>
                </div>

                {/* Traceability matrix grid table */}
                <h3 style={{ fontSize: '1rem', color: '#fff', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Layers size={18} style={{ color: 'var(--primary-light)' }} />
                  Compliance Traceability Matrix
                </h3>
                
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginBottom: '2.5rem', textAlign: 'left', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>Req Section</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Manual Test ID & Title</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Automation Script</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Last Run Result</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Active Bugs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {testCases.map((tc, idx) => {
                      const linkedBugs = defects.filter(d => d.test_case_id === tc.id);
                      return (
                        <tr key={tc.id} style={{ borderBottom: '1px solid var(--border-color)', background: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>{tc.section}</td>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>TC-{tc.id}: {tc.title}</td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span className={`status-badge ${selectedDoc.status === 'approved' ? 'status-approved' : 'status-pending'}`}>
                              {selectedDoc.status === 'approved' ? 'Yes (Playwright/Selenium)' : 'No'}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            {testRuns.length > 0 ? (
                              <span className={`status-badge status-${testRuns[0].status}`}>
                                {testRuns[0].status.toUpperCase()}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>Not Executed</span>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            {linkedBugs.length > 0 ? (
                              linkedBugs.map(bug => (
                                <div key={bug.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: bug.status === 'Open' ? 'var(--error)' : 'var(--success)' }}>
                                  <Bug size={12} />
                                  <span>BUG-{bug.id} ({bug.status})</span>
                                </div>
                              ))
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>None</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* SQLite Defect tracking list */}
                <h3 style={{ fontSize: '1rem', color: '#fff', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Bug size={18} style={{ color: 'var(--error)' }} />
                  QA Defect Backlog (SQLite Storage)
                </h3>

                {defects.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1.5rem 0', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                    No defects logged for this specification.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {defects.map(bug => (
                      <div key={bug.id} className="testcase-card" style={{ borderColor: bug.status === 'Open' ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-color)' }}>
                        <div className="testcase-header" style={{ padding: '0.75rem 1.25rem', background: bug.status === 'Resolved' ? 'rgba(16, 185, 129, 0.05)' : '' }}>
                          <span style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', color: bug.status === 'Open' ? 'var(--error)' : 'var(--success)' }}>
                            <Bug size={14} /> BUG-{bug.id}: {bug.title}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span className="status-badge" style={{ background: bug.severity === 'Critical' || bug.severity === 'High' ? 'var(--error-glow)' : 'var(--warning-glow)', color: bug.severity === 'Critical' || bug.severity === 'High' ? 'var(--error)' : 'var(--warning)' }}>
                              Severity: {bug.severity}
                            </span>
                            
                            {bug.status === 'Open' ? (
                              <button 
                                className="btn-primary"
                                style={{ background: 'var(--success)', padding: '0.2rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer' }}
                                onClick={() => handleResolveDefect(bug.id)}
                              >
                                Resolve bug
                              </button>
                            ) : (
                              <span className="status-badge status-approved">Resolved</span>
                            )}
                          </div>
                        </div>
                        <div className="testcase-body" style={{ padding: '1rem 1.25rem', gridTemplateColumns: '1fr' }}>
                          <div className="tc-value" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            {bug.description}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state">
            <Shield className="empty-icon" />
            <h3 className="empty-title">Select Document to Audit</h3>
            <p className="empty-subtitle">Select an SRS specification upload from the left column queue to begin administrative verification, code generation, and automation execution runs.</p>
          </div>
        )}
      </div>
    </div>
  );
}
