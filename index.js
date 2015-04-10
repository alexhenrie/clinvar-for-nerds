#!/usr/bin/env node

var express = require('express');
var app = express();
var ClinVarSet = require('./models/clinvarset.js');
var csvStringify = require('csv-stringify');
var MongoClient = require('mongodb').MongoClient;

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
  MongoClient.connect('mongodb://localhost:27017/clinvar_nerds', {server: {socketOptions: {socketTimeoutMS: 20000}}}, function(err, db) {
    if (err) {
      res.send(err);
      return;
    }
    db.collection('clinvarsets')
      .find(JSON.parse(req.query.q))
      .toArray(function(err, docs) {
        if (err) {
          res.status(400); //bad request
          res.send(err.toString());
          return;
        }

        //remove Mongo metadata
        stripMongo(docs);

        //remove empty objects if requested
        if (req.query.strip)
          stripEmpty(docs);

        if (!req.query.format || req.query.format == 'json') {
          res.json(docs);
        } else {
          //create a master list of headers
          var properties = [];
          for (var i = 0; i < docs.length; i++)
            listProperties(docs[i], properties, '');
          properties.sort();

          //transform each ClinVarSet into a flat object
          var flatSets = docs.map(function(set) {
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
});

app.use(express.static(__dirname + '/assets'));
app.use('/dist', express.static(__dirname + '/dist'));

var server = app.listen(3000, function() {
  console.log('Listening on port %d', server.address().port);
});
