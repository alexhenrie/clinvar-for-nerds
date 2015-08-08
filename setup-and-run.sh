#!/bin/sh

git fetch origin
git reset --hard origin
webpack
./setup.sh
./index.js
