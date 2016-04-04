#!/bin/sh
node --max_old_space_size=16384 `dirname $0`/23andme.js "$@"
