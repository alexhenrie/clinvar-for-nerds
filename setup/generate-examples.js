#!/usr/bin/node

const async = require('async');
const fs = require('fs');

var clinvarSchema = require('../models/clinvar-schema');
var ClinVarSet = require('../models/clinvarset.js');

var queryFunctions = [];
var examples = {};

var usedNever = [];
var usedOnce = [];
var usedMultiple = [];

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
          if (values.length == 1)
            usedOnce.push(propertyName);
          else
            usedMultiple.push(propertyName);
          examples[propertyName] = values.map(function(value) {
            return value._id;
          });
        } else {
          usedNever.push(propertyName);
        }
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write(String(usedNever.length + usedOnce.length + usedMultiple.length));
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
    if (process.argv[2] == '--details') {
      fs.writeFileSync('used-never.txt', usedNever.join('\n'));
      fs.writeFileSync('used-once.txt', usedOnce.join('\n'));
      fs.writeFileSync('used-multiple.txt', usedMultiple.join('\n'));
    }
    console.log(); //move down from the status line
    console.log('Found examples of ' + (usedOnce.length + usedMultiple.length) + ' properties out of ' + (usedNever.length + usedOnce.length + usedMultiple.length) + ' total.');
    console.log(usedOnce.length + ' of those properties only have one possible value.');
    console.log('Time taken: ' + ((Date.now() - startTime) / 60000).toFixed() + ' minutes');
    process.exit(0);
  }
});
