const fs = require('fs');
const { ethers } = require('hardhat');
const { deployContracts } = require('./deploymentStages');

async function main() {
  const contractAddresses = await deployContracts();
  console.log(await ethers.getSigners());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });