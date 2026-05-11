import React from 'react';
import { Container, Navbar, Nav, Button } from 'react-bootstrap';
import '../styles/JourneyHeader.css';

/**
 * Header component for Journey Dashboard.
 * Provides navigation bar with back button and app branding.
 */
const JourneyHeader: React.FC = () => {
  const handleBackClick = () => {
    window.location.href = '/';
  };

  return (
    <Navbar bg="dark" variant="dark" expand="lg" className="journey-header shadow-sm py-1" data-testid="journey-header">
      <Container fluid>
        <div className="d-flex align-items-center">
          <Navbar.Brand
            onClick={handleBackClick}
            style={{ cursor: 'pointer' }}
            className="d-flex align-items-center me-0"
          >
            <i className="bi bi-graph-up me-2"></i>
            <span className="fw-bold">LeagueSphere</span>
          </Navbar.Brand>

          <div className="d-flex align-items-center ms-3">
            <Button
              variant="outline-light"
              size="sm"
              onClick={handleBackClick}
              className="d-flex align-items-center me-3"
              style={{ fontSize: '0.8rem', padding: '0.15rem 0.5rem' }}
              title="Back to home"
              data-testid="back-button"
            >
              <i className="bi bi-arrow-left me-1"></i>
              Back
            </Button>
            <span className="mx-2 text-muted">|</span>
            <span className="text-light opacity-75">Journey Dashboard</span>
          </div>
        </div>

        <div className="me-auto" />

        <Navbar.Toggle aria-controls="header-navbar-nav" />
        <Navbar.Collapse id="header-navbar-nav" className="justify-content-end">
          <Nav className="align-items-center gap-3">
            <div className="d-flex align-items-center text-light border-start ps-3 ms-1" style={{ height: '24px' }}>
              <i className="bi bi-person-circle me-2 fs-5"></i>
              <span className="small fw-medium">Admin</span>
            </div>
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
};

export default JourneyHeader;
