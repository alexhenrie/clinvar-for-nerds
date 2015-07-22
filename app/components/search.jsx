var clinvarSchemaFlat = require ('../../models/clinvar-schema-flat');
var React = require('react');
var request = require('superagent');

const RECORDS_PER_PAGE = require('../../records-per-page');

//https://git.wikimedia.org/blob/mediawiki%2Fcore.git/HEAD/resources%2Fsrc%2Fjquery%2Fjquery.mwExtension.js
function escapeRE(str) {
  return str.replace(/([\\{}()|.?*+\-\^$\[\]])/g, '\\$1');
}

module.exports = React.createClass({
  componentDidMount: function() {
    this.getResults(this.props);
  },
  componentDidUpdate: function() {
    var turner = this.refs.turner.getDOMNode();
    turner.style.display = 'none';

    if (this.refs.results) {
      var loading = this.refs.loading.getDOMNode();
      var stats = this.refs.stats.getDOMNode();
      var results = this.refs.results.getDOMNode();

      loading.style.display = '';
      stats.style.display = 'none';
      results.style.display = 'none';

      results.addEventListener('load', function() {
        this.loading = false;
        this.showStats();
        loading.style.display = 'none';
        stats.style.display = '';
        results.style.display = '';
      }.bind(this));

      this.loading = true;
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
    //save this value for navigation later
    this.start = Number(props.query.start) || 0;

    //start the benchmark
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
    var properties = Object.keys(q);
    for (var i = 0; i < properties.length; i++) {
      var property = properties[i];
      if (!clinvarSchemaFlat[property]) {
        this.setState({url: 'data:text/plain,The property ' + property + ' does not exist.'});
        return;
      } else if (typeof q[property] != 'object' && q[property].constructor != clinvarSchemaFlat[property]) {
        this.setState({url: 'data:text/plain,The property ' + property + ' must be a ' + typeof clinvarSchemaFlat[property]() + '.'});
        return;
      } else if (typeof q[property] == 'string' && !caseSensitive) {
        q[property] = {
          $regex: '^' + escapeRE(q[property]) + '$',
          $options: 'i',
        };
      } else if (q[property].$text) {
        if (typeof q[property].$text != 'string') {
          this.setState({url: 'data:text/plain,The "contains" operator cannot be used with numeric types.'});
          return;
        }
        q[property] = {
          $regex: escapeRE(q[property].$text),
          $options: caseSensitive ? undefined : 'i',
        };
      } else if (q[property].$ntext) {
        if (typeof q[property].$text != 'string') {
          this.setState({url: 'data:text/plain,The "does not contain" operator cannot be used with numeric types.'});
          return;
        }
        q[property] = {$not:{
          $regex: escapeRE(q[property].$text),
          $options: caseSensitive ? undefined : 'i',
        }};
      }
    }

    var q = JSON.stringify(q) + '&format=' + props.query.format;
    if (props.query.strip)
      q += '&strip=1';
    if (props.query.start)
      q += '&start=' + props.query.start;

    request.get('/count?q=' + q, function(error, response) {
      this.recordsOnPage = response.body.recordsOnPage;
      this.recordsFromQuery = response.body.recordsFromQuery;
      this.showStats();
    }.bind(this));
    this.setState({url: '/find?q=' + q});
  },
  goToFirstPage: function() {
    this.props.transition(0);
  },
  goToLastPage: function() {
    this.props.transition(Math.floor(this.recordsFromQuery / RECORDS_PER_PAGE) * RECORDS_PER_PAGE);
  },
  goToNextPage: function() {
    this.props.transition(this.start + RECORDS_PER_PAGE)
  },
  goToPreviousPage: function() {
    this.props.transition(Math.max(0, this.start - RECORDS_PER_PAGE));
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
          <table ref="turner" style={{width:'100%'}}>
            <tr>
              <td>
                <button onClick={this.goToFirstPage} ref="first">&lt;&lt; First page</button>
                <button onClick={this.goToPreviousPage} ref="prev">&lt; Previous {RECORDS_PER_PAGE}</button>
              </td>
              <td style={{textAlign:'right'}}>
                <button onClick={this.goToNextPage} ref="next">Next {RECORDS_PER_PAGE} &gt;</button>
                <button onClick={this.goToLastPage} ref="last">Last page &gt;&gt;</button>
              </td>
            </tr>
          </table>
        </div>
      );
    } else {
      return null;
    }
  },
  showStats: function() {
    var stats = this.refs.stats.getDOMNode();
    if (this.loading) {
      stats.textContent = '';
    } else {
      var start = Number(this.props.query.start) || 0;
      if (this.recordsOnPage)
        stats.textContent = 'Showing records ' + (start + 1) + '-' + (start + this.recordsOnPage) + ' of ' + this.recordsFromQuery + '. ';
      else
        stats.textContent = '';
      stats.textContent += 'Search completed in ' + ((Date.now() - this.startTime) / 1000).toFixed(2) + ' seconds.';

      var enablePrev = (start > 0);
      var enableNext = (start + this.recordsOnPage < this.recordsFromQuery);
      if (enablePrev || enableNext) {
        this.refs.turner.getDOMNode().style.display = '';
      }
      if (enablePrev) {
        this.refs.first.getDOMNode().style.display = '';
        this.refs.prev.getDOMNode().style.display = '';
      } else {
        this.refs.first.getDOMNode().style.display = 'none';
        this.refs.prev.getDOMNode().style.display = 'none';
      }
      if (enableNext) {
        this.refs.next.getDOMNode().style.display = '';
        this.refs.last.getDOMNode().style.display = '';
      } else {
        this.refs.next.getDOMNode().style.display = 'none';
        this.refs.last.getDOMNode().style.display = 'none';
      }
    }
  },
  transition: function(start) {
    this.props.transition(start);
  },
});
