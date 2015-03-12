var React = require('react');
var Input = require('./input.jsx');

module.exports = React.createClass({
  addRestriction: function() {
    var restrictions = this.state.restrictions;
    restrictions.push({parameter: '', operator: 'text', value: ''});
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
        {inputComponents}
      </div>
    );
  },
});
