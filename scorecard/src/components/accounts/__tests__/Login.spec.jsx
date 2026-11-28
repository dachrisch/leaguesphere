import React from 'react';
import {render, screen} from '@testing-library/react';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import Login from '../Login';
import {testStore} from '../../../__tests__/Utils';
import gamesReducer from '../../../reducers/gamesReducer';

const renderLogin = (isAuthenticated) => {
  const store = testStore({authReducer: {isAuthenticated}});
  render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path='/login' element={<Login store={store} />} />
          <Route path='/' element={<div>start page</div>} />
        </Routes>
      </MemoryRouter>,
  );
};

describe('Login', () => {
  it('shows the form to anonymous users', () => {
    renderLogin(false);
    expect(screen.getByRole('button', {name: 'Login'})).toBeInTheDocument();
  });

  it('sends a signed-in user to the start page', () => {
    renderLogin(true);
    expect(screen.getByText('start page')).toBeInTheDocument();
  });
});

describe('gamesReducer initial state', () => {
  it('starts with an empty game log, never test data', () => {
    const state = gamesReducer(undefined, {type: '@@INIT'});
    expect(state.gameLog.home.score).toBe(-1);
    expect(state.gameLog.home.firsthalf.entries).toEqual([]);
  });
});
