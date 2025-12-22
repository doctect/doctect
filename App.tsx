import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { EditorPage } from './pages/EditorPage';
import { DocsPage } from './pages/DocsPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<EditorPage />} />
        <Route path="/docs" element={<DocsPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;