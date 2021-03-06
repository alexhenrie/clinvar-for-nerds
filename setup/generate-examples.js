#!/usr/bin/env node
"use strict";

const async = require('async');
const fs = require('fs');

var clinvarSchema = require('../models/clinvar-schema');
var MongoClient = require('mongodb').MongoClient;

var queryFunctions = [];
var examples = {};

var usedNever = [];
var usedOnce = [];
var usedMultiple = [];

function queryForExamples(cursor, propertyName, arrayDepth, callback) {
  var matchQuery = {};
  matchQuery[propertyName] = {$exists: 1};
  var pipeline = [
    {$match: matchQuery},
    {$group: {_id: '$' + propertyName}},
  ];
  for (var i = 0; i < arrayDepth; i++)
    pipeline.push({$unwind: '$_id'});
  pipeline.push({$group: {_id: '$_id'}});
  pipeline.push({$limit: 10});
  cursor.aggregate(pipeline, {allowDiskUse: true}, function(err, values) {
    if (err) {
      console.log(err);
      callback(err);
      return;
    }
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
  });
}

function makeQueryFunctions(cursor, schema, prefix, arrayDepth) {
  Object.keys(schema).forEach(function(key) {
    if (Array.isArray(schema))
      makeQueryFunctions(cursor, schema[key], prefix, arrayDepth + 1);
    else if (typeof(schema[key]) == 'object')
      makeQueryFunctions(cursor, schema[key], prefix + key + '.', arrayDepth);
    else
      queryFunctions.push(queryForExamples.bind(this, cursor, prefix + key, arrayDepth));
  });
}

MongoClient.connect('mongodb://localhost:27017/clinvar_nerds', function(err, db) {
  if (err) {
    console.log(err);
    return;
  }

  var startTime = Date.now();
  console.log('Generating examples (searching approximately 2,100 properties)...');
  makeQueryFunctions(db.collection('clinvarsets'), clinvarSchema, '', 0);

  async.series(queryFunctions, function(err) {
    if (err) {
      console.log(err);
      process.exit(1);
    }
    fs.writeFileSync('models/clinvar-examples.js',
      'module.exports = ' + JSON.stringify(examples, null, 2) + ';');
    fs.writeFileSync('used-never.txt', usedNever.sort().join('\n'));
    fs.writeFileSync('used-once.txt', usedOnce.sort().join('\n'));
    fs.writeFileSync('used-multiple.txt', usedMultiple.sort().join('\n'));
    console.log(); //move down from the status line
    console.log('Found examples of ' + (usedOnce.length + usedMultiple.length) + ' properties out of ' + (usedNever.length + usedOnce.length + usedMultiple.length) + ' total.');
    console.log(usedOnce.length + ' of those properties only have one possible value.');
    console.log('Time taken: ' + ((Date.now() - startTime) / 60000).toFixed() + ' minutes');
    process.exit(0);
  });
});
