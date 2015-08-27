#!/bin/sh

git fetch origin
git reset --hard origin
./setup.sh
./run.sh
