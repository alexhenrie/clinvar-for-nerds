#!/usr/bin/env node

var express = require('express');
var app = express();
var ClinVarSet = require('./models/clinvarset.js');
var csvStringify = require('csv-stringify');
var MongoClient = require('mongodb').MongoClient;
const RECORDS_PER_PAGE = require('./records-per-page');

/**
 * Removes properties added by Mongo
 */
function stripMongo(obj) {
  Object.keys(obj).forEach(function(key) {
    if (key == '_id')
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

app.get('/count', function(req, res) {
  MongoClient.connect('mongodb://localhost:27017/clinvar_nerds', {server: {socketOptions: {socketTimeoutMS: 20000}}}, function(err, db) {
    if (err) {
      res.status(500); //internal server error
      res.send(err);
      return;
    }
    var q;
    try {
      q = JSON.parse(req.query.q);
    } catch (e) {
      res.status(400); //bad request
      return;
    }
    db.collection('clinvarsets').count(q, function(err, count) {
      if (err) {
        res.status(400); //bad request
        return;
      }
      res.send(String(count));
    });
  });
});

app.get('/find', function(req, res) {
  MongoClient.connect('mongodb://localhost:27017/clinvar_nerds', {server: {socketOptions: {socketTimeoutMS: 20000}}}, function(err, db) {
    if (err) {
      res.status(500); //internal server error
      res.send(err);
      return;
    }
    var q;
    try {
      q = JSON.parse(req.query.q);
    } catch (e) {
      res.status(400); //bad request
      return;
    }
    db.collection('clinvarsets')
      .find(q)
      .skip(Number(req.query.start) || 0)
      .project({__v: 0})
      .limit(RECORDS_PER_PAGE) //make sure the toArray function doesn't take forever or run out of memory
      .toArray(function(err, docs) {
        if (err) {
          res.status(400); //bad request
          res.send(err.toString());
          return;
        }

        //mongo will return more than our limit if it thinks it won't hurt performance
        //we don't want this, we want a hard limit
        docs = docs.splice(0, RECORDS_PER_PAGE);

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
