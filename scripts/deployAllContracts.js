const { network, ethers } = require('hardhat');
const fs = require('fs');
const { DEFAULT_CHAINLINK_ETH_USD_PRICE, DEFAULT_CHAINLINK_EUR_USD_PRICE, getLibraryFactory, MOST_STABLE_FEE, encodePriceSqrt, scaleUpForDecDiff } = require('../test/common');
const { getDeployedAddresses } = require('./common');

const INITIAL_PRICE = ethers.utils.parseEther('0.8');
const MAX_SUPPLY = ethers.utils.parseEther((85_000_000).toString());
const BUCKET_SIZE = ethers.utils.parseEther((100_000).toString());

let owner, TST_ADDRESS;

const getTstAddress = async addresses => {
  return network.name == 'goerli' ? addresses.TOKEN_ADDRESSES.FTST : addresses.TOKEN_ADDRESSES.TST;
}

const mockChainlink = async _ => {
  const EthUsd = await (await ethers.getContractFactory('ChainlinkMock')).deploy(DEFAULT_CHAINLINK_ETH_USD_PRICE);
  await EthUsd.deployed();
  const EurUsd = await (await ethers.getContractFactory('ChainlinkMock')).deploy(DEFAULT_CHAINLINK_EUR_USD_PRICE);
  await EurUsd.deployed();
  return { ethUsd: EthUsd.address, eurUsd: EurUsd.address };
}

const deployStage1Contracts = async addresses => {
  const curve = await (await getLibraryFactory(owner, 'BondingCurve')).deploy(
    INITIAL_PRICE, MAX_SUPPLY, BUCKET_SIZE
  );
  await curve.deployed();
  const calculator = await (await getLibraryFactory(owner, 'SEuroCalculator')).deploy(
    curve.address, addresses.EXTERNAL_ADDRESSES.chainlink.eurUsd
  );
  await calculator.deployed();
  const manager = await (await ethers.getContractFactory('TokenManager')).deploy(
    addresses.EXTERNAL_ADDRESSES.weth, addresses.EXTERNAL_ADDRESSES.chainlink.ethUsd
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

const calculatePricing = tokenAddresses => {
  // prices and ticks scaled up because USDC is 6 dec
  //
  // USDC / sEURO price of 1.23 reflects:
  // eur / usd 1.017 (17th aug);
  // seuro / euro 0.8 (ibco initial price).
  // 
  // 1.23 price is tick ~278394
  // tick 275300 approx. 1 USDC = 0.903 sEURO
  // tick 279000 approx. 1 USDC = 1.307 sEURO
  // -279000 and -275300 are the inverse of these prices
  return tokenAddresses.SEURO.toLowerCase() < tokenAddresses.FUSDT.toLowerCase() ?
    {
      initial: encodePriceSqrt(100, scaleUpForDecDiff(123, 12)),
      lowerTick: -279000,
      upperTick: -275300
    } :
    {
      initial: encodePriceSqrt(scaleUpForDecDiff(123, 12), 100),
      lowerTick: 275300,
      upperTick: 279000
    };
};

const deployStage2Contracts = async addresses => {
  const pricing = calculatePricing(addresses.TOKEN_ADDRESSES);
  const calculator = await (await ethers.getContractFactory('RatioCalculator')).deploy();
  await calculator.deployed();
  const gateway = await (await ethers.getContractFactory('StandardTokenGateway')).deploy(TST_ADDRESS);
  await gateway.deployed();
  const storage = await (await getLibraryFactory(owner, 'BondStorage')).deploy(
    gateway.address, addresses.EXTERNAL_ADDRESSES.chainlink.eurUsd,
    addresses.TOKEN_ADDRESSES.SEURO, addresses.TOKEN_ADDRESSES.FUSDT
  );
  await storage.deployed();
  const operator = await (await ethers.getContractFactory('OperatorStage2')).deploy();
  await operator.deployed();
  const event = await (await ethers.getContractFactory('BondingEvent')).deploy(
    addresses.TOKEN_ADDRESSES.SEURO, addresses.TOKEN_ADDRESSES.FUSDT,
    addresses.EXTERNAL_ADDRESSES.uniswapLiquidityManager, storage.address, operator.address,
    calculator.address, pricing.initial, pricing.lowerTick, pricing.upperTick, MOST_STABLE_FEE
  );
  await event.deployed();

  return {
    RatioCalculator: calculator,
    StandardTokenGateway: gateway,
    BondStorage: storage,
    BondingEvent: event,
    OperatorStage2: operator
  }
}

const prepareStage2 = async addresses => {
  const TSTOwnable = await ethers.getContractAt('Ownable', TST_ADDRESS);
  if (await TSTOwnable.owner() != owner.address) throw new Error('Signer must have TST minter role');

  const { RatioCalculator, StandardTokenGateway, BondStorage, BondingEvent, OperatorStage2 } = await deployStage2Contracts(addresses);
  // give bond storage access to update reward supply and transfer rewards
  const gatewayStorage = await StandardTokenGateway.setStorageAddress(BondStorage.address);
  await gatewayStorage.wait();
  // give bonding event access to create bonds in bond storage
  const storageEvent = await BondStorage.setBondingEvent(BondingEvent.address);
  await storageEvent.wait();
  // set bonding event dependency in operator
  const operatorEvent = await OperatorStage2.setBonding(BondingEvent.address);
  await operatorEvent.wait();
  // mint gateway with tst and update reward supply
  const TST = await ethers.getContractAt('MintableERC20', TST_ADDRESS)
  const mint = await TST.mint(StandardTokenGateway.address, ethers.utils.parseEther((1_000_000_000).toString()));
  await mint.wait();
  const updateSupply = await StandardTokenGateway.updateRewardSupply();
  await updateSupply.wait();
  return {
    RatioCalculator: RatioCalculator.address,
    StandardTokenGateway: StandardTokenGateway.address,
    BondStorage: BondStorage.address,
    BondingEvent: BondingEvent.address,
    OperatorStage2: OperatorStage2.address
  }
}

const getAddresses = async _ => {
  const addresses = await getDeployedAddresses(network.name);
  const externalAddresses = JSON.parse(fs.readFileSync('scripts/deploymentConfig.json'))[network.name].externalAddresses;
  if (!externalAddresses.chainlink) externalAddresses.chainlink = await mockChainlink();
  addresses.EXTERNAL_ADDRESSES = externalAddresses;
  return addresses;
}

const deployStakingDirectory = async _ => {
  const directory = await (await ethers.getContractFactory('StakingDirectory')).deploy();
  await directory.deployed();
  return directory.address;
}

const main = async _ => {
  [ owner ] = await ethers.getSigners();
  const addresses = await getAddresses();
  TST_ADDRESS = getTstAddress(addresses);
  const stage1Addresses = await prepareStage1(addresses);
  const stage2Addresses = await prepareStage2(addresses);
  const StakingDirectory = await deployStakingDirectory();
  console.log({ ...stage1Addresses, ...stage2Addresses, StakingDirectory });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });