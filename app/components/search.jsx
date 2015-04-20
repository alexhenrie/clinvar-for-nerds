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
  componentDidUpdate: function() {
    if (this.refs.results) {
      var loading = this.refs.loading.getDOMNode();
      var stats = this.refs.stats.getDOMNode();
      var results = this.refs.results.getDOMNode();

      loading.style.display = '';
      stats.style.display = 'none';
      results.style.display = 'none';

      results.addEventListener('load', function() {
        var resultCount;
        try {
          resultCount = JSON.parse(results.contentDocument.body.textContent).length;
        } catch (e) {
          resultCount = 0;
        }
        loading.style.display = 'none';
        if (resultCount && this.totalRecords)
          stats.textContent = 'Showing records 1-' + resultCount + ' of ' + this.totalRecords + '. ';
        else
          stats.textContent = '';
        stats.textContent += 'Search completed in ' + ((Date.now() - this.startTime) / 1000).toFixed(2) + ' seconds.';
        stats.style.display = '';
        results.style.display = '';
      }.bind(this));
      results.src = this.state.url;
    }
  },
  componentWillReceiveProps: function(newProps) {
    this.getResults(newProps);
  },
  getInitialState: function() {
    return {url: ''};
  },
  getResults: function(props) {
    this.startTime = Date.now();

    //our UI supports some operators that our API does not, because our API
    //ingests literal MongoDB queries
    var caseSensitive = props.query.caseSensitive;
    var q;
    try {
      q = JSON.parse(props.params.q);
    } catch (e) {
      this.setState({url: 'data:text/plain,Syntax error in query.'});
      return;
    }
    var operatorError = false;
    Object.keys(q).forEach(function(property) {
      if (typeof q[property] == 'string' && !caseSensitive) {
        q[property] = {
          $regex: '^' + escapeRE(q[property]) + '$',
          $options: 'i',
        };
      } else if (q[property].$text) {
        if (typeof q[property].$text != 'string') {
          this.setState({url: 'data:text/plain,The "contains" operator cannot be used with numeric types.'});
          operatorError = true;
          return;
        }
        q[property] = {
          $regex: escapeRE(q[property].$text),
          $options: caseSensitive ? undefined : 'i',
        };
      } else if (q[property].$ntext) {
        if (typeof q[property].$text != 'string') {
          this.setState({url: 'data:text/plain,The "does not contain" operator cannot be used with numeric types.'});
          operatorError = true;
          return;
        }
        q[property] = {$not:{
          $regex: escapeRE(q[property].$text),
          $options: caseSensitive ? undefined : 'i',
        }};
      }
    }.bind(this));

    if (operatorError) return;

    var q = JSON.stringify(q) + '&format=' + props.query.format;
    if (props.query.strip)
      q += '&strip=1';

    this.totalRecords = 0;
    request.get('/count?q=' + q, function(error, result) {
      this.totalRecords = result.text;
    }.bind(this));
    this.setState({url: '/find?q=' + q});
  },
  render: function() {
    if (this.state.url) {
      return (
        <div className="tall">
          <div ref="loading" style={{textAlign:'center'}}>
            {/* https://genomevolution.org/wiki/images/d/df/DNA_orbit_animated_small-side.gif */}
            {/* https://commons.wikimedia.org/wiki/File:DNA_orbit_animated_small.gif */}
            <img src="/DNA_orbit_animated_small-side.gif"/><br/>
            Loading...
          </div>
          <div ref="stats" style={{display:'none', textAlign:'right'}}></div>
          <iframe ref="results" style={{backgroundColor:'#F5F5F5', border:'1px solid #CCC', display:'none', flexGrow:'1'}}></iframe>
        </div>
      );
    } else {
      return (
        <div/>
      );
    }
  },
});
