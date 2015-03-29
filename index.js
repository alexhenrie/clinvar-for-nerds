#!/usr/bin/node

var express = require('express');
var app = express();
var ClinVarSet = require('./models/clinvarset.js');
var csvStringify = require('csv-stringify');
var Marko = require('marko');

/**
 * Removes properties added by Mongo
 */
function stripMongo(obj) {
  Object.keys(obj).forEach(function(key) {
    if (key == '_id' || key == '__v')
      delete obj[key]
    else if (typeof(obj[key]) != 'object')
      return;
    else
      stripMongo(obj[key]);
  });
}

/**
 * Deletes empty objects and objects that only contain empty objects
 */
function stripEmpty(obj) {
  Object.keys(obj).forEach(function(key) {
    if (typeof(obj[key]) != 'object')
      return;

    stripEmpty(obj[key]);
    if (Object.keys(obj[key]).length == 0)
      delete obj[key];
  });
}

/**
 * Lists the properties of the object and its children. The output goes into
 * ret, which must be an array, and prefix must be an empty string.
 */
function listProperties(obj, ret, prefix) {
  Object.keys(obj).forEach(function(key) {
    if (typeof(obj[key]) == 'object') {
      listProperties(obj[key], ret, prefix + key + '.');
    } else {
      var newKey = prefix + key;
      if (ret.indexOf(newKey) == -1)
        ret.push(newKey);
    }
  });
}

/**
 * Flattens an object and its children into a single object with keys and values
 * for each of the childrens' properties. The output goes into ret, which must
 * be an array, and prefix must be an empty string.
 */
function flatten(obj, ret, prefix) {
  Object.keys(obj).forEach(function(key) {
    if (typeof(obj[key]) == 'object')
      flatten(obj[key], ret, prefix + key + '.');
    else
      ret[prefix + key] = obj[key];
  });
}

app.set('json spaces', 2);

app.get('/api', function(req, res) {
  ClinVarSet.find(JSON.parse(req.query.q), function(err, doc) {
    if (err) {
      res.status(400); //bad request
      res.send(err.toString());
      return;
    }

    //remove Mongoose metadata
    doc = doc.map(function(set) {
      return set.toObject();
    });
    stripMongo(doc);

    //remove empty objects if requested
    if (req.query.strip)
      stripEmpty(doc);

    if (!req.query.format || req.query.format == 'json') {
      res.json(doc);
    } else {
      //create a master list of headers
      var properties = [];
      for (var i = 0; i < doc.length; i++)
        listProperties(doc[i], properties, '');
      properties.sort();

      //transform each ClinVarSet into a flat object
      var flatSets = doc.map(function(set) {
        var flatSet = {};
        flatten(set, flatSet, '');
        return flatSet;
      })

      //output each ClinVarSet as a row aligned to the master headers
      rows = [[]];
      properties.forEach(function(property) {
        rows[0].push(property);
      });
      flatSets.forEach(function(flatSet) {
        row = [];
        properties.forEach(function(property) {
          row.push(flatSet[property] || '');
        });
        rows.push(row);
      });
      csvStringify(rows, function(err, output) {
        if (err) {
          console.log(err);
          return;
        }
        res.send(output);
      });
    }
  });
});

var exampleProperties = require('./models/clinvar-examples.js');
Object.keys(exampleProperties).forEach(function(key) {
  exampleProperties[key] = exampleProperties[key].map(function(value) {
    return JSON.stringify(value);
  }).join(', ');
});

app.get('/', function(req, res) {
  Marko.load(require.resolve(__dirname + '/views/index.marko')).render({exampleProperties: exampleProperties}, res);
});

app.use(express.static(__dirname + '/assets'));
app.use('/dist', express.static(__dirname + '/dist'));

var server = app.listen(3000, function() {
  console.log('Listening on port %d', server.address().port);
});
