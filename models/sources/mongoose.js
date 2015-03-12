var mongoose = require('mongoose');
var conn = mongoose.connect('mongodb://localhost/clinvar_nerds');

module.exports = mongoose;
