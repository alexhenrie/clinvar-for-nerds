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
    //update operand drop-down
    var operandExamples = this.refs.operandExamples.getDOMNode();
    while (operandExamples.hasChildNodes())
      operandExamples.removeChild(operandExamples.firstChild);
    var examples = clinvarExamples[e.target.value] || [];
    examples.forEach(function(example) {
      var option = document.createElement("option");
      option.textContent = example;
      operandExamples.appendChild(option);
    });

    //update state
    this.setState({property: e.target.value}, this.props.onChange);
  },
  render: function() {
    return (
      <div style={{display:'flex'}}>
        <datalist id="clinvarProperties">
          {
            Object.keys(clinvarExamples).map(function(name) {
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
        <input defaultValue={this.state.property} list="clinvarProperties" onChange={this.onPropertyChange} onClick={this.onPropertyChange} ref="property" style={{display:'table-cell',width:'100%'}} type="text"/>
        <select defaultValue={this.state.operator} onChange={this.onOperatorChange} style={{display:'table-cell'}}>
          <option value="gt">is greater than</option>
          <option value="lt">is less than</option>
          <option value="eq">is equal to</option>
          <option value="text">contains</option>
        </select>
        <datalist id="operandExamples" ref="operandExamples"></datalist>
        <input defaultValue={this.state.operand} list="operandExamples" type="text" onChange={this.onOperandChange} ref="operand" style={{display:'table-cell'}}/>
        <button onClick={this.props.onRemove} type="button">X</button>
      </div>
    );
  },
});
