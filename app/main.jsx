var React = require('react');
var ReactDOM = require('react-dom');
var Route = require('react-router').Route;
var Router = require('react-router').Router;
var createBrowserHistory = require('history/lib/createBrowserHistory');

var App = require('./components/app.jsx');
var Search = require('./components/search.jsx');

//createBrowserHistory is the magic that makes the URL change without sending an
//HTTP request or changing the fragment identifier

//The main query, named q to try to avoid confusion, is saved in state.params so
//that colons don't have to be escaped in the URL. The other parameters are
//saved in state.query.

var router = (
  <Router history={createBrowserHistory()}>
    <Route component={App} path="/">
      <Route component={Search} path="search/:q"/>
    </Route>
  </Router>
);

ReactDOM.render(router, document.getElementById('application'));
