import {
  DELETE_ENTRY,
  GET_GAMES,
  SET_SELECTED_GAME,
  GET_GAME_LOG,
  GET_GAME_OFFICIALS, GET_GAME_SETUP} from '../actions/types.js';
const EMPTY_GAMELOG = {
  'isFirstHalf': true,
  'home': {
    'name': 'Heim',
    'score': -1,
    'firsthalf': {
      'score:': -1,
      'entries': [],
    },
    'secondhalf': {
      'score:': -1,
      'entries': [],
    },
  },
  'away': {
    'name': 'Gast',
    'score': -1,
    'firsthalf': {
      'score:': -1,
      'entries': [],
    },
    'secondhalf': {
      'score:': -1,
      'entries': [],
    },
  },
};
const initialState = {
  games: [],
  gameLog: EMPTY_GAMELOG,
  deleteEntry: {__html: '<td colspan="4"></td>'},
  gameSetupOfficials: [],
  gameSetup: {
    ctResult: '',
    direction: '',
    fhPossession: '',
  },
};

export default (state = initialState, action) => {
  switch (action.type) {
    case GET_GAMES:
      return {
        ...state,
        games: action.payload,
      };
    case SET_SELECTED_GAME:
      return {
        ...state,
        selectedGame: action.payload,
      };
    case GET_GAME_LOG:
      return {
        ...state,
        gameLog: action.payload,
      };
    case GET_GAME_OFFICIALS:
      return {
        ...state,
        gameSetupOfficials: action.payload,
      };
    case GET_GAME_SETUP:
      return {
        ...state,
        gameSetup: action.payload,
      };
    case DELETE_ENTRY:
      return {
        ...state,
        deleteEntry: action.payload,
      };
    default:
      return state;
  }
};
