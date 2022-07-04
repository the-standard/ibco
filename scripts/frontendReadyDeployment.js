const fs = require('fs');
const { ethers } = require('hardhat');
const { deployContracts, contractsFrontendReady } = require('./deploymentStages');
const HARDHAT_DEFAULT_CHAIN = 31337;
const HARDHAT_DEFAULT_URL = 'http://127.0.0.1:8545/';

async function main() {
  const contractAddresses = await deployContracts();
  let selectedAccounts = (await ethers.getSigners()).slice(0,10).map(account => account.address);
  await contractsFrontendReady(selectedAccounts);
  const [contractOwner] = selectedAccounts;
  const chainId = HARDHAT_DEFAULT_CHAIN;
  const serverURL = HARDHAT_DEFAULT_URL;

  const artifact = { contractAddresses, contractOwner, chainId, serverURL, selectedAccounts };
  const json = JSON.stringify(artifact);
  fs.writeFileSync('scripts/deploymentArtifact.json', json);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });