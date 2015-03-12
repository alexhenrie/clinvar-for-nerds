var React = require('react');
var request = require('superagent');

//https://git.wikimedia.org/blob/mediawiki%2Fcore.git/HEAD/resources%2Fsrc%2Fjquery%2Fjquery.mwExtension.js
function escapeRE(str) {
  return str.replace(/([\\{}()|.?*+\-\^$\[\]])/g, '\\$1');
}

module.exports = React.createClass({
  componentDidMount: function() {
    this.getResults(this.props);
  },
  componentWillReceiveProps: function(newProps) {
    this.getResults(newProps);
  },
  getInitialState: function() {
    return {loading: false, results: ''};
  },
  getResults: function(props) {
    this.setState({loading: true});
    this.startTime = Date.now();

    //our UI supports some operators that our API does not, because our API
    //ingests literal MongoDB queries
    var caseSensitive = props.query.caseSensitive;
    var q = JSON.parse(props.params.q);
    Object.keys(q).forEach(function(property) {
      if (typeof q[property] == 'string' && !caseSensitive) {
        q[property] = {
          $regex: '^' + escapeRE(q[property]) + '$',
          $options: 'i',
        };
      } else if (q[property].$text) {
        if (caseSensitive) {
          q[property] = {
            $text: {'$search': q[property].$text}
          };
        } else { //not case sensitive
          q[property] = {
            $regex: escapeRE(q[property].$text),
            $options: 'i',
          };
        }
      }
    });
    var url = '/api?q=' + JSON.stringify(q) + '&format=' + props.query.format;
    if (props.query.strip)
      url += '&strip=1';

    request.get(url, function(error, result) {
      if (error) {
        console.log(error);
        return;
      }
      this.setState({loading: false, results: result.text});
    }.bind(this));
  },
  render: function() {
    if (this.state.loading) {
      return (
        <div style={{textAlign:'center'}}>
          {/* https://genomevolution.org/wiki/images/d/df/DNA_orbit_animated_small-side.gif */}
          {/* https://commons.wikimedia.org/wiki/File:DNA_orbit_animated_small.gif */}
          <img src="/DNA_orbit_animated_small-side.gif"/><br/>
          Loading...
        </div>
      );
    } else if (this.state.results) {
      return (
        <div className="tall">
          <div style={{textAlign:'right'}}>Search completed in {((Date.now() - this.startTime) / 1000).toFixed(2)} seconds.</div>
          {/* send as an <object> so that the user can easily right-click to save */}
          <object data={'data:text/plain,' + encodeURI(this.state.results)} style={{backgroundColor:'#F5F5F5', border:'1px solid #CCC', flexGrow:'1'}}>
            {this.state.results}
          </object>
        </div>
      );
    } else {
      return (
        <div/>
      );
    }
  },
});
