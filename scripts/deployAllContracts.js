const { network, ethers } = require('hardhat');
const https = require('https');
const fs = require('fs');
const { CHAINLINK_DEC, DEFAULT_CHAINLINK_ETH_USD_PRICE, DEFAULT_CHAINLINK_EUR_USD_PRICE, getLibraryFactory } = require('../test/common');

const INITIAL_PRICE = ethers.utils.parseEther('0.8');
const MAX_SUPPLY = ethers.utils.parseEther((85_000_000).toString());
const BUCKET_SIZE = ethers.utils.parseEther((100_000).toString());

let owner;

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

const mockChainlink = async _ => {
  const EthUsd = await (await ethers.getContractFactory('Chainlink')).deploy(DEFAULT_CHAINLINK_ETH_USD_PRICE);
  await EthUsd.deployed();
  const EurUsd = await (await ethers.getContractFactory('Chainlink')).deploy(DEFAULT_CHAINLINK_EUR_USD_PRICE);
  await EurUsd.deployed();
  return { ethUsd: EthUsd.address, eurUsd: EurUsd.address };
}

const deployStage1Contracts = async addresses => {
  const curve = await (await getLibraryFactory(owner, 'BondingCurve')).deploy(
    INITIAL_PRICE, MAX_SUPPLY, BUCKET_SIZE
  );
  await curve.deployed();
  const calculator = await (await getLibraryFactory(owner, 'SEuroCalculator')).deploy(
    curve.address, addresses.EXTERNAL_ADDRESSES.chainlink.eurUsd, CHAINLINK_DEC
  );
  await calculator.deployed();
  const manager = await (await ethers.getContractFactory('TokenManager')).deploy(
    addresses.EXTERNAL_ADDRESSES.weth, addresses.EXTERNAL_ADDRESSES.chainlink.ethUsd, CHAINLINK_DEC
  );
  await manager.deployed();
  const offering = await (await ethers.getContractFactory('SEuroOffering')).deploy(
    addresses.TOKEN_ADDRESSES.SEURO, calculator.address, manager.address, curve.address
  );
  await offering.deployed();

  return {
    BondingCurve: curve,
    SEuroCalculator: calculator,
    TokenManager: manager,
    SEuroOffering: offering
  }
}

const prepareStage1 = async addresses => {
  const Seuro = await ethers.getContractAt('AccessControl', addresses.TOKEN_ADDRESSES.SEURO);
  if (!await Seuro.hasRole(await Seuro.getRoleAdmin(ethers.utils.formatBytes32String('MINTER_ROLE')), owner.address)) {
    throw new Error('Signer must have sEURO admin role');
  }

  const { BondingCurve, SEuroCalculator, TokenManager, SEuroOffering } = await deployStage1Contracts(addresses);
  // give offering minter role for sEURO
  const minter = await Seuro.grantRole(ethers.utils.formatBytes32String('MINTER_ROLE'), SEuroOffering.address);
  await minter.wait();
  // give offering OFFERING role in calculator
  const offering = await SEuroCalculator.grantRole(await SEuroCalculator.OFFERING(), SEuroOffering.address);
  await offering.wait();
  // give offering UPDATER role in curve
  const updater = await BondingCurve.grantRole(await BondingCurve.UPDATER(), SEuroOffering.address);
  await updater.wait();
  // give calculator CALCULATOR role in curve
  const calculator = await BondingCurve.grantRole(await BondingCurve.CALCULATOR(), SEuroCalculator.address);
  await calculator.wait();
  // activate offering
  const activate = await SEuroOffering.activate();
  await activate.wait();
  return {
    BondingCurve: BondingCurve.address,
    SEuroCalculator: SEuroCalculator.address,
    TokenManager: TokenManager.address,
    SEuroOffering: SEuroOffering.address
  }
}

const getAddresses = async _ => {
  const addresses = await getDeployedAddresses(network.name);
  const externalAddresses = JSON.parse(fs.readFileSync('scripts/deploymentConfig.json'))[network.name].externalAddresses;
  if (!externalAddresses.chainlink) externalAddresses.chainlink = await mockChainlink();
  addresses.EXTERNAL_ADDRESSES = externalAddresses;
  return addresses;
}

const main = async _ => {
  [ owner ] = await ethers.getSigners();
  const addresses = await getAddresses();
  const stage1Addresses = await prepareStage1(addresses);
  console.log({ ...stage1Addresses });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });