var InputGroup = require('./input-group.jsx');
var React = require('react');
var Router = require('react-router').Router;
var History = require('react-router').History;

var clinvarSchemaFlat = require ('../../models/clinvar-schema-flat');

const RECORDS_PER_PAGE = require('../../records-per-page');

module.exports = React.createClass({
  addRestriction : function() {
    this.refs.inputGroup.addRestriction();
  },
  mixins: [
    History
  ],
  render: function() {
    //deserialize the query
    var restrictions;
    var q = this.props.params.q;
    if (q) {
      try {
        q = JSON.parse(decodeURIComponent(q));
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
    }
    if (!restrictions)
      restrictions = [{property: '', operator: 'eq', operand: ''}];
    //render input components corresponding to the query
    return (
      <div className="tall">
        <form onSubmit={this.search} role="search">
          <InputGroup ref="inputGroup" restrictions={restrictions}/>
          <div className="space-kids">
            <button onClick={this.addRestriction} type="button">Add restriction</button>
            <label><input defaultChecked={this.props.location.query.caseSensitive} ref="caseSensitive" type="checkbox"/> Case sensitive</label>
            <label><input defaultChecked={this.props.location.query.strip || 1} ref="omitEmpty" type="checkbox"/> Omit empty fields</label>
            <label><input defaultChecked={this.props.location.query.format == 'csv'} name="format" ref="formatCsv" type="radio" value="csv"/> CSV</label>
            <label><input defaultChecked={!this.props.location.query.format || this.props.location.query.format == 'json'} name="format" ref="formatJson" type="radio" value="json"/> JSON</label>
            <label><input defaultChecked={this.props.location.query.format == 'vcf'} name="format" ref="formatVcf" type="radio" value="vcf"/> VCF</label>
            <label><input defaultChecked={this.props.location.query.format == 'json-ld'} name="format" ref="formatJsonLd" type="radio" value="json-ld"/> JSON-LD</label>
            <button className="btn btn-primary" type="submit">Search</button>
          </div>
        </form>
        {this.props.children}
      </div>
    );
  },
  search: function(e) {
    //execute the search
    this.transition(this.props.location.query.start);

    //don't actually submit the form
    e.preventDefault();
  },
  transition: function(start) {
    //serialize the query
    var q = '{';
    var restrictions = this.refs.inputGroup.state.restrictions;
    for (var i = 0; i < restrictions.length; i++) {
      var property = restrictions[i].property;
      var operator = restrictions[i].operator;
      var operand = restrictions[i].operand;

      if (!property) {
        continue;
      } else if (operator == 'exists') {
        operand = 1;
      } else if (clinvarSchemaFlat[property] == Number) {
        //make sure numeric operands aren't surrounded by quotation marks
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

    //change the URL fragment
    this.history.pushState(null, '/search/' + encodeURIComponent(q), {
      caseSensitive: this.refs.caseSensitive.checked ? 1 : undefined,
      format:
        this.refs.formatCsv.checked ? 'csv' :
        this.refs.formatVcf.checked ? 'vcf' :
        this.refs.formatJsonLd.checked ? 'json-ld' :
        'json',
      strip: this.refs.omitEmpty.checked ? 1 : undefined,
      start: start,
    });
    this.forceUpdate(); //rerun the search even if the parameters have not changed
  },
});
