import React from 'react';
import {Navigate} from 'react-router-dom';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import {LOGIN_URL} from './urls';

const PrivateRoute = ({component: Component, auth, ...rest}) => {
  // isAuthenticated === null means the auth state has not been determined yet
  // (loadUser is in flight). Redirecting before that resolves bounces a direct
  // navigation (e.g. #/select-game) off to /login and the menu (#1983).
  const isLoading = auth.isLoading || auth.isAuthenticated === null;
  return (
    <div>
      {isLoading && <h2>Loading ... </h2>}
      {!isLoading && !auth.isAuthenticated && <Navigate to={LOGIN_URL} />}
      {!isLoading && auth.isAuthenticated && <Component {...rest} />}
    </div>
  );
};

const mapStateToProps = (state) => ({
  auth: state.authReducer,
});

PrivateRoute.propTypes = {
  component: PropTypes.elementType.isRequired,
  auth: PropTypes.object.isRequired,
};

export default connect(mapStateToProps)(PrivateRoute);
