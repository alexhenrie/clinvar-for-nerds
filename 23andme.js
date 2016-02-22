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
    cursor.find({
      'ReferenceClinVarAssertion.MeasureSet.Measure.XRef.Type': 'rs',
      'ReferenceClinVarAssertion.MeasureSet.Measure.XRef.ID': rsIdNumber,
      'ReferenceClinVarAssertion.MeasureSet.Measure.SequenceLocation.alternateAllele': {$regex: '[' + cells[3] + ']'},
      $and: [
        {'ReferenceClinVarAssertion.ClinicalSignificance.Description': {$ne: 'Benign'}},
        {'ReferenceClinVarAssertion.ClinicalSignificance.Description': {$ne: 'Likely benign'}},
        {'ReferenceClinVarAssertion.ClinicalSignificance.Description': {$ne: 'Uncertain significance'}},
        {'ReferenceClinVarAssertion.ClinicalSignificance.Description': {$ne: 'not provided'}},
      ],
    }, {
      _id: 0,
      'ReferenceClinVarAssertion.MeasureSet.Measure.SequenceLocation.referenceAllele': 1,
      'ReferenceClinVarAssertion.MeasureSet.Measure.SequenceLocation.alternateAllele': 1,
      'ReferenceClinVarAssertion.MeasureSet.Measure.MeasureRelationship.Symbol.ElementValue.Type': 1,
      'ReferenceClinVarAssertion.MeasureSet.Measure.MeasureRelationship.Symbol.ElementValue.text': 1,
      'ReferenceClinVarAssertion.TraitSet.Trait.Name.ElementValue.Type': 1,
      'ReferenceClinVarAssertion.TraitSet.Trait.Name.ElementValue.text': 1,
      'ReferenceClinVarAssertion.ClinicalSignificance.Description': 1,
    }).toArray(function(err, docs) {
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
          var measure = doc.ReferenceClinVarAssertion.MeasureSet.Measure[0];
          var referenceAllele = measure.SequenceLocation[0].referenceAllele;
          var alternateAllele = measure.SequenceLocation[0].alternateAllele;
          var geneSymbol = '';
          for (var i = 0; i < measure.MeasureRelationship[0].Symbol.length; i++) {
            if (measure.MeasureRelationship[0].Symbol[i].ElementValue.Type == 'Preferred') {
              geneSymbol = measure.MeasureRelationship[0].Symbol[i].ElementValue.text;
              break;
            }
          }
          process.stderr.cursorTo(0); //overwrite status line
          console.log(
            cells[0] + '\t' +
            geneSymbol + '\t' +
            referenceAllele + '>' + alternateAllele + '\t' +
            cells[3] + '\t' +
            doc.ReferenceClinVarAssertion.ClinicalSignificance.Description + '\t' +
            traits.join('; ')
          );
        });
      }
      linesDone++;
      process.stderr.cursorTo(0);
      process.stderr.write(String(linesDone));
      if (linesDone == lines.length) {
        process.stderr.cursorTo(0); //overwrite status line
        console.error('All done! Analysis took ' + ((Date.now() - startTime) / 60000).toFixed() + ' minutes.');
        process.exit();
      }
    });
  });
});
