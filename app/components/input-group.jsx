const React = require('react');
const Input = require('./input.jsx');
const clinvarExamples = require('../../models/clinvar-examples.js');

module.exports = React.createClass({
  addRestriction: function() {
    var restrictions = this.state.restrictions;
    restrictions.push({parameter: '', operator: 'eq', value: ''});
    this.setState({restrictions: restrictions});
  },
  getInitialState: function() {
    return {restrictions: this.props.restrictions};
  },
  handleChange: function(index) {
    var restrictions = this.state.restrictions;
    var inputState = this.refs['input' + index].state;
    restrictions[index] = {
      property: inputState.property,
      operator: inputState.operator,
      operand: inputState.operand,
    };
    this.setState({restrictions: restrictions});
  },
  removeRestriction: function(index) {
    var restrictions = this.state.restrictions;
    restrictions.splice(index, 1);
    this.setState({restrictions: restrictions});
  },
  restrictionCount: 0,
  render: function() {
    this.restrictionCount = 0;
    var inputComponents = this.state.restrictions.map(function(restriction) {
      ret = (
        <Input
          key={this.restrictionCount}
          index={this.restrictionCount}
          onChange={this.handleChange.bind(this, this.restrictionCount)}
          onRemove={this.removeRestriction.bind(this, this.restrictionCount)}
          ref={'input' + this.restrictionCount}
          {...restriction}
        />
      );
      this.restrictionCount++;
      return ret;
    }.bind(this));
    return (
      <div>
        <datalist id="clinvarProperties">
          {
            Object.keys(clinvarExamples).sort().map(function(name) {
              return (
                <option key={name} value={name}>
                  {
                    name + ' (e.g. ' + clinvarExamples[name].slice(0, 3).map(function(value) {
                      return JSON.stringify(value);
                    }).join(', ') + ')'
                  }
                </option>
              );
            })
          }
        </datalist>
        {inputComponents}
      </div>
    );
  },
});
