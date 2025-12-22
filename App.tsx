import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { EditorPage } from './pages/EditorPage';
import { DocsPage } from './pages/DocsPage';

function App() {
  return (
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<EditorPage />} />
        <Route path="/docs" element={<DocsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

export default App;