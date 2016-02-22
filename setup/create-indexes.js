#!/usr/bin/env node
"use strict";

const async = require('async');
const MongoClient = require('mongodb').MongoClient;

const exampleProperties = require('../models/clinvar-examples');

//Mongo has a hard limit of 64 indexes, so we manually pick a few common
//properties instead of indexing everything
var propertiesToIndex = [
  'ClinVarAssertion.AttributeSet.Citation.ID.text',
  'ClinVarAssertion.Citation.ID.text',
  'ClinVarAssertion.ClinicalSignificance.Citation.ID.text',
  'ClinVarAssertion.ClinVarAccession.Acc',
  'ClinVarAssertion.ClinVarSubmissionID.title',
  'ClinVarAssertion.ClinVarSubmissionID.localKey',
  'ClinVarAssertion.ExternalID.ID',
  'ClinVarAssertion.ID',
  'ClinVarAssertion.MeasureSet.Measure.AttributeSet.Attribute.text',
  'ClinVarAssertion.MeasureSet.Measure.AttributeSet.XRef.ID',
  'ClinVarAssertion.MeasureSet.Measure.Citation.ID.text',
  'ClinVarAssertion.MeasureSet.Measure.MeasureRelationship.Symbol.ElementValue.text',
  'ClinVarAssertion.MeasureSet.Measure.Name.ElementValue.text',
  'ClinVarAssertion.MeasureSet.Measure.SequenceLocation.Accession',
  'ClinVarAssertion.MeasureSet.Measure.XRef.ID',
  'ClinVarAssertion.ObservedIn.Citation.ID.text',
  'ClinVarAssertion.ObservedIn.Co-occurrenceSet.AlleleDescSet.Name',
  'ClinVarAssertion.ObservedIn.Method.XRef.ID',
  'ClinVarAssertion.ObservedIn.ObservedData.XRef.ID',
  'ClinVarAssertion.ObservedIn.Sample.FamilyData.PedigreeID',
  'ClinVarAssertion.ObservedIn.TraitSet.Trait.Name.ElementValue.text',
  'ClinVarAssertion.ObservedIn.TraitSet.Trait.XRef.ID',
  'ClinVarAssertion.ObservedIn.XRef.ID',
  'ClinVarAssertion.SubmissionName',
  'ClinVarAssertion.TraitSet.Trait.Name.ElementValue.text',
  'ClinVarAssertion.TraitSet.Trait.Symbol.ElementValue.text',
  'ClinVarAssertion.TraitSet.Trait.XRef.ID',
  'ID',
  'ReferenceClinVarAssertion.AttributeSet.XRef.ID',
  'ReferenceClinVarAssertion.ClinVarAccession.Acc',
  'ReferenceClinVarAssertion.ID',
  'ReferenceClinVarAssertion.MeasureSet.AttributeSet.Attribute.Change',
  'ReferenceClinVarAssertion.MeasureSet.AttributeSet.Attribute.text',
  'ReferenceClinVarAssertion.MeasureSet.ID',
  'ReferenceClinVarAssertion.MeasureSet.Measure.AttributeSet.Attribute.Change',
  'ReferenceClinVarAssertion.MeasureSet.Measure.AttributeSet.Attribute.text',
  'ReferenceClinVarAssertion.MeasureSet.Measure.AttributeSet.Citation.ID.text',
  'ReferenceClinVarAssertion.MeasureSet.Measure.AttributeSet.XRef.ID',
  'ReferenceClinVarAssertion.MeasureSet.Measure.Citation.ID.text',
  'ReferenceClinVarAssertion.MeasureSet.Measure.ID',
  'ReferenceClinVarAssertion.MeasureSet.Measure.MeasureRelationship.SequenceLocation.Accession',
  'ReferenceClinVarAssertion.MeasureSet.Measure.MeasureRelationship.Symbol.ElementValue.text',
  'ReferenceClinVarAssertion.MeasureSet.Measure.MeasureRelationship.XRef.ID',
  'ReferenceClinVarAssertion.MeasureSet.Measure.Name.Citation.ID.text',
  'ReferenceClinVarAssertion.MeasureSet.Measure.Name.ElementValue.text',
  'ReferenceClinVarAssertion.MeasureSet.Measure.Name.XRef.ID',
  'ReferenceClinVarAssertion.MeasureSet.Measure.SequenceLocation.Accession',
  'ReferenceClinVarAssertion.MeasureSet.Measure.Symbol.ElementValue.text',
  'ReferenceClinVarAssertion.MeasureSet.Measure.XRef.ID',
  'ReferenceClinVarAssertion.MeasureSet.Name.ElementValue.text',
  'ReferenceClinVarAssertion.TraitSet.Trait.AttributeSet.Citation.ID.text',
  'ReferenceClinVarAssertion.TraitSet.Trait.AttributeSet.XRef.ID',
  'ReferenceClinVarAssertion.TraitSet.Trait.Citation.ID.text',
  'ReferenceClinVarAssertion.TraitSet.Trait.Name.ElementValue.text',
  'ReferenceClinVarAssertion.TraitSet.Trait.Name.XRef.ID',
  'ReferenceClinVarAssertion.TraitSet.Trait.Symbol.ElementValue.text',
  'ReferenceClinVarAssertion.TraitSet.Trait.Symbol.XRef.ID',
  'ReferenceClinVarAssertion.TraitSet.Trait.XRef.ID',
  'ReferenceClinVarAssertion.MeasureSet.XRef.ID',
  'ReferenceClinVarAssertion.ObservedIn.ObservedData.Citation.ID.text',
  'ReferenceClinVarAssertion.ObservedIn.ObservedData.ID',
  'Title',
];

var indexFunctions = [];
var count = 0;

function indexProperty(db, property, callback) {
  db.ensureIndex('clinvarsets', property, function(err) {
    if (err) {
      console.log(); //move down from the status line
      console.log(err);
      callback();
      return;
    }
    count++;
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(String(count));
    callback();
  });
}

var startTime = Date.now();
console.log('Indexing ' + propertiesToIndex.length + ' properties...');

MongoClient.connect('mongodb://localhost:27017/clinvar_nerds', function(err, db) {
  propertiesToIndex.forEach(function(property) {
    if (exampleProperties[property].length < 10)
      console.log('Warning: ' + property + ' is rarely defined and probably doesn\'t need to be indexed.');
    indexFunctions.push(indexProperty.bind(this, db, property));
  });

  db.collection('clinvarsets').dropIndexes();

  async.series(indexFunctions, function(err) {
    console.log(); //move down from the status line
    console.log('Common properties are now indexed.');
    console.log('Time taken: ' + ((Date.now() - startTime) / 60000).toFixed() + ' minutes');
    process.exit(0);
  });
});
