const fs = require('fs');
const { ethers, network } = require('hardhat');
const { deployContracts, mintUsers } = require('./deploymentStages');

const CHAINS = {rinkeby: 4}

async function main() {
  const contractAddresses = await deployContracts();
  const [contractOwner] = (await ethers.getSigners()).map(account => account.address);
  await mintUsers([contractOwner, '0x562a91Bc63D9a99121453696E2C3C941c5a82EA1']);
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