const fs = require('fs');
const { ethers } = require('hardhat');
const { etherBalances } = require('../test/common');

async function main() {
  const addresses = JSON.parse(fs.readFileSync('scripts/testnetDeploymentArtifact.json')).contractAddresses

  const SEuroOffering = await ethers.getContractAt('SEuroOffering', addresses.SEuroOffering);
  const BondingCurve = await ethers.getContractAt('BondingCurve', addresses.BondingCurve);
  const SEuroCalculator = await ethers.getContractAt('SEuroCalculator', addresses.SEuroCalculator);
  const USDT = await ethers.getContractAt('DUMMY', addresses.USDT);
  const TokenManager = await ethers.getContractAt('TokenManager', addresses.TokenManager);
  const SEuro = await ethers.getContractAt('SEuro', addresses.SEuro);
  const OperatorStage2 = await ethers.getContractAt('OperatorStage2', addresses.OperatorStage2);
  const BondStorage = await ethers.getContractAt('BondStorage', addresses.BondStorage);
  const BondingEvent = await ethers.getContractAt('BondingEvent', addresses.BondingEvent);
  const StandardTokenGateway = await ethers.getContractAt('StandardTokenGateway', addresses.StandardTokenGateway);
  const TST = await ethers.getContractAt('DUMMY', addresses.TST);

  await SEuroOffering.activate();
  await SEuro.grantRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MINTER_ROLE')), SEuroOffering.address);
  await BondingCurve.grantRole(await BondingCurve.UPDATER(), SEuroOffering.address);
  await BondingCurve.grantRole(await BondingCurve.CALCULATOR(), SEuroCalculator.address);
  await TokenManager.addAcceptedToken(ethers.utils.formatBytes32String("USDT"), USDT.address, '0x2bA49Aaa16E6afD2a993473cfB70Fa8559B523cF', 8);
  await OperatorStage2.setStorage(BondStorage.address);
  await OperatorStage2.setBonding(BondingEvent.address);
  await OperatorStage2.setGateway(StandardTokenGateway.address);
  await StandardTokenGateway.setStorageAddress(BondStorage.address);
  await TST.mint(StandardTokenGateway.address, etherBalances.HUNDRED_MILLION);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });