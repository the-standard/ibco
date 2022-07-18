const fs = require('fs');
const { ethers, network } = require('hardhat');
const { deployContracts, mintUser } = require('./deploymentStages');

const CHAINS = {rinkeby: 4}

async function main() {
  const contractAddresses = await deployContracts();
  const [contractOwner] = (await ethers.getSigners()).map(account => account.address);
  await mintUser(contractOwner);
  const chainId = CHAINS[network.name];
  const serverURL = network.config.url;

  const artifact = { contractAddresses, contractOwner, chainId, serverURL };
  fs.writeFileSync('scripts/testnetDeploymentArtifact.json', JSON.stringify(artifact));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });