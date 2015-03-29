var mongoose = require('mongoose');
var conn = mongoose.connect('mongodb://localhost/clinvar_nerds');

//don't crash the server if a query times out
mongoose.connection.on('error', function() {});

module.exports = mongoose;
