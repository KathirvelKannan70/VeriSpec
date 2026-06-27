import React, { useState, useEffect } from 'react';
import UserPanel from './components/UserPanel.jsx';
import { API_BASE_URL } from './config.js';

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [testCases, setTestCases] = useState([]);
  const [script, setScript] = useState(null);
  const [defects, setDefects] = useState([]);
  const [testRuns, setTestRuns] = useState([]);

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

  return (
    <div className="app-container">
      {/* Premium Navbar */}
      <header className="navbar">
        <div className="brand">
          <div className="logo-dot"></div>
          <span>VeriSpec</span>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="main-content">
        <UserPanel 
          documents={documents}
          selectedDoc={selectedDoc}
          testCases={testCases}
          script={script}
          defects={defects}
          testRuns={testRuns}
          onSelectDoc={handleSelectDoc}
          onUploadSuccess={fetchDocuments}
          fetchDocDetails={fetchDocumentDetails}
        />
      </main>
    </div>
  );
}
