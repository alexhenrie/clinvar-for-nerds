#!/bin/sh

./setup/npm-install.sh
./setup/wget-deps.sh
./setup/generate-schema.js
./setup/import-database.sh
./setup/generate-examples.js
./setup/create-indexes.js
