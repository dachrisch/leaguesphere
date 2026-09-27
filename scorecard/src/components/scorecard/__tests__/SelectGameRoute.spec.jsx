import React from 'react';
import {render, screen} from '@testing-library/react';
import axios from 'axios';
import {vi} from 'vitest';

import App from '../../App';

vi.mock('axios');

describe('#/select-game hash route', () => {
  beforeEach(() => {
    axios.get.mockImplementation((url) => {
      if (url === '/accounts/auth/user/') {
        return Promise.resolve({data: {username: 'admin'}});
      }
      if (url === '/api/gameday/list') {
        return Promise.resolve({
          data: [{id: 1, name: 'Test Gameday', date: '2026-09-27'}],
        });
      }
      return Promise.resolve({data: []});
    });
    window.location.hash = '#/select-game';
  });

  it('renders the gameday selector directly, not only the menu', async () => {
    render(<App />);

    // The selector (SelectGame -> Gamedays) must render on the hash route.
    expect(
        await screen.findByText('Bitte einen Spieltag auswählen')
    ).toBeInTheDocument();
    expect(screen.getByText('Test Gameday')).toBeInTheDocument();

    // The Passcheck/Scorecard chooser menu must NOT be the only thing shown.
    expect(screen.queryByRole('button', {name: 'Scorecard'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Passcheck'})).not.toBeInTheDocument();
  });
});