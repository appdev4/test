/**
 * For development you can set the variables by creating a .env file on the root
 */
var fs = require('fs');
var production = process.env.NODE_ENV === 'production';

var prodConfig;
//if(production) {
  //prodConfig = JSON.parse(fs.readFileSync(__dirname + '/build-config.json'));
  //console.log('Build config loaded: ', prodConfig);
//}

module.exports = {
  "PRODUCTION": production,
  "DATABASE_URL": process.env.DATABASE_URL || "",
  "BIP32_DERIVED": process.env.BIP32_DERIVED_KEY || "",
  "BUILD": prodConfig,
  "MINING_FEE": process.env.MINING_FEE || 10000,
  "BITCOIND_HOST": process.env.BITCOIND_HOST || '127.0.0.1',
  "BITCOIND_PORT": process.env.BITCOIND_PORT || 8332,
  "BITCOIND_USER": process.env.BITCOIND_USER || '',
  "BITCOIND_PASS": process.env.BITCOIND_PASS || '',
  "BITCOIND_CERT": process.env.BITCOIND_CERT  || "",
  "AWS_SES_KEY": process.env.AWS_SES_KEY || "",
  "AWS_SES_SECRET": process.env.AWS_SES_SECRET || "",
};