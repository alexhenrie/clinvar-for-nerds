var React = require('react');
var Router = require('react-router');

var App = require('./components/app.jsx');
var Search = require('./components/search.jsx');

var Route = Router.Route;

var routes = (
  //The main query, named q to avoid confusion, is saved in state.params so
  //that colons don't have to be escaped in the URL. The other parameters are
  //saved in state.query.
  <Route handler={App} path="/">
    <Route name="search" path="search/:q" handler={Search}/>
  </Route>
);

Router.run(routes, function(Handler, state) {
  React.render(<Handler {...state}/>, document.getElementById('application'));
});
