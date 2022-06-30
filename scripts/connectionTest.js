const { ethers } = require('hardhat');
const fs = require('fs');
const addresses = JSON.parse(fs.readFileSync('deploymentAddresses.json'));

async function main() {
  const [ owner, user ] = await ethers.getSigners();
  const SEuroOffering = await ethers.getContractAt('SEuroOffering', addresses.SEuroOffering);
  const SEuro = await ethers.getContractAt('SEuro', addresses.SEuro);
  const BondingCurve = await ethers.getContractAt('BondingCurve', addresses.BondingCurve);
  await SEuroOffering.connect(owner).activate();
  console.log(await BondingCurve.currentBucket())
  console.log(await SEuro.balanceOf(user.address));
  await SEuroOffering.connect(user).swapETH({value: ethers.utils.parseEther('100')});
  console.log(await SEuro.balanceOf(user.address));
  console.log(await BondingCurve.currentBucket())
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });