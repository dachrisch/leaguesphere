import {apiGet} from './utils/api';
import {OFFICIALS_GET_TEAM_OFFICIALS,
  OFFICIALS_GET_TEAM_OFFICIALS_LOADING,
  OFFICIALS_GET_TEAM_OFFICIALS_ERROR,
  OFFICIALS_SEARCH_FOR_OFFICIALS} from './types';

export const getTeamOfficials = (team) => {
  return (dispatch) => {
    dispatch({type: OFFICIALS_GET_TEAM_OFFICIALS_LOADING});
    dispatch(apiGet(
        `/api/officials/team/${team}/list`,
        OFFICIALS_GET_TEAM_OFFICIALS,
        OFFICIALS_GET_TEAM_OFFICIALS_ERROR,
    ));
  };
};

export const searchForOfficials = (team, name) => {
  return apiGet(
      `/api/officials/search/exclude/team/${team}/list?name=${name}`,
      OFFICIALS_SEARCH_FOR_OFFICIALS,
  );
};
