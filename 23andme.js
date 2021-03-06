"use strict";

const fs = require('fs');
const MongoClient = require('mongodb').MongoClient;

var startTime = Date.now();
var lines = fs.readFileSync(process.argv[2], 'utf8').split('\r\n');

MongoClient.connect('mongodb://localhost:27017/clinvar_nerds', function(err, db) {
  if (err) {
    console.error(err);
    return;
  }
  var cursor = db.collection('clinvarsets');
  var linesDone = 0;
  process.stderr.write('Analyzing ' + lines.length + ' lines...\n');
  lines.forEach(function(line) {
    var cells = line.split('\t');
    if (cells.length < 3 || cells[0] == '#' || cells[0].substring(0, 2) != 'rs' || cells[3] == '--') {
      linesDone++;
      return;
    }
    var rsIdNumber = cells[0].substring(2);
    cursor.aggregate([
      {$match: {'ReferenceClinVarAssertion.MeasureSet.Measure.XRef.Type': 'rs'}},
      {$match: {'ReferenceClinVarAssertion.MeasureSet.Measure.XRef.ID': rsIdNumber}},
      {$match: {'ReferenceClinVarAssertion.MeasureSet.Measure.SequenceLocation.alternateAllele': {$regex: '[' + cells[3] + ']'}}},
      {$match: {'ReferenceClinVarAssertion.ClinicalSignificance.Description': {$ne: 'Benign'}}},
      {$match: {'ReferenceClinVarAssertion.ClinicalSignificance.Description': {$ne: 'Likely benign'}}},
      {$match: {'ReferenceClinVarAssertion.ClinicalSignificance.Description': {$ne: 'Uncertain significance'}}},
      {$match: {'ReferenceClinVarAssertion.ClinicalSignificance.Description': {$ne: 'not provided'}}},
      {$unwind: '$ReferenceClinVarAssertion.MeasureSet.Measure'},
      {$unwind: '$ReferenceClinVarAssertion.MeasureSet.Measure.XRef'},
      {$match: {'ReferenceClinVarAssertion.MeasureSet.Measure.XRef.Type': 'rs'}},
      {$match: {'ReferenceClinVarAssertion.MeasureSet.Measure.XRef.ID': rsIdNumber}},
      {$match: {'ReferenceClinVarAssertion.MeasureSet.Measure.SequenceLocation.alternateAllele': {$regex: '[' + cells[3] + ']'}}},
    ]).toArray(function(err, docs) {
      process.stderr.cursorTo(0);
      process.stderr.clearLine();
      process.stderr.write(linesDone + '\t' + line);
      if (err) {
        console.error(); //move down from the status line
        console.error(err);
      } else if (docs) {
        docs.forEach(function(doc) {
          var traits = [];
          doc.ReferenceClinVarAssertion.TraitSet.Trait.forEach(function(trait) {
            trait.Name.forEach(function(name) {
              if (name.ElementValue.Type == 'Preferred') {
                traits.push(name.ElementValue.text);
              }
            });
          });
          var measure = doc.ReferenceClinVarAssertion.MeasureSet.Measure;
          var referenceAllele = measure.SequenceLocation[0].referenceAllele;
          var alternateAllele = measure.SequenceLocation[0].alternateAllele;
          var geneSymbol = '';
          if (measure.MeasureRelationship.length) {
            for (var i = 0; i < measure.MeasureRelationship[0].Symbol.length; i++) {
              if (measure.MeasureRelationship[0].Symbol[i].ElementValue.Type == 'Preferred') {
                geneSymbol = measure.MeasureRelationship[0].Symbol[i].ElementValue.text;
                break;
              }
            }
          }
          var significance = doc.ReferenceClinVarAssertion.ClinicalSignificance.Description;
          process.stderr.cursorTo(0); //overwrite status line
          console.log(
            cells[0] + '\t' +
            geneSymbol + '\t' +
            referenceAllele + '>' + alternateAllele + '\t' +
            cells[3] + '\t' +
            significance + '\t' +
            traits.join('; ')
          );
        });
      }
      linesDone++;
      if (linesDone == lines.length) {
        process.stderr.cursorTo(0); //overwrite status line
        process.stderr.clearLine();
        console.error('All done! Analysis took ' + ((Date.now() - startTime) / 60000).toFixed() + ' minutes.');
        process.exit();
      }
    });
  });
});
