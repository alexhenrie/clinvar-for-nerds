#!/usr/bin/node

const async = require('async');
const fs = require('fs');

var clinvarSchema = require('../models/clinvar-schema');
var ClinVarSet = require('../models/clinvarset.js');

var queryFunctions = [];
var examples = {};

var usedCount = 0;
var totalCount = 0;

function queryForExamples(propertyName, arrayDepth, callback) {
  var matchQuery = {};
  matchQuery[propertyName] = {$exists: 1};
  var aggregate = ClinVarSet.aggregate()
    .match(matchQuery)
    .group({_id: '$' + propertyName});
  for (var i = 0; i < arrayDepth; i++)
    aggregate.unwind('_id');
  aggregate
    .group({_id: '$_id'})
    .limit(10)
    .exec(function(err, values) {
      if (err) {
        console.log(err);
        callback(err);
      } else {
        //tons of possible ClinVar fields are never used, exclude them
        if (values.length) {
          examples[propertyName] = values.map(function(value) {
            return value._id;
          });
          usedCount++;
        }
        totalCount++;
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write(String(totalCount));
        callback();
      }
    });
}

function makeQueryFunctions(schema, prefix, arrayDepth) {
  Object.keys(schema).forEach(function(key) {
    if (Array.isArray(schema))
      makeQueryFunctions(schema[key], prefix, arrayDepth + 1);
    else if (typeof(schema[key]) == 'object')
      makeQueryFunctions(schema[key], prefix + key + '.', arrayDepth);
    else
      queryFunctions.push(queryForExamples.bind(this, prefix + key, arrayDepth));
  });
}

var startTime = Date.now();
console.log('Generating examples (searching approximately 2,100 properties)...');
makeQueryFunctions(clinvarSchema, '', 0);

async.series(queryFunctions, function(err) {
  if (err) {
    console.log(err);
    process.exit(1);
  } else {
    fs.writeFileSync('models/clinvar-examples.js',
      'module.exports = ' + JSON.stringify(examples, null, 2) + ';');
    console.log(); //move down from the status line
    console.log('Found examples of ' + usedCount + ' properties out of ' + totalCount + ' total.');
    console.log('Time taken: ' + ((Date.now() - startTime) / 60000).toFixed() + ' minutes');
    process.exit(0);
  }
});
