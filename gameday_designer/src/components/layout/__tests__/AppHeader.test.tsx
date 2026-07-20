import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AppHeader from '../AppHeader';
import { GamedayProvider } from '../../../context/GamedayContext';
import { designerApi } from '../../../api/designerApi';
import i18n from '../../../i18n/testConfig';

// Mock LanguageSelector since it's tested separately
vi.mock('../../../components/LanguageSelector', () => ({
  default: () => <div data-testid="language-selector">LanguageSelector</div>,
}));

describe('AppHeader', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.restoreAllMocks();
    vi.spyOn(designerApi, 'getConfig').mockResolvedValue({
      mock_teams: false,
      is_staff: false,
      username: '',
      avatar_url: null,
    });
  });

  const renderHeader = (path = '/') => {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <GamedayProvider>
          <Routes>
            <Route path="*" element={<AppHeader />} />
          </Routes>
        </GamedayProvider>
      </MemoryRouter>
    );
  };

  it('renders application title', () => {
    renderHeader();
    expect(screen.getByText(/Gameday Designer/i)).toBeInTheDocument();
  });

  it('renders dashboard title via brand click', () => {
    renderHeader('/');
    expect(screen.getByText(/Gameday Designer/i)).toBeInTheDocument();
  });

  it('renders gameday name when in designer and name is provided via props', () => {
    renderHeader('/designer/1');
    expect(screen.getByText(/New Gameday/i)).toBeInTheDocument();
  });

  it('shows back button only when in designer', () => {
    renderHeader('/');
    expect(screen.queryByTitle(/Back to Dashboard/i)).not.toBeInTheDocument();

    renderHeader('/designer/1');
    expect(screen.getByTitle(/Back to Dashboard/i)).toBeInTheDocument();
  });

  it('renders language selector', () => {
    renderHeader();
    expect(screen.getByTestId('language-selector')).toBeInTheDocument();
  });

  it('shows the fallback icon and "User" label when no avatar is set', async () => {
    renderHeader();

    expect(await screen.findByText('User')).toBeInTheDocument();
    expect(screen.queryByTestId('user-avatar-image')).not.toBeInTheDocument();
  });

  it('shows the avatar image and real username once loaded', async () => {
    vi.spyOn(designerApi, 'getConfig').mockResolvedValue({
      mock_teams: false,
      is_staff: false,
      username: 'jdoe',
      avatar_url: '/media/avatars/jdoe.png',
    });

    renderHeader();

    const avatar = await screen.findByTestId('user-avatar-image');
    expect(avatar).toHaveAttribute('src', '/media/avatars/jdoe.png');
    await waitFor(() => expect(screen.getByText('jdoe')).toBeInTheDocument());
  });
});
