const fs = require('fs');
const { ethers } = require('hardhat');
const { deployContracts, contractsFrontendReady } = require('./deploymentStages');
const HARDHAT_DEFAULT_CHAIN = 31337;
const HARDHAT_DEFAULT_URL = 'http://127.0.0.1:8545/';

async function main() {
  const contractAddresses = await deployContracts();
  let accountAddresses = (await ethers.getSigners()).map(account => account.address);
  await contractsFrontendReady(accountAddresses);
  const [contractOwner] = accountAddresses;
  const chainId = HARDHAT_DEFAULT_CHAIN;
  const serverURL = HARDHAT_DEFAULT_URL;

  const artifact = { contractAddresses, contractOwner, chainId, serverURL };
  const json = JSON.stringify(artifact);
  fs.writeFileSync('scripts/frontendDeploymentArtifact.json', json);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });