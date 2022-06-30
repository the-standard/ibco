const fs = require('fs');
const { ethers } = require('hardhat');
const { deployContracts, contractsFrontendReady } = require('./deploymentStages');
const HARDHAT_DEFAULT_CHAIN = 31337;

async function main() {
  const contractAddresses = await deployContracts();
  await contractsFrontendReady();
  const [owner] = await ethers.getSigners();
  const chainId = HARDHAT_DEFAULT_CHAIN;

  const artifact = { contractAddresses, contractOwner: owner.address, chainId };
  const json = JSON.stringify(artifact);
  fs.writeFileSync('scripts/deploymentArtifact.json', json);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });