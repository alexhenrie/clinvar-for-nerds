const React = require('react');
const clinvarExamples = require('../../models/clinvar-examples.js');

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
        <input defaultValue={this.state.property} list="clinvarProperties" onChange={this.onPropertyChange} onClick={this.onPropertyChange} ref="property" style={{display:'table-cell',width:'100%'}} type="text"/>
        <select defaultValue={this.state.operator} onChange={this.onOperatorChange} style={{display:'table-cell',width:'25ex'}}>
          <option value="exists">exists</option>
          <option value="gt">is greater than</option>
          <option value="lt">is less than</option>
          <option value="eq">is equal to</option>
          <option value="ne">is not equal to</option>
          <option value="text">contains</option>
          <option value="ntext">does not contain</option>
        </select>
        <datalist id={'operandExamples' + this.props.index} ref="operandExamples">
          {
            (clinvarExamples[this.state.property] || []).map(function(example) {
              return (
                <option key={example}>{example}</option>
              );
            })
          }
        </datalist>
        <input defaultValue={this.state.operand} list={'operandExamples' + this.props.index} type="text" onChange={this.onOperandChange} ref="operand" style={{display:this.state.operator=='exists'?'none':'table-cell'}}/>
        <button onClick={this.props.onRemove} type="button">X</button>
      </div>
    );
  },
});
