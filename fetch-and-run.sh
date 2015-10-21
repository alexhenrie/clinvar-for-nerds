#!/bin/sh

git fetch origin
git reset --hard origin
./setup/npm-install.sh
./run.sh
