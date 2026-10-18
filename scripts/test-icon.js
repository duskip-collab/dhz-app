'use strict';
require('sharp');
console.log('sharp ok');
const pkg = require('../package.json');
console.log('next:', pkg.dependencies.next, 'react:', pkg.dependencies.react);