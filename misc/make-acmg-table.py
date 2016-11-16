#!/usr/bin/python3

from pymongo import MongoClient

client = MongoClient()
db = client.clinvar_nerds

#http://www.ncbi.nlm.nih.gov/clinvar/docs/acmg/
acmg_genes = [
    'APC',
    'MYH11',
    'ACTA2',
    'MYLK',
    'TMEM43',
    'DSP',
    'PKP2',
    'DSG2',
    'DSC2',
    'BRCA1',
    'BRCA2',
    'SCN5A',
    'RYR2',
    'LMNA',
    'MYBPC3',
    'COL3A1',
    'GLA',
    'APOB',
    'LDLR',
    'MYH7',
    'TPM1',
    'PRKAG2',
    'TNNI3',
    'MYL3',
    'MYL2',
    'ACTC1',
    'RET',
    'PCSK9',
    'TNNT2',
    'TP53',
    'TGFBR1',
    'TGFBR2',
    'SMAD3',
    'KCNQ1',
    'KCNH2',
    'MLH1',
    'MSH2',
    'MSH6',
    'PMS2',
    'RYR1',
    'CACNA1S',
    'FBN1',
    'MEN1',
    'MUTYH',
    'NF2',
    'SDHD',
    'SDHAF2',
    'SDHC',
    'SDHB',
    'STK11',
    'PTEN',
    'RB1',
    'TSC1',
    'TSC2',
    'VHL',
    'WT1'
]

print('accession,gene,hgvs,condition,lab')

for gene in acmg_genes:
    for record in db.clinvarsets.find({'ReferenceClinVarAssertion.MeasureSet.Measure.MeasureRelationship.Symbol.ElementValue.text': gene}):
        for name in record['ReferenceClinVarAssertion']['MeasureSet']['Name']:
            if name['ElementValue']['Type'] == 'Preferred':
                hgvs = name['ElementValue']['text']
                break

        for scv in record['ClinVarAssertion']:
            for trait in scv['TraitSet']['Trait']:
                if trait['Type'] == 'Disease':
                    for name in trait['Name']:
                        if name['ElementValue']['Type'] == 'Preferred':
                            condition = name['ElementValue']['text']
                            break
                    break

            accession = scv['ClinVarAccession']['Acc']
            lab = scv['ClinVarSubmissionID']['submitter']

            print('"' + accession + '","' + gene + '","' + hgvs + '","' + condition + '","' + lab + '"')
