#!/usr/bin/env node

var fs = require('fs');
var clinvarCollects = require('../models/clinvar-collects');
var clinvarSchema = require('../models/clinvar-schema');
var ClinVarSet = require('../models/clinvarset');
var MongoClient = require('mongodb').MongoClient;
var XmlStream = require('xml-stream');

var nameStack = [];

/**
 * Returns true if the name stack says that the current item should be an object
 */
function shouldBeObject(item) {
  var correctType = clinvarSchema;
  nameStack.forEach(function(name) {
    correctType = correctType[name];
  });
  return (typeof(correctType) == 'object');
}

/**
 * Eliminates $ objects by merging them with the parent object
 * For example, {foo: 1, $: {bar: 2}} becomes {foo: 1, bar: 2}.
 * $text becomes text.
 * Anything that the schema says should be an object is converted to an object,
 * and its previous contents are moved to the text property.
 */
function moveAttributes(item) {
  Object.keys(item).forEach(function(key1) {
    if (Array.isArray(item))
      nameStack.push('0');
    else
      nameStack.push(key1);

    if (key1 == '$') {
      Object.keys(item.$).forEach(function(key2) {
        item[key2] = item.$[key2];
      });
      delete item.$;
    } else if (key1.charAt(0) == '$') {
      item[key1.substr(1)] = item[key1];
      delete item[key1];
    } else if (item[key1] instanceof Object) {
      moveAttributes(item[key1]);
    } else if (shouldBeObject(item[key1])) {
      item[key1] = {text: item[key1]};
    }

    nameStack.pop();
  });
}

var startTime = Date.now();

/* The database will increase in size by several gigabytes every time it is
   rebuilt unless it is dropped before rebuilding. Mongo's repairDatabase
   function would probably also work, but it requires more free disk space than
   I have. */
MongoClient.connect('mongodb://localhost:27017/clinvar_nerds', function(err, db) {
  console.log('Dropping database...');
  db.dropDatabase(function(err) {
    if (err) {
      console.log(err);
      process.exit(0);
    } else {
      var fileStream = fs.createReadStream('ClinVarFullRelease_00-latest.xml');
      var xmlStream = new XmlStream(fileStream);

      xmlStream.on('startElement: ReleaseSet', function(item) {
        fs.writeFileSync('models/clinvar-dates.js',
          'module.exports = ' + JSON.stringify({release: item.$.Dated, imported: (new Date()).toISOString()}, null, 2) + ';');
      });

      Object.keys(clinvarCollects).forEach(function(tagName) {
        xmlStream.collect(tagName);
      });

      var count = 0;
      console.log('Adding ClinVarSet elements (approximately 160,000 of them)...');
      xmlStream.on('endElement: ClinVarSet', function(item) {
        moveAttributes(item);
        var clinVarSet = new ClinVarSet(item);
        clinVarSet.save(function(err) {
          if (err) {
            console.log(); //move down from the status line
            console.log('item = ' + JSON.stringify(item, null, 2));
            console.log(err);
            process.exit(1);
          }
        });
        count++;
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write(String(count));
      });

      xmlStream.on('endElement: ReleaseSet', function() {
        console.log(); //move down from the status line
        console.log('Successfully rebuilt Mongo clinvar_nerds database.');
        console.log('Time taken: ' + ((Date.now() - startTime) / 60000).toFixed() + ' minutes');
        process.exit(0);
      });
    }
  });
});
