
import React, {act} from 'react';
import {Provider} from 'react-redux';
import {MemoryRouter as Router, Route, Routes} from 'react-router-dom';
import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {testStore} from '../../../__tests__/Utils';
import {GAME_PAIR_1} from '../../../__tests__/testdata/gamesData';
import Officials, {toItem} from '../Officials';
import {DETAILS_URL, OFFICIALS_URL} from '../../common/urls';
import {apiGet, apiPut, apiPost} from '../../../actions/utils/api';
import {
  GET_GAME_OFFICIALS,
  GET_GAME_SETUP,
  OFFICIALS_GET_TEAM_OFFICIALS,
  OFFICIALS_SEARCH_FOR_OFFICIALS,
} from '../../../actions/types';
import {GAME_OFFICIALS} from '../../../__tests__/testdata/gameSetupData';
import {OFFICIALS_TEAM_OFFICIALS} from '../../../__tests__/testdata/officialsData';
import { vi } from 'vitest';

const selectedGame = GAME_PAIR_1;
let isInitEmpty = false;
const SEARCH_RESULT = [{
  id: 2000, team: 'Other Team', first_name: 'Marcel', last_name: 'Borutta',
  license: 'F2', valid_until: '2024-07-07', is_valid: false,
}];

vi.mock('../../../actions/utils/api');
apiPost.mockImplementation(() => {
  return () => {};
});
apiPut.mockImplementation(() => {
  return () => {};
});
apiGet.mockImplementation((url, actionType) => (dispatch) => {
  if (actionType == GET_GAME_OFFICIALS && isInitEmpty) {
    dispatch({
      type: GET_GAME_OFFICIALS,
      payload: [],
    });
  } else if (actionType == GET_GAME_OFFICIALS && !isInitEmpty) {
    dispatch({
      type: GET_GAME_OFFICIALS,
      payload: GAME_OFFICIALS,
    });
  }
  if (actionType == GET_GAME_SETUP && isInitEmpty) {
    dispatch({
      type: GET_GAME_SETUP,
      payload: {},
    });
  } else if (actionType == GET_GAME_SETUP && !isInitEmpty) {
    dispatch({
      type: GET_GAME_SETUP,
      payload: {
        ctResult: 'Gewonnen',
        direction: 'directionRight',
        fhPossession: GAME_PAIR_1.away,
      },
    });
  }
  if (actionType == OFFICIALS_SEARCH_FOR_OFFICIALS) {
    dispatch({type: OFFICIALS_SEARCH_FOR_OFFICIALS, payload: SEARCH_RESULT});
  }
  return () => {};
});

const setup = (isInitialEmpty=false, emptyTeamOfficials=false,
    extraTeamOfficials=[]) => {
  isInitEmpty = isInitialEmpty;
  let initialOfficials = GAME_OFFICIALS;
  let initialGameSetup = {
    ctResult: 'Gewonnen',
    direction: 'directionRight',
    fhPossession: GAME_PAIR_1.away,
  };
  let initialTeamOfficials = [...OFFICIALS_TEAM_OFFICIALS, ...extraTeamOfficials];
  if (isInitialEmpty) {
    initialOfficials = [];
    initialGameSetup = {};
  }
  if (emptyTeamOfficials) {
    initialTeamOfficials = [];
  }
  apiPut.mockClear();
  apiGet.mockClear();
  const initialState = {
    gamesReducer: {
      selectedGame: GAME_PAIR_1,
      gameSetupOfficials: initialOfficials,
      gameSetup: initialGameSetup,
    },
    officialsReducer: {
      teamOfficials: initialTeamOfficials,
      teamOfficialsLoading: false,
      teamOfficialsError: null,
      searchOfficialsResult: [],
    },
  };
  const store = testStore(initialState);
  render(<Provider store={store}>
    <Router initialEntries={[{pathname: '/officials'}]}>
      <Routes>
        <Route path={OFFICIALS_URL} element={<Officials store={store} />} />
        <Route path={DETAILS_URL} element={<div>Some Text</div>} />
      </Routes>
    </Router>
  </Provider>,
  );
};

const summary = () => screen.getByTestId('officialsSummary');

describe('toItem', () => {
  const entry = {id: 7, team: 'T', first_name: 'A', last_name: 'B'};
  it('keeps entries without license data unchanged', () => {
    expect(toItem(entry)).toEqual({text: 'A B', subtext: 'T', id: 7});
  });
  it('marks a valid license', () => {
    expect(toItem({...entry, license: 'F1', is_valid: true, valid_until: '2027-01-01'}))
        .toMatchObject({licenseLabel: 'F1', licenseExpired: false, licenseValid: true});
  });
  it('shows the expiry date of an expired license', () => {
    expect(toItem({...entry, license: 'F3', is_valid: false, valid_until: '2024-02-29'}))
        .toMatchObject({
          licenseLabel: 'F3 – abgelaufen seit 29.02.2024',
          licenseExpired: true,
          licenseValid: false,
        });
  });
  it('labels officials without a license', () => {
    expect(toItem({...entry, license: null, is_valid: false, valid_until: null}))
        .toMatchObject({licenseLabel: 'Keine Lizenz', licenseExpired: false, licenseValid: false});
  });
});

describe('Officials component', () => {
  it('should render component', () => {
    setup();
    expect(screen.getByRole('heading')).toHaveTextContent(
        `${selectedGame.home} vs ${selectedGame.away}`,
    );
    expect(screen.getAllByRole('textbox').length).toBe(5);
    expect(screen.getAllByRole('radio').length).toBe(6);
    expect(screen.getByTestId('ctTeam').textContent).toEqual(selectedGame.away);
  });
  it('should render team officials', async () => {
    const user = userEvent.setup();
    setup(true, false);
    await user.click(screen.getByPlaceholderText('Scorecard Judge (Vorname Nachname)'));
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });
  it('submit form and redirects', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(
        screen.getByPlaceholderText('Scorecard Judge (Vorname Nachname)'),
        'SC Name',
    );
    await user.type(screen.getByPlaceholderText('Referee (Vorname Nachname)'), 'R Name');
    await user.type(screen.getByPlaceholderText('Down Judge (Vorname Nachname)'), 'DJ Name');
    await user.type(screen.getByPlaceholderText('Field Judge (Vorname Nachname)'), 'FJ Name');
    await user.type(screen.getByPlaceholderText('Side Judge (Vorname Nachname)'), 'SJ Name');
    await user.click(screen.getByText('Gewonnen'));
    await user.click(screen.getByText(selectedGame.home));
    await user.click(screen.getByTitle('directionLeft'));
    await user.click(screen.getByText('Spiel starten'));
    expect(apiPut.mock.calls[0][0]).toBe(`/api/game/${selectedGame.id}/setup`);
    expect(apiPut.mock.calls[1][0]).toBe(`/api/game/${selectedGame.id}/officials`);
    expect(apiGet.mock.calls[0][0]).toBe(`/api/gamelog/${selectedGame.id}`);
    expect(screen.getByText('Some Text')).toBeInTheDocument();
  });
  it('checks if buttons are checked when clicked', async () => {
    const user = userEvent.setup();
    setup(true);
    const wonButton = screen.getByRole('radio', {name: 'Gewonnen'});
    const lostButton = screen.getByText('Verloren');
    expect(wonButton).not.toBeChecked();
    expect(lostButton).not.toBeChecked();
    await user.click(wonButton);
    expect(wonButton).toBeChecked();
    expect(lostButton).not.toBeChecked();
  });
  it('should call getApi to init the page, display the officials name and game setup infos', () => {
    setup();
    expect(screen.getByPlaceholderText('Scorecard Judge (Vorname Nachname)')).toHaveDisplayValue('Sofia Scorecard');
    expect(screen.getByPlaceholderText('Referee (Vorname Nachname)')).toHaveDisplayValue('Rebecca Referee');
    expect(screen.getByPlaceholderText('Referee (Vorname Nachname)')).toHaveAttribute('readonly');
    expect(screen.getByPlaceholderText('Down Judge (Vorname Nachname)')).toHaveDisplayValue('Daniela Down');
    expect(screen.getByPlaceholderText('Field Judge (Vorname Nachname)')).toHaveDisplayValue('Franziska Field');
    expect(screen.getByPlaceholderText('Side Judge (Vorname Nachname)')).toHaveDisplayValue('Saskia Side');
    expect(screen.getByRole('radio', {name: 'Gewonnen'})).toBeChecked();
    expect(screen.getByRole('radio', {name: selectedGame.away})).toBeChecked();
    expect(screen.getByTestId('directionRight')).toBeChecked();
  });
  it('should call getApi to init the page and display empty officials', () => {
    setup(true);
    expect(screen.getByPlaceholderText('Scorecard Judge (Vorname Nachname)')).toHaveDisplayValue('');
    expect(screen.getByPlaceholderText('Referee (Vorname Nachname)')).toHaveDisplayValue('');
    expect(screen.getByPlaceholderText('Down Judge (Vorname Nachname)')).toHaveDisplayValue('');
    expect(screen.getByPlaceholderText('Field Judge (Vorname Nachname)')).toHaveDisplayValue('');
    expect(screen.getByPlaceholderText('Side Judge (Vorname Nachname)')).toHaveDisplayValue('');
    expect(screen.getByRole('radio', {name: 'Gewonnen'})).not.toBeChecked();
    expect(screen.getByRole('radio', {name: 'Verloren'})).not.toBeChecked();
    expect(screen.getByRole('radio', {name: selectedGame.away})).not.toBeChecked();
    expect(screen.getByRole('radio', {name: selectedGame.home})).not.toBeChecked();
    expect(screen.getByTestId('directionRight')).not.toBeChecked();
    expect(screen.getByTestId('directionLeft')).not.toBeChecked();
  });
  it('should reduce officials when one is selected', async () => {
    const user = userEvent.setup();
    setup(true);
    await user.click(screen.getByPlaceholderText('Referee (Vorname Nachname)'));
    await user.click(screen.getAllByText(/first_name first_last_name/i)[0]);
    await user.click(screen.getByPlaceholderText('Down Judge (Vorname Nachname)'));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
  describe('identified officials summary', () => {
    const pick = async (user, placeholder, name) => {
      const input = screen.getByPlaceholderText(placeholder);
      await user.click(input);
      await user.click(within(input.closest('.row')).getByText(name));
    };
    it('should be red when no official is identified', () => {
      setup(true);
      expect(summary()).toHaveTextContent('Offizielle erkannt: 0/4');
      expect(summary()).toHaveTextContent('Davon mit gültiger Lizenz: 0/0');
      expect(summary()).toHaveClass('alert-danger');
    });
    it('should count identified officials with a valid license', async () => {
      const user = userEvent.setup();
      setup(true);
      await pick(user, 'Referee (Vorname Nachname)', /first_name first_last/);
      await pick(user, 'Down Judge (Vorname Nachname)', /second_name second_last/);
      await pick(user, 'Field Judge (Vorname Nachname)', /third_name third_last/);
      expect(summary()).toHaveTextContent('Offizielle erkannt: 3/4');
      expect(summary()).toHaveTextContent('Davon mit gültiger Lizenz: 1/3');
    });
    it('should be yellow when some officials are identified', async () => {
      const user = userEvent.setup();
      setup(true);
      await pick(user, 'Referee (Vorname Nachname)', /first_name first_last/);
      expect(summary()).toHaveTextContent('Offizielle erkannt: 1/4');
      expect(summary()).toHaveClass('alert-warning');
    });
    it('should not count the side judge', async () => {
      const user = userEvent.setup();
      setup(true);
      await pick(user, 'Side Judge (Vorname Nachname)', /first_name first_last/);
      expect(summary()).toHaveTextContent('Offizielle erkannt: 0/4');
      expect(summary()).toHaveClass('alert-danger');
    });
    it('should be green when all four officials are identified', async () => {
      const user = userEvent.setup();
      setup(true, false, [{
        id: 1000, team: 'Some Team', first_name: 'fourth_name',
        last_name: 'fourth_last_name', license: 'F4', valid_until: '2027-01-01',
        is_valid: true,
      }]);
      await pick(user, 'Scorecard Judge (Vorname Nachname)', /first_name first_last/);
      await pick(user, 'Referee (Vorname Nachname)', /second_name second_last/);
      await pick(user, 'Down Judge (Vorname Nachname)', /third_name third_last/);
      expect(summary()).toHaveClass('alert-warning');
      await pick(user, 'Field Judge (Vorname Nachname)', /fourth_name fourth_last/);
      expect(summary()).toHaveTextContent('Offizielle erkannt: 4/4');
      expect(summary()).toHaveClass('alert-success');
    });
    it('should count officials restored from a saved setup', () => {
      setup(false);
      expect(summary()).toHaveTextContent('Offizielle erkannt: 1/4');
      expect(summary()).toHaveTextContent('Davon mit gültiger Lizenz: 1/1');
      expect(summary()).toHaveClass('alert-warning');
    });
  });
  it('should show license, expiry and missing license of team officials', async () => {
    const user = userEvent.setup();
    setup(true);
    await user.click(screen.getByPlaceholderText('Referee (Vorname Nachname)'));
    const list = within(
        screen.getByPlaceholderText('Referee (Vorname Nachname)').closest('.row'));
    expect(list.getByText('F1')).toBeInTheDocument();
    expect(list.getByText('F2 – abgelaufen seit 07.07.2024')).toBeInTheDocument();
    expect(list.getByText('Keine Lizenz')).toBeInTheDocument();
  });
  it('should search for an official and list the result with license', async () => {
    const user = userEvent.setup();
    setup(true);
    const input = screen.getByPlaceholderText('Referee (Vorname Nachname)');
    await user.type(input, 'Marcel Borutta');
    await user.click(within(input.closest('.row')).getByTestId('searchButton'));
    expect(apiGet).toHaveBeenCalledWith(
        `/api/officials/search/exclude/team/${selectedGame.officialsId}` +
        '/list?name=Marcel%20Borutta',
        OFFICIALS_SEARCH_FOR_OFFICIALS,
    );
    const row = within(input.closest('.row'));
    expect(row.getByText('Marcel Borutta')).toBeInTheDocument();
    expect(row.getByText('F2 – abgelaufen seit 07.07.2024')).toHaveClass('text-danger');
    await user.click(row.getByText('Marcel Borutta'));
    expect(summary()).toHaveTextContent('Offizielle erkannt: 1/4');
    expect(summary()).toHaveTextContent('Davon mit gültiger Lizenz: 0/1');
    await user.click(screen.getByPlaceholderText('Down Judge (Vorname Nachname)'));
    expect(screen.queryByText('Marcel Borutta', {selector: 'li *'}))
        .not.toBeInTheDocument();
  });
  it('should show loading spinner when team officials are loading', () => {
    const initialState = {
      gamesReducer: {
        selectedGame: GAME_PAIR_1,
        gameSetupOfficials: [],
        gameSetup: {},
      },
      officialsReducer: {
        teamOfficials: [],
        teamOfficialsLoading: true,
        teamOfficialsError: null,
        searchOfficialsResult: [],
      },
    };
    const store = testStore(initialState);
    render(<Provider store={store}>
      <Router initialEntries={[{pathname: '/officials'}]}>
        <Routes>
          <Route path={OFFICIALS_URL} element={<Officials store={store} />} />
        </Routes>
      </Router>
    </Provider>);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
  it('should not crash when officials finish loading while the component is already mounted', () => {
    const initialState = {
      gamesReducer: {
        selectedGame: GAME_PAIR_1,
        gameSetupOfficials: [],
        gameSetup: {},
      },
      officialsReducer: {
        teamOfficials: [],
        teamOfficialsLoading: true,
        teamOfficialsError: null,
        searchOfficialsResult: [],
      },
    };
    const store = testStore(initialState);
    render(<Provider store={store}>
      <Router initialEntries={[{pathname: '/officials'}]}>
        <Routes>
          <Route path={OFFICIALS_URL} element={<Officials store={store} />} />
        </Routes>
      </Router>
    </Provider>);
    expect(screen.getByRole('status')).toBeInTheDocument();

    // Mirrors the real flow: SelectGame dispatches the LOADING action synchronously
    // and navigates to /officials before the API response resolves, so the success
    // action always arrives on an already-mounted Officials instance.
    act(() => {
      store.dispatch({type: OFFICIALS_GET_TEAM_OFFICIALS, payload: OFFICIALS_TEAM_OFFICIALS});
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('heading')).toHaveTextContent(
        `${selectedGame.home} vs ${selectedGame.away}`,
    );
  });
  it('should show error alert when team officials fail to load', () => {
    const initialState = {
      gamesReducer: {
        selectedGame: GAME_PAIR_1,
        gameSetupOfficials: [],
        gameSetup: {},
      },
      officialsReducer: {
        teamOfficials: [],
        teamOfficialsLoading: false,
        teamOfficialsError: {msg: 'Not found'},
        searchOfficialsResult: [],
      },
    };
    const store = testStore(initialState);
    render(<Provider store={store}>
      <Router initialEntries={[{pathname: '/officials'}]}>
        <Routes>
          <Route path={OFFICIALS_URL} element={<Officials store={store} />} />
        </Routes>
      </Router>
    </Provider>);
    expect(screen.getByText('Offizielle konnten nicht geladen werden.')).toBeInTheDocument();
  });
});
