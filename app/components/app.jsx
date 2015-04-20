var InputGroup = require('./input-group.jsx');
var React = require('react');
var Router = require('react-router');

var RouteHandler = Router.RouteHandler;

module.exports = React.createClass({
  addRestriction : function() {
    this.refs.inputGroup.addRestriction();
  },
  contextTypes: {
    router: React.PropTypes.func
  },
  render: function() {
    //deserialize the query
    var restrictions;
    var q = this.props.params.q;
    if (q && Object.keys(q).length) {
      try {
        q = JSON.parse(q);
      } catch (e) {
        q = {};
        console.log('Syntax error in query.');
      }
      restrictions = Object.keys(q).map(function(key) {
        if (!key)
          return false;

        if (typeof q[key] != 'object') {
          return {
            property: key,
            operator: 'eq',
            operand: q[key],
          }
        } else {
          var operator = q[key].$exists ? 'exists' :
                         q[key].$gt ? 'gt' :
                         q[key].$lt ? 'lt' :
                         q[key].$eq ? 'eq' :
                         'text';
          return {
            property: key,
            operator: operator,
            operand: q[key].$exists ? '' :
                     q[key] instanceof Object ? q[key]['$' + operator] :
                     q[key],
          };
        }
      });
    } else {
      restrictions = [{property: '', operator: 'eq', operand: ''}];
    }
    //render input components corresponding to the query
    return (
      <div className="tall">
        <form onSubmit={this.search} role="search">
          <InputGroup ref="inputGroup" restrictions={restrictions}/>
          <div className="space-kids">
            <button onClick={this.addRestriction} type="button">Add restriction</button>
            <label><input defaultChecked={this.props.query.caseSensitive} ref="caseSensitive" type="checkbox"/> Case sensitive</label>
            <label><input defaultChecked={this.props.query.strip || 1} ref="omitEmpty" type="checkbox"/> Omit empty fields</label>
            <label><input defaultChecked={this.props.query.format == 'csv'} name="format" ref="formatCsv" type="radio" value="csv"/> CSV</label>
            <label><input defaultChecked={!this.props.query.format || this.props.query.format == 'json'} name="format" ref="formatJson" type="radio" value="json"/> JSON</label>
            <button className="btn btn-primary" type="submit">Search</button>
          </div>
        </form>
        <RouteHandler {...this.props}/>
      </div>
    );
  },
  search: function(e) {
    //serialize the query
    var q = '{';
    var restrictions = this.refs.inputGroup.state.restrictions;
    for (var i = 0; i < restrictions.length; i++) {
      var property = restrictions[i].property;
      var operator = restrictions[i].operator;
      var operand = restrictions[i].operand;

      if (operator == 'exists') {
        operand = 1;
      } else if (!property) {
        continue;
      } else if (operand != '') {
        //turn anything that looks like a number into a number
        var operandAsNumber = Number(operand);
        if (!isNaN(operandAsNumber))
          operand = operandAsNumber;
      }

      q += '"' + property + '":';
      if (operator == 'eq')
        q += JSON.stringify(operand);
      else
        q += '{"$' + operator + '":' + JSON.stringify(operand) + '}';
      //JSON does not permit trailing commas
      if (i != restrictions.length - 1)
        q += ','
    }
    q += '}';

    //execute the search
    this.context.router.transitionTo('search', {q: q}, {
      'caseSensitive': this.refs.caseSensitive.getDOMNode().checked ? 1 : undefined,
      'format': this.refs.formatCsv.getDOMNode().checked ? 'csv' : 'json',
      'strip': this.refs.omitEmpty.getDOMNode().checked ? 1 : undefined,
    });

    //don't actually submit the form
    e.preventDefault();
  },
});
