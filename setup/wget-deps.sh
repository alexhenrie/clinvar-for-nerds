#!/bin/sh

wget ftp://ftp.ncbi.nlm.nih.gov/pub/clinvar/xml/ClinVarFullRelease_00-latest.xml.gz -O - | gunzip > ClinVarFullRelease_00-latest.xml
wget ftp://ftp.ncbi.nlm.nih.gov/pub/clinvar/xsd_public/clinvar_public.xsd -O clinvar_public.xsd
