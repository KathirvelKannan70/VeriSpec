import React, { useState } from 'react';
import { 
  Upload, FileText, CheckCircle2, AlertCircle, 
  Trash2, Send, HelpCircle, FileCode, Check, RefreshCw 
} from 'lucide-react';
import { API_BASE_URL } from '../config.js';

export default function UserPanel({ 
  documents, 
  selectedDoc, 
  testCases, 
  onSelectDoc, 
  onUploadSuccess,
  fetchDocDetails 
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [srsTitle, setSrsTitle] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      await uploadFile(file);
    }
  };

  const handleFileChange = async (e) => {
    if (e.target.files && e.target.files[0]) {
      await uploadFile(e.target.files[0]);
    }
  };

  // Upload file API call
  const uploadFile = async (file) => {
    setIsUploading(true);
    setUploadError('');
    const formData = new FormData();
    formData.append('srsFile', file);

    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || 'Failed to upload document.');
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
      onUploadSuccess();
      if (data.documentId) {
        fetchDocDetails(data.documentId);
      }
    } catch (err) {
      setUploadError('Network error uploading file.');
      setIsUploading(false);
    }
  };

  // Text-based SRS submission
  const handleTextSubmit = async (e) => {
    e.preventDefault();
    if (!textInput.trim()) return;

    setIsUploading(true);
    setUploadError('');
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: srsTitle.trim() || 'Custom_Requirements_Doc.txt',
          textInput
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || 'Failed to submit requirements.');
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
      setTextInput('');
      setSrsTitle('');
      onUploadSuccess();
      if (data.documentId) {
        fetchDocDetails(data.documentId);
      }
    } catch (err) {
      setUploadError('Network error submitting text.');
      setIsUploading(false);
    }
  };

  // Delete Document
  const handleDeleteDoc = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this document and its test cases?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/${id}`, { method: 'DELETE' });
      if (res.ok) {
        onUploadSuccess();
      }
    } catch (err) {
      console.error('Failed to delete document:', err);
    }
  };

  return (
    <div className="grid-dashboard">
      {/* Sidebar: Upload & Documents Queue */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div>
          <h2 className="card-title">
            <Upload size={18} style={{ color: 'var(--primary-light)' }} />
            Ingest Specification
          </h2>
          
          {uploadError && <div className="error-message">{uploadError}</div>}

          {/* Drag & Drop File Zone */}
          <div 
            className={`dropzone ${isDragOver ? 'active' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-upload').click()}
          >
            <Upload className="drop-icon" />
            <p>Drag and drop your SRS document, or click to upload</p>
            <span className="dropzone-label">Supports txt, md, pdf</span>
            <input 
              type="file" 
              id="file-upload" 
              className="file-input" 
              onChange={handleFileChange}
              accept=".txt,.md,.pdf"
            />
          </div>

          <div className="text-divider">Or Paste SRS Text</div>

          {/* Textarea Input option */}
          <form onSubmit={handleTextSubmit}>
            <input 
              type="text" 
              placeholder="Requirement Title (optional)" 
              className="form-input" 
              style={{ width: '100%', marginBottom: '0.5rem', background: 'var(--bg-secondary)' }}
              value={srsTitle}
              onChange={(e) => setSrsTitle(e.target.value)}
            />
            <textarea 
              placeholder="E.g., The system shall allow administrators to view audit reports. The password validation must enforce 8 characters..."
              className="text-input-area"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              required
            />
            <button 
              type="submit" 
              className="btn-primary" 
              style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'pointer' }}
              disabled={isUploading}
            >
              {isUploading ? <RefreshCw className="spin" size={16} /> : <Send size={16} />}
              Generate Test Cases
            </button>
          </form>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)' }} />

        {/* Uploaded Documents List */}
        <div>
          <h3 style={{ fontSize: '1rem', color: '#fff', marginBottom: '1rem' }}>Active Document Queue</h3>
          {documents.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>
              No requirements uploaded yet.
            </div>
          ) : (
            <div className="doc-list">
              {documents.map((doc) => (
                <div 
                  key={doc.id}
                  className={`doc-item ${selectedDoc?.id === doc.id ? 'selected' : ''}`}
                  onClick={() => onSelectDoc(doc.id)}
                >
                  <div className="doc-info">
                    <div className="doc-name" title={doc.filename}>{doc.filename}</div>
                    <div className="doc-meta">ID: #{doc.id}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className={`status-badge status-${doc.status}`}>
                      {doc.status === 'pending_approval' ? 'Pending' : doc.status}
                    </span>
                    <button 
                      className="btn-secondary" 
                      style={{ padding: '0.3rem', borderRadius: '4px', border: 'none' }}
                      onClick={(e) => handleDeleteDoc(doc.id, e)}
                    >
                      <Trash2 size={13} style={{ color: 'var(--text-muted)' }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Workspace: Generated Test Cases Display */}
      <div className="glass-card">
        {selectedDoc ? (
          <div>
            <div className="workspace-header">
              <div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <FileText style={{ color: 'var(--primary-light)' }} />
                  {selectedDoc.filename}
                </h1>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  Ingested SRS Status: 
                  <span className={`status-badge status-${selectedDoc.status}`} style={{ marginLeft: '0.5rem' }}>
                    {selectedDoc.status === 'pending_approval' ? 'Pending Approval' : selectedDoc.status}
                  </span>
                </p>
              </div>

              {selectedDoc.status === 'approved' && (
                <div className="status-badge status-approved" style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}>
                  <Check size={16} /> Ready for Automation
                </div>
              )}
            </div>

            {/* Test Case Metrics summary */}
            <div className="metric-grid">
              <div className="metric-card">
                <div className="metric-val">{testCases.length}</div>
                <div className="metric-lbl">Total Test Cases</div>
              </div>
              <div className="metric-card">
                <div className="metric-val" style={{ color: 'var(--primary-light)' }}>
                  {new Set(testCases.map(t => t.section)).size}
                </div>
                <div className="metric-lbl">Sections Covered</div>
              </div>
              <div className="metric-card">
                <div className="metric-val" style={{ color: selectedDoc.status === 'approved' ? 'var(--success)' : 'var(--warning)' }}>
                  {selectedDoc.status === 'approved' ? '100%' : '0%'}
                </div>
                <div className="metric-lbl">Approved Status</div>
              </div>
            </div>

            <h3 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '1.25rem' }}>Generated QA Verification Cases</h3>

            {/* Cards for each test case */}
            <div className="testcase-grid">
              {testCases.map((tc) => (
                <div key={tc.id} className="testcase-card">
                  <div className="testcase-header">
                    <span className="testcase-title">TC-{tc.id}: {tc.title}</span>
                    <span className="testcase-section">{tc.section}</span>
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
              ))}
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <FileText className="empty-icon" />
            <h3 className="empty-title">No Document Selected</h3>
            <p className="empty-subtitle">Upload an SRS specification document or select an existing document from the left queue to inspect the generated testing pipeline.</p>
          </div>
        )}
      </div>
    </div>
  );
}
