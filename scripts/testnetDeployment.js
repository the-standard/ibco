const fs = require('fs');
const { ethers, network } = require('hardhat');
const { deployContracts, mintUser } = require('./deploymentStages');

const CHAINS = {rinkeby: 4}

async function main() {
  const contractAddresses = await deployContracts();
  const [contractOwner] = (await ethers.getSigners()).map(account => account.address);
  await mintUser(contractOwner);
  await mintUser('0x0b44dDFd921f5f9Ce94625F882b86C43C411a229');
  await mintUser('0xCFB7b743e8D8aA2301A6641E7C241928f0F6b978');
  await mintUser('0x562a91Bc63D9a99121453696E2C3C941c5a82EA1');
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