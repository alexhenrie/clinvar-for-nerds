var React = require('react');

module.exports = React.createClass({
  getInitialState: function() {
    return {
      property: this.props.property,
      operator: this.props.operator,
      operand: this.props.operand,
    };
  },
  onOperandChange: function(e) {
    this.setState({operand: e.target.value}, this.props.onChange);
  },
  onOperatorChange: function(e) {
    this.setState({operator: e.target.value}, this.props.onChange);
  },
  onPropertyChange: function(e) {
    this.setState({property: e.target.value}, this.props.onChange);
  },
  render: function() {
    return (
      <div style={{display:'flex'}}>
        <input list="clinvarProperties" onChange={this.onPropertyChange} onClick={this.onPropertyChange} ref="property" style={{display:'table-cell',width:'100%'}} type="text" defaultValue={this.state.property}/>
        <select defaultValue={this.state.operator} onChange={this.onOperatorChange} ref="operator" style={{display:'table-cell'}}>
          <option value="gt">is greater than</option>
          <option value="lt">is less than</option>
          <option value="eq">is equal to</option>
          <option value="text">contains</option>
        </select>
        <input defaultValue={this.state.operand} type="text" onChange={this.onOperandChange} ref="operand" style={{display:'table-cell'}}/>
        <button onClick={this.props.onRemove} type="button">X</button>
      </div>
    );
  },
});
