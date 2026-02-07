import React from 'react';
import Dashboard from './components/Dashboard';
import { Container } from 'react-bootstrap';

function App() {
  return (
    <Container fluid className="p-4">
      <h1 className="mb-4">
        <i className="bi bi-speedometer2 me-2"></i>
        Admin Dashboard
      </h1>
      <Dashboard />
    </Container>
  );
}

export default App;
