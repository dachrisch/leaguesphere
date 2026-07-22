import {
  OFFICIALS_GET_TEAM_OFFICIALS,
  OFFICIALS_GET_TEAM_OFFICIALS_LOADING,
  OFFICIALS_GET_TEAM_OFFICIALS_ERROR,
  OFFICIALS_SEARCH_FOR_OFFICIALS,
} from '../actions/types.js';

const initialState = {
  teamOfficials: [],
  teamOfficialsLoading: false,
  teamOfficialsError: null,
  searchOfficialsResult: [],
};

export default (state = initialState, action) => {
  switch (action.type) {
    case OFFICIALS_GET_TEAM_OFFICIALS_LOADING:
      return {
        ...state,
        teamOfficialsLoading: true,
        teamOfficialsError: null,
      };
    case OFFICIALS_GET_TEAM_OFFICIALS:
      return {
        ...state,
        teamOfficials: action.payload,
        teamOfficialsLoading: false,
        teamOfficialsError: null,
      };
    case OFFICIALS_GET_TEAM_OFFICIALS_ERROR:
      return {
        ...state,
        teamOfficialsLoading: false,
        teamOfficialsError: action.payload,
      };
    case OFFICIALS_SEARCH_FOR_OFFICIALS:
      return {
        ...state,
        searchOfficialsResult: action.payload,
      };
    default:
      return state;
  }
};
