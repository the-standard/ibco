const https = require('https');

const getDeployedAddresses = async network => {
  const url = 'https://raw.githubusercontent.com/the-standard/ibco-addresses/main/addresses.json';

  return new Promise(resolve => {
    https.get(url, res => {
      let json = '';
  
      res.on('data', data => {
        json += data;
      });

      res.on('end', _ => {
        resolve(JSON.parse(json)[network]);
      });
    });
  });
}

module.exports = {
  getDeployedAddresses
}