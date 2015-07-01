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
    if (typeof(obj[key]) != 'object' || obj[key] instanceof Date)
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

/**
 * Mongo will return more than our limit if it thinks it won't hurt performance.
 * We don't want this, we want a hard limit. We also usually want to strip out
 * some fields from the results.
 */
function limit(docs, doStripMongo, doStripEmpty) {
  docs = docs.splice(0, RECORDS_PER_PAGE);

  //remove Mongo metadata if requested
  if (doStripMongo)
    stripMongo(docs);

  //remove empty objects if requested
  if (doStripEmpty)
    stripEmpty(docs);

  return docs;
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
    var pipeline = [
      {$match: q},
      {$limit: RECORDS_PER_PAGE}, //make sure the toArray function doesn't take forever or run out of memory
    ];
    var cursor = db.collection('clinvarsets')

    switch (req.query.format)
    {
      case 'csv':
        pipeline.push({$skip: Number(req.query.start) || 0});
        cursor.aggregate(pipeline).toArray(function(err, docs) {
          if (err) {
            res.status(400); //bad request
            res.send(err.toString());
            return;
          }

          docs = limit(docs, true, req.query.strip);

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
            res.set('Content-Type', 'text/plain');
            res.send(output);
          });
        });
        break;
      case 'vcf':
        pipeline.push({$unwind: '$ReferenceClinVarAssertion.MeasureSet.Measure'});
        pipeline.push({$unwind: '$ReferenceClinVarAssertion.MeasureSet.Measure.XRef'});
        pipeline.push({$match: {'ReferenceClinVarAssertion.MeasureSet.Measure.XRef.Type': 'rs'}});
        pipeline.push({$match: {'ReferenceClinVarAssertion.MeasureSet.Measure.XRef.DB': 'dbSNP'}});
        pipeline.push({$group: {
          _id: '$ReferenceClinVarAssertion.MeasureSet.Measure.XRef.ID',
          records: {$push: '$$ROOT'},
        }});
        pipeline.push({$skip: Number(req.query.start) || 0});
        cursor.aggregate(pipeline).toArray(function(err, docs) {
          if (err) {
            res.status(400); //bad request
            res.send(err.toString());
            return;
          }

          docs = limit(docs, false, false);

          var output =
            '##fileformat=VCFv4.2\n' +
            '##fileDate=' + (new Date()).toISOString().substring(0, 10).replace(/-/g, '') + '\n' +
            '##source=ClinVar for Nerds\n' +
            '##reference=GRCh38\n' +
            '##INFO=<ID=RS,Number=1,Type=Integer,Description="dbSNP ID (i.e. rs number)">\n' +
            '##INFO=<ID=RSPOS,Number=1,Type=Integer,Description="Chr position reported in dbSNP">\n' +
            //'##INFO=<ID=RV,Number=0,Type=Flag,Description="RS orientation is reversed">\n' +
            //'##INFO=<ID=VP,Number=1,Type=String,Description="Variation Property.  Documentation is at ftp://ftp.ncbi.nlm.nih.gov/snp/specs/dbSNP_BitField_latest.pdf">\n' +
            '##INFO=<ID=GENEINFO,Number=1,Type=String,Description="Pairs each of gene symbol:gene id.  The gene symbol and id are delimited by a colon (:) and each pair is delimited by a vertical bar (|)">\n' +
            //'##INFO=<ID=dbSNPBuildID,Number=1,Type=Integer,Description="First dbSNP Build for RS">\n' +
            '##INFO=<ID=SAO,Number=1,Type=Integer,Description="Variant Allele Origin: 0 - unspecified, 1 - Germline, 2 - Somatic, 3 - Both">\n' +
            '##INFO=<ID=SSR,Number=1,Type=Integer,Description="Variant Suspect Reason Codes (may be more than one value added together) 0 - unspecified, 1 - Paralog, 2 - byEST, 4 - oldAlign, 8 - Para_EST, 16 - 1kg_failed, 1024 - other">\n' +
            '##INFO=<ID=WGT,Number=1,Type=Integer,Description="Weight, 00 - unmapped, 1 - weight 1, 2 - weight 2, 3 - weight 3 or more">\n' +
            //'##INFO=<ID=VC,Number=1,Type=String,Description="Variation Class">\n' +
            //'##INFO=<ID=PM,Number=0,Type=Flag,Description="Variant is Precious(Clinical,Pubmed Cited)">\n' +
            //'##INFO=<ID=TPA,Number=0,Type=Flag,Description="Provisional Third Party Annotation(TPA) (currently rs from PHARMGKB who will give phenotype data)">\n' +
            //'##INFO=<ID=PMC,Number=0,Type=Flag,Description="Links exist to PubMed Central article">\n' +
            //'##INFO=<ID=S3D,Number=0,Type=Flag,Description="Has 3D structure - SNP3D table">\n' +
            //'##INFO=<ID=SLO,Number=0,Type=Flag,Description="Has SubmitterLinkOut - From SNP->SubSNP->Batch.link_out">\n' +
            '##INFO=<ID=NSF,Number=0,Type=Flag,Description="Has non-synonymous frameshift A coding region variation where one allele in the set changes all downstream amino acids. FxnClass = 44">\n' +
            '##INFO=<ID=NSM,Number=0,Type=Flag,Description="Has non-synonymous missense A coding region variation where one allele in the set changes protein peptide. FxnClass = 42">\n' +
            '##INFO=<ID=NSN,Number=0,Type=Flag,Description="Has non-synonymous nonsense A coding region variation where one allele in the set changes to STOP codon (TER). FxnClass = 41">\n' +
            //'##INFO=<ID=REF,Number=0,Type=Flag,Description="Has reference A coding region variation where one allele in the set is identical to the reference sequence. FxnCode = 8">\n' +
            '##INFO=<ID=SYN,Number=0,Type=Flag,Description="Has synonymous A coding region variation where one allele in the set does not change the encoded amino acid. FxnCode = 3">\n' +
            '##INFO=<ID=U3,Number=0,Type=Flag,Description="In 3\' UTR Location is in an untranslated region (UTR). FxnCode = 53">\n' +
            '##INFO=<ID=U5,Number=0,Type=Flag,Description="In 5\' UTR Location is in an untranslated region (UTR). FxnCode = 55">\n' +
            '##INFO=<ID=ASS,Number=0,Type=Flag,Description="In acceptor splice site FxnCode = 73">\n' +
            '##INFO=<ID=DSS,Number=0,Type=Flag,Description="In donor splice-site FxnCode = 75">\n' +
            '##INFO=<ID=INT,Number=0,Type=Flag,Description="In Intron FxnCode = 6">\n' +
            //'##INFO=<ID=R3,Number=0,Type=Flag,Description="In 3\' gene region FxnCode = 13">\n' +
            //'##INFO=<ID=R5,Number=0,Type=Flag,Description="In 5\' gene region FxnCode = 15">\n' +
            //'##INFO=<ID=OTH,Number=0,Type=Flag,Description="Has other variant with exactly the same set of mapped positions on NCBI refernce assembly.">\n' +
            '##INFO=<ID=CFL,Number=0,Type=Flag,Description="Has Assembly conflict. This is for weight 1 and 2 variant that maps to different chromosomes on different assemblies.">\n' +
            //'##INFO=<ID=ASP,Number=0,Type=Flag,Description="Is Assembly specific. This is set if the variant only maps to one assembly">\n' +
            //'##INFO=<ID=MUT,Number=0,Type=Flag,Description="Is mutation (journal citation, explicit fact): a low frequency variation that is cited in journal and other reputable sources">\n' +
            //'##INFO=<ID=VLD,Number=0,Type=Flag,Description="Is Validated.  This bit is set if the variant has 2+ minor allele count based on frequency or genotype data.">\n' +
            //'##INFO=<ID=G5A,Number=0,Type=Flag,Description=">5% minor allele frequency in each and all populations">\n' +
            //'##INFO=<ID=G5,Number=0,Type=Flag,Description=">5% minor allele frequency in 1+ populations">\n' +
            //'##INFO=<ID=HD,Number=0,Type=Flag,Description="Marker is on high density genotyping kit (50K density or greater).  The variant may have phenotype associations present in dbGaP.">\n' +
            //'##INFO=<ID=GNO,Number=0,Type=Flag,Description="Genotypes available. The variant has individual genotype (in SubInd table).">\n' +
            //'##INFO=<ID=KGPhase1,Number=0,Type=Flag,Description="1000 Genome phase 1 (incl. June Interim phase 1)">\n' +
            //'##INFO=<ID=KGPhase3,Number=0,Type=Flag,Description="1000 Genome phase 3">\n' +
            //'##INFO=<ID=CDA,Number=0,Type=Flag,Description="Variation is interrogated in a clinical diagnostic assay">\n' +
            //'##INFO=<ID=LSD,Number=0,Type=Flag,Description="Submitted from a locus-specific database">\n' +
            //'##INFO=<ID=MTP,Number=0,Type=Flag,Description="Microattribution/third-party annotation(TPA:GWAS,PAGE)">\n' +
            '##INFO=<ID=OM,Number=0,Type=Flag,Description="Has OMIM/OMIA">\n' +
            //'##INFO=<ID=NOC,Number=0,Type=Flag,Description="Contig allele not present in variant allele list. The reference sequence allele at the mapped position is not present in the variant allele list, adjusted for orientation.">\n' +
            //'##INFO=<ID=WTD,Number=0,Type=Flag,Description="Is Withdrawn by submitter If one member ss is withdrawn by submitter, then this bit is set.  If all member ss\' are withdrawn, then the rs is deleted to SNPHistory">\n' +
            //'##INFO=<ID=NOV,Number=0,Type=Flag,Description="Rs cluster has non-overlapping allele sets. True when rs set has more than 2 alleles from different submissions and these sets share no alleles in common.">\n' +
            //'##INFO=<ID=CAF,Number=.,Type=String,Description="An ordered, comma delimited list of allele frequencies based on 1000Genomes, starting with the reference allele followed by alternate alleles as ordered in the ALT column. Where a 1000Genomes alternate allele is not in the dbSNPs alternate allele set, the allele is added to the ALT column.  The minor allele is the second largest value in the list, and was previuosly reported in VCF as the GMAF.  This is the GMAF reported on the RefSNP and EntrezSNP pages and VariationReporter">\n' +
            //'##INFO=<ID=COMMON,Number=1,Type=Integer,Description="RS is a common SNP.  A common SNP is one that has at least one 1000Genomes population with a minor allele of frequency >= 1% and for which 2 or more founders contribute to that minor allele frequency.">\n' +
            '##INFO=<ID=CLNHGVS,Number=.,Type=String,Description="Variant names from HGVS.    The order of these variants corresponds to the order of the info in the other clinical  INFO tags.">\n' +
            //'##INFO=<ID=CLNALLE,Number=.,Type=Integer,Description="Variant alleles from REF or ALT columns.  0 is REF, 1 is the first ALT allele, etc.  This is used to match alleles with other corresponding clinical (CLN) INFO tags.  A value of -1 indicates that no allele was found to match a corresponding HGVS allele name.">\n' +
            //'##INFO=<ID=CLNSRC,Number=.,Type=String,Description="Variant Clinical Chanels">\n' +
            '##INFO=<ID=CLNORIGIN,Number=.,Type=String,Description="Allele Origin. One or more of the following values may be added: 0 - unknown; 1 - germline; 2 - somatic; 4 - inherited; 8 - paternal; 16 - maternal; 32 - de-novo; 64 - biparental; 128 - uniparental; 256 - not-tested; 512 - tested-inconclusive; 1073741824 - other">\n' +
            //'##INFO=<ID=CLNSRCID,Number=.,Type=String,Description="Variant Clinical Channel IDs">\n' +
            '##INFO=<ID=CLNSIG,Number=.,Type=String,Description="Variant Clinical Significance, 0 - Uncertain significance, 1 - not provided, 2 - Benign, 3 - Likely benign, 4 - Likely pathogenic, 5 - Pathogenic, 6 - drug response, 7 - histocompatibility, 255 - other">\n' +
            //'##INFO=<ID=CLNDSDB,Number=.,Type=String,Description="Variant disease database name">\n' +
            //'##INFO=<ID=CLNDSDBID,Number=.,Type=String,Description="Variant disease database ID">\n' +
            '##INFO=<ID=CLNDBN,Number=.,Type=String,Description="Variant disease name">\n' +
            '##INFO=<ID=CLNREVSTAT,Number=.,Type=String,Description="ClinVar Review Status, mult - Classified by multiple submitters, single - Classified by single submitter, not - Not classified by submitter, exp - Reviewed by expert panel, prof - Reviewed by professional society">\n' +
            '##INFO=<ID=CLNACC,Number=.,Type=String,Description="Variant Accession and Versions">\n' +
            '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\n';
          docs.forEach(function(doc) {
            var chr = '.';
            var pos = '.';
            var ref = '.';
            var alt = '.';
            var geneinfo;
            var sao = 0;
            var ssr = 0;
            var allWgt = [];
            var nsf = false;
            var nsm = false;
            var nsn = false;
            var syn = false;
            var u3 = false;
            var u5 = false;
            var ass = false;
            var dss = false;
            var int = false;
            var cfl = false;
            var om = false;
            var clnhgvs;
            var clnorigin = 0;
            var allClnsig = [];
            var allClndbn = [];
            var allClnrevstat = [];
            var allClnacc = [];

            doc.records.forEach(function(record) {
              record.ReferenceClinVarAssertion.ObservedIn.forEach(function(observation) {
                switch (observation.Sample.Origin) {
                  case 'germline':
                    sao |= 1;
                    clnorigin |= 1;
                    break;
                  case 'somatic':
                    sao |= 3; //NCBI's official VCF says that everything somatic is also germline
                    clnorigin |= 2;
                    break;
                  case 'inherited':
                    clnorigin |= 4;
                    break;
                  case 'paternal':
                    clnorigin |= 8;
                    break;
                  case 'maternal':
                    clnorigin |= 16;
                    break;
                  case 'de-novo':
                    clnorigin |= 32;
                    break;
                  case 'biparental':
                    clnorigin |= 64;
                    break;
                  case 'uniparental':
                    clnorigin |= 128;
                    break;
                  case 'not-tested':
                    clnorigin |= 256;
                    break;
                  case 'tested-inconclusive':
                    clnorigin |= 512;
                    break;
                  case 'other':
                    clnorigin |= 1073741824;
                    break;
                }
              }); //ObservedIn

              var clnsig = 1;
              var clnrevstat = 'not';
              if (record.ReferenceClinVarAssertion.ClinicalSignificance) {
                switch (record.ReferenceClinVarAssertion.ClinicalSignificance.Description) {
                  case 'Uncertain significance':
                    clnsig = 0;
                    break;
                  case 'Benign':
                    clnsig = 2;
                    break;
                  case 'Likely benign':
                    clnsig = 3;
                    break;
                  case 'Likely pathogenic':
                    clnsig = 4;
                    break;
                  case 'Pathogenic':
                    clnsig = 5;
                    break;
                  case 'drug response':
                    clnsig = 6;
                    break;
                  case 'histocompatibility':
                    clnsig = 7;
                    break;
                  case 'other':
                    clnsig = 255;
                    break;
                }
                switch (record.ReferenceClinVarAssertion.ClinicalSignificance.ReviewStatus) {
                  case 'classified by multiple submitters':
                    clnrevstat = 'mult';
                    break;
                  case 'classified by single submitter':
                    clnrevstat = 'single';
                    break;
                  case 'reviewed by expert panel':
                    clnrevstat = 'exp';
                    break;
                  case 'reviewed by professional society':
                    clnrevstat = 'prof';
                    break;
                }
              } //ClinicalSignificance
              allClnsig.push(clnsig);
              allClnrevstat.push(clnrevstat);

              var clndbn = 'not_provided';
              if (record.ReferenceClinVarAssertion.TraitSet && record.ReferenceClinVarAssertion.TraitSet.Trait) {
                for (var i = 0; i < record.ReferenceClinVarAssertion.TraitSet.Trait.length; i++) {
                  if (record.ReferenceClinVarAssertion.TraitSet.Trait[i].XRef) {
                    for (var j = 0; j < record.ReferenceClinVarAssertion.TraitSet.Trait[i].XRef.length && !om; j++) {
                      if (record.ReferenceClinVarAssertion.TraitSet.Trait[i].XRef[j].DB == 'OMIM') {
                        om = true;
                        break;
                      }
                    }
                  }
                  if (record.ReferenceClinVarAssertion.TraitSet.Trait[i].Name) {
                    for (var j = 0; j < record.ReferenceClinVarAssertion.TraitSet.Trait[i].Name.length; j++) {
                      if (record.ReferenceClinVarAssertion.TraitSet.Trait[i].Name[j].ElementValue.Type == 'Preferred') {
                        clndbn = record.ReferenceClinVarAssertion.TraitSet.Trait[i].Name[j].ElementValue.text.replace(/ /g, '_');
                        break;
                      }
                    }
                  }
                }
              } //Trait
              allClndbn.push(clndbn);

              allClnacc.push(record.ReferenceClinVarAssertion.ClinVarAccession.Acc + '.' + record.ReferenceClinVarAssertion.ClinVarAccession.Version);

              var measure = record.ReferenceClinVarAssertion.MeasureSet.Measure;

              if (measure.SequenceLocation) {
                for (var i = 0; i < measure.SequenceLocation.length; i++) {
                  if (measure.SequenceLocation[i].Assembly == 'GRCh38') {
                    if (chr == '.') {
                      chr = measure.SequenceLocation[i].Chr;
                      pos = measure.SequenceLocation[i].start;
                      ref = measure.SequenceLocation[i].referenceAllele;
                      alt = measure.SequenceLocation[i].alternateAllele.replace('-', '*');
                      if (alt == ref) alt = '.';
                      clnhgvs = measure.SequenceLocation[i].Accession;
                    } else {
                      if (chr != measure.SequenceLocation[i].Chr) {
                        cfl = true;
                        break;
                      }
                    }
                    break;
                  }
                }
              } //SequenceLocation

              if (!geneinfo) {
                if (measure.MeasureRelationship) {
                  for (var i = 0; i < measure.MeasureRelationship.length; i++) {
                    if (measure.MeasureRelationship[i].Type == 'variant in gene') {
                      var geneId, geneSymbol;
                      for (var j = 0; j < measure.MeasureRelationship[i].XRef.length; j++) {
                        if (measure.MeasureRelationship[i].XRef[j].DB == 'Gene') {
                          geneId = measure.MeasureRelationship[i].XRef[j].ID;
                          break;
                        }
                      }
                      for (var j = 0; j < measure.MeasureRelationship[i].Symbol.length; j++) {
                        if (measure.MeasureRelationship[i].Symbol[j].ElementValue.Type == 'Preferred') {
                          geneSymbol = measure.MeasureRelationship[i].Symbol[j].ElementValue.text;
                          break;
                        }
                      }
                      if (geneId && geneSymbol)
                        geneinfo = geneId + ':' + geneSymbol;
                      break;
                    }
                  }
                } //MeasureRelationship
              } //geneinfo

              if (measure.AttributeSet) {
                for (var i = 0; i < measure.AttributeSet.length; i++) {
                  switch (measure.AttributeSet[i].Attribute.Type) {
                    case 'Suspect':
                      switch (measure.AttributeSet[i].Attribute.text) {
                        case 'Paralog':
                          ssr |= 1;
                          break;
                        case '1KG failed':
                          ssr |= 16;
                          break;
                      }
                      break;
                    case 'MolecularConsequence':
                      switch (measure.AttributeSet[i].Attribute.text) {
                        case 'frameshift variant':
                          nsf = true;
                          break;
                        case 'missense variant':
                          nsm = true;
                          break;
                        case 'nonsense':
                          nsn = true;
                          break;
                        case 'synonymous variant':
                          syn = true;
                          break;
                        case '3 prime UTR variant':
                          u3 = true;
                          break;
                        case '5 prime UTR variant':
                          u5 = true;
                          break;
                        case 'splice acceptor variant':
                          ass = true;
                          break;
                        case 'splice donor variant':
                          dss = true;
                          break;
                        case 'intron variant':
                          int = true;
                          break;
                      }
                      break;
                  }
                }
              } //AttributeSet
            });

            var infos = [];
                                       infos.push('RS=' + doc._id);
            if (pos != '.')            infos.push('RSPOS=' + pos);
            if (geneinfo)              infos.push('GENEINFO=' + geneinfo);
                                       infos.push('SAO=' + sao);
                                       infos.push('SSR=' + ssr);
            if (allWgt.length)         infos.push('WGT=' + allWgt.join('|'));
            if (nsf)                   infos.push('NSF');
            if (nsm)                   infos.push('NSM');
            if (nsn)                   infos.push('NSN');
            if (syn)                   infos.push('SYN');
            if (u3)                    infos.push('U3');
            if (u5)                    infos.push('U5');
            if (ass)                   infos.push('ASS');
            if (dss)                   infos.push('DSS');
            if (int)                   infos.push('INT');
            if (cfl)                   infos.push('CFL');
            if (om)                    infos.push('OM');
            if (clnhgvs)               infos.push('CLNHGVS=' + clnhgvs);
                                       infos.push('CLNORIGIN=' + clnorigin);
            if (allClnsig.length)      infos.push('CLNSIG=' + allClnsig.join('|'));
            if (allClndbn.length)      infos.push('CLNDBN=' + allClndbn.join('|'));
            if (allClnrevstat.length)  infos.push('CLNREVSTAT=' + allClnrevstat.join('|'));
            if (allClnacc.length)      infos.push('CLNACC=' + allClnacc.join('|'));

            output += chr + '\t' + pos + '\trs' + doc._id + '\t' + ref + '\t' + alt + '\t.\t.\t' + infos.join(';') + '\n';
          });
          res.set('Content-Type', 'text/plain');
          res.send(output);
        });
        break;
      case 'json-ld':
        cursor.aggregate(pipeline).toArray(function(err, docs) {
          if (err) {
            res.status(400); //bad request
            res.send(err.toString());
            return;
          }

          docs = limit(docs, true, req.query.strip);

          var ld = [];
          var referenceSequences = [];

          docs.forEach(function(doc) {
            var id = req.protocol + '://' + req.headers.host + '/find?q={"ID":' + doc.ID + '}';
            var simpleAlleles = []; //an array of arrays, grouped first by allele and second by reference sequence
            var alleleIndex = 0;
            doc.ReferenceClinVarAssertion.MeasureSet.Measure.forEach(function(measure) {
              simpleAlleles.push([]);
              var changeTypeTable = {
                'Insertion':                 'insertion',
                'Deletion':                  'deletion',
                'single nucleotide variant': 'substitution',
                //'Duplication':               '',
                'Indel':                     'indel',
                //'Variation':                 '',
                'copy number gain':          'copy_number_variation',
                'copy number loss':          'copy_number_variation',
              };
              if (measure.SequenceLocation) {
                for (var i = 0; i < measure.SequenceLocation.length; i++) {
                  var referenceSequence = {
                    '@context': 'https://raw.githubusercontent.com/clingen-data-model/clingen-data-model/master/source/main/resources/example-jsonld/ReferenceSequence.jsonld',
                    '@id': 'http://www.ncbi.nlm.nih.gov/nuccore/' + measure.SequenceLocation[i].Accession,
                    '@type': 'ReferenceSequence',
                    chromosome: measure.SequenceLocation[i].Chr,
                    identifier: measure.SequenceLocation[i].Accession,
                    referenceSequenceType: 'chromosome',
                  };
                  var simpleAllele = {
                    '@context': 'https://raw.githubusercontent.com/clingen-data-model/clingen-data-model/master/source/main/resources/example-jsonld/SimpleAllele.jsonld',
                    '@id': id + '&ldmeta=simpleAllele' + (alleleIndex++),
                    '@type': 'SimpleAllele',
                    allele: undefined,
                    canonicalAllele: undefined,
                    primaryNucleotideChangeType: changeTypeTable[measure.Type],
                    referenceCoordinate: {
                      start: measure.SequenceLocation[i].start - 1,
                      end: measure.SequenceLocation[i].stop - 1,
                      ref: measure.SequenceLocation[i].referenceAllele,
                      referenceSequence: referenceSequence['@id'],
                    },
                    simpleAlleleType: 'nucleotide',
                  };
                  if (measure.SequenceLocation[i].alternateAllele) {
                    simpleAllele.allele = measure.SequenceLocation[i].alternateAllele.replace('-', '*');
                  }
                  var newReferenceSequence = true;
                  for (var j = 0; j < referenceSequences.length; j++) {
                    if (referenceSequences[j]['@id'] == referenceSequence['@id']) {
                      newReferenceSequence = false;
                      break;
                    }
                  }
                  if (newReferenceSequence) {
                    referenceSequences.push(referenceSequence);
                  }
                  simpleAlleles[simpleAlleles.length - 1].push(simpleAllele);
                }
              } else {
                var simpleAllele = {
                  '@context': 'https://raw.githubusercontent.com/clingen-data-model/clingen-data-model/master/source/main/resources/example-jsonld/SimpleAllele.jsonld',
                  '@id': id + '&ldmeta=simpleAllele' + (alleleIndex++),
                  '@type': 'SimpleAllele',
                  canonicalAllele: undefined,
                  primaryNucleotideChangeType: changeTypeTable[measure.Type],
                  simpleAlleleType: 'nucleotide',
                };
                simpleAlleles[simpleAlleles.length - 1].push(simpleAllele);
              }
            });

            doc.ClinVarAssertion.forEach(function(scv) {
              var canonicalAlleles = [];
              for (var i = 0; i < simpleAlleles.length; i++) {
                canonicalAlleles.push({
                  '@context': 'https://raw.githubusercontent.com/clingen-data-model/clingen-data-model/master/source/main/resources/example-jsonld/CanonicalAllele.jsonld',
                  '@id': undefined,
                  '@type': 'CanonicalAllele',
                  active: true,
                  complexity: 'simple',
                  id: undefined,
                  identifier: simpleAlleles[i].identifier,
                  version: undefined,
                });
              }

              if (canonicalAlleles.length == 1) {
                canonicalAlleles[0]['@id'] = id;
                canonicalAlleles[0].id = scv.ClinVarAccession.Acc;
                canonicalAlleles[0].version = scv.ClinVarAccession.Version;
                for (var i = 0; i < simpleAlleles[0].length; i++) {
                  simpleAlleles[0][i].canonicalAllele = id;
                }
              } else {
                var nestedIds = [];
                for (var i = 0; i < canonicalAlleles.length; i++) {
                  canonicalAlleles[i]['@id'] = id + '&ldmeta=canonicalAllele' + i;
                  canonicalAlleles[i].composite = id;
                  canonicalAlleles[i].relatedSimpleAllele = simpleAlleles[i].map(function(simpleAllele) {
                    return simpleAllele['@id'];
                  });
                  for (var j = 0; j < simpleAlleles[i].length; j++) {
                    simpleAlleles[i][j].canonicalAllele = canonicalAlleles[i]['@id'];
                  }
                  nestedIds.push(canonicalAlleles[i]['@id']);
                }
                ld.push({
                  '@context': 'https://raw.githubusercontent.com/clingen-data-model/clingen-data-model/master/source/main/resources/example-jsonld/CanonicalAllele.jsonld',
                  '@id': id,
                  '@type': 'CanonicalAllele',
                  active: true,
                  complexity: 'complex',
                  id: scv.ClinVarAccession.Acc,
                  nested: nestedIds,
                  version: scv.ClinVarAccession.Version,
                });
              }
              ld.push.apply(ld, canonicalAlleles);

              simpleAlleles.forEach(function(simpleAlleles) {
                ld.push.apply(ld, simpleAlleles);
              });

              ld.push({
                '@type': 'Provenance',
                recorded: scv.ClinVarSubmissionID.submitterDate,
                target: [id],
              });
            });
          });

          ld.push.apply(ld, referenceSequences);

          res.json(ld);
        });
        break;
      default:
        pipeline.push({$skip: Number(req.query.start) || 0});
        cursor.aggregate(pipeline).toArray(function(err, docs) {
          if (err) {
            res.status(400); //bad request
            res.send(err.toString());
            return;
          }

          docs = limit(docs, true, req.query.strip);

          res.json(docs);
        });
    }
  });
});

app.use(express.static(__dirname + '/assets'));
app.use('/dist', express.static(__dirname + '/dist'));

var server = app.listen(3000, function() {
  console.log('Listening on port %d', server.address().port);
});
