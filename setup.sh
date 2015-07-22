#!/bin/sh

./setup/wget-deps.sh
./setup/generate-schema.js
./setup/import-database.js
./setup/generate-examples.js
./setup/create-indexes.js
