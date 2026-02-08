import React from 'react';
import Dashboard from './components/Dashboard';
import { Container } from 'react-bootstrap';

function App() {
  return (
    <Container fluid className="p-4">
      <Dashboard />
    </Container>
  );
}

export default App;
