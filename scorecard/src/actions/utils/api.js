import axios from 'axios';
import {returnErrors} from '../messages';

axios.defaults.xsrfCookieName = 'csrftoken';
axios.defaults.xsrfHeaderName = 'X-CSRFToken';

export const apiPost = (url, body, successType, errorType) => async (
    dispatch,
    getState,
) => {
  const header = tokenConfig(getState);

  await axios
      .post(url, body, header)
      .then((res) => {
        dispatch({
          type: successType,
          payload: res.data,
        });
      })
      .catch((err) => {
        dispatch(returnErrors(err.response.data, err.response.status));
        dispatch({
          type: errorType,
        });
      });
};

export const apiDelete = (url, body, successType, errorType) => async (
    dispatch,
    getState,
) => {
  const header = tokenConfig(getState);

  await axios
      .delete(url, {...header, data: body})
      .then((res) => {
        dispatch({
          type: successType,
          payload: res.data,
        });
      })
      .catch((err) => {
        dispatch(returnErrors(err.response.data, err.response.status));
        dispatch({
          type: errorType,
        });
      });
};

export const apiPut = (url, body, successType, errorType) => async (
    dispatch,
    getState,
) => {
  const header = tokenConfig(getState);

  await axios
      .put(url, body, header)
      .then((res) => {
        dispatch({
          type: successType,
          payload: res.data,
        });
      })
      .catch((err) => {
        dispatch(returnErrors(err.response.data, err.response.status));
        dispatch({
          type: errorType,
        });
      });
};

export const apiGet = (url, successType, errorType) => async (dispatch, getState) => {
  await axios
      .get(url, tokenConfig(getState))
      .then((res) => {
        if (res.data) {
          dispatch({
            type: successType,
            payload: res.data,
          });
        }
      })
      .catch((err) => {
        dispatch(returnErrors(err.response?.data, err.response?.status));
        if (errorType) {
          dispatch({
            type: errorType,
            payload: err.response?.data || err.message,
          });
        }
      });
};

const tokenConfig = (getState) => {
  const token = getState().authReducer.token;

  const config = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (token) {
    config.headers['Authorization'] = `Token ${token}`;
  }

  return config;
};
