const { network } = require('hardhat');
const https = require('https');

let addresses;

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

const main = async _ => {
  addresses = await getDeployedAddresses(network.name);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });