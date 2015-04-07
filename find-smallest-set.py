#!/usr/bin/python3
#Script to find the smallest ClinVarSet for interest or example purposes

import re

file = open('ClinVarFullRelease_00-latest.xml', 'r')
contents = file.read();
file.close();
matches = re.findall('<ClinVarSet.*?</ClinVarSet>', contents, re.DOTALL)
print('Found ' + str(len(matches)) + ' sets.')

smallestSet = ''
smallestSetLines = 10000
for match in matches:
  lines = match.count('\n')
  if lines < smallestSetLines:
    smallestSet = match
    smallestSetLines = lines

print('The smallest set has ' + str(smallestSetLines + 1) + ' lines.')
print(smallestSet)
