const { ethers, network } = require('hardhat');
const fs = require('fs');
const { encodePriceSqrt, MOST_STABLE_FEE, etherBalances, scaleUpForDecDiff, parse6Dec, getLibraryFactory } = require('../test/common');
let addresses;
let DummyTST, DummyUSDC, SEuroAddress, SEuroOffering, OperatorStage2, BondStorage, BondingEvent, StandardTokenGateway, BondingCurve, SEuroCalculator, Staking;

const INITIAL_PRICE = ethers.utils.parseEther('0.8');
const MAX_SUPPLY = ethers.utils.parseEther('85000000');
const BUCKET_SIZE = ethers.utils.parseEther('100000');

const completed = async (contract, name) => {
  console.log(`${name} deploying ...`);
  await contract.deployed();
  console.log(`${name} deployed at ${contract.address}`);
};

const getPricing = () => {
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
  return SEuroAddress.toLowerCase() < DummyUSDC.address.toLowerCase() ?
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

const createChainlinkMocks = async () => {
  const dec = 8;
  // ~$1.02 per €
  let price = 102673000;
  const EurUsdChainlink = await (await ethers.getContractFactory('Chainlink')).deploy(price);
  // ~$1669 per eth
  price = 166944811357;
  const EthUsdChainlink = await (await ethers.getContractFactory('Chainlink')).deploy(price);

  return {
    eurUsd: {
      address: EurUsdChainlink.address,
      dec: dec
    },
    ethUsd: {
      address: EthUsdChainlink.address,
      dec: dec
    }
  };
};

const deployContracts = async () => {
  const [owner] = await ethers.getSigners();
  const { externalAddresses } = JSON.parse(fs.readFileSync('scripts/deploymentConfig.json'))[network.name];
  SEuroAddress = externalAddresses.seuro;

  DummyTST = await (await ethers.getContractFactory('DUMMY')).deploy('Standard Token', 'TST', 18);
  await completed(DummyTST, 'TST');
  DummyUSDC = await (await ethers.getContractFactory('DUMMY')).deploy('USD Coin', 'USDC', 6);
  await completed(DummyUSDC, 'USDC');
  BondingCurve = await (await getLibraryFactory(owner, 'BondingCurve')).deploy(INITIAL_PRICE, MAX_SUPPLY, BUCKET_SIZE);
  await completed(BondingCurve, 'BondingCurve');
  const chainlink = !!externalAddresses.chainlink ?
    externalAddresses.chainlink :
    await createChainlinkMocks();
  SEuroCalculator = await (await getLibraryFactory(owner, 'SEuroCalculator')).deploy(
    BondingCurve.address, chainlink.eurUsd.address, chainlink.eurUsd.dec
  );
  await completed(SEuroCalculator, 'SEuroCalculator');
  const TokenManager = await (await ethers.getContractFactory('TokenManager')).deploy(
    externalAddresses.weth, chainlink.ethUsd.address, chainlink.ethUsd.dec
  );
  await completed(TokenManager, 'TokenManager');
  SEuroOffering = await (await ethers.getContractFactory('SEuroOffering')).deploy(
    SEuroAddress, SEuroCalculator.address, TokenManager.address, BondingCurve.address
  );
  await completed(SEuroOffering, 'SEuroOffering');
  StandardTokenGateway = await (await ethers.getContractFactory('StandardTokenGateway')).deploy(DummyTST.address);
  await completed(StandardTokenGateway, 'StandardTokenGateway');
  BondStorage = await (await getLibraryFactory(owner, 'BondStorage')).deploy(
    StandardTokenGateway.address, chainlink.eurUsd.address, 20
  );
  await completed(BondStorage, 'BondStorage');
  const RatioCalculator = await (await ethers.getContractFactory('RatioCalculator')).deploy();
  await completed(RatioCalculator, 'RatioCalculator');
  const pricing = getPricing();
  OperatorStage2 = await (await ethers.getContractFactory('OperatorStage2')).deploy();
  BondingEvent = await (await ethers.getContractFactory('BondingEvent')).deploy(
    SEuroAddress, DummyUSDC.address, externalAddresses.uniswapLiquidityManager, BondStorage.address, OperatorStage2.address,
    RatioCalculator.address, pricing.initial, pricing.lowerTick, pricing.upperTick, MOST_STABLE_FEE
  );
  await completed(BondingEvent, 'BondingEvent');

  let oneWeek = 60 * 60 * 24 * 7;
  let seuroPerTst = 5000;
  let fivePc = 5000;
  let maturity = 5000;
  const currentBlockTS = (await ethers.provider.getBlock()).timestamp;
  Staking = await (await getLibraryFactory(owner, 'Staking')).deploy(
    'TST Staking', 'TST-S', currentBlockTS, currentBlockTS + oneWeek, maturity, DummyTST.address, SEuroAddress, seuroPerTst, fivePc
  );
  await completed(Staking, 'Staking');

  addresses = {
    TST: DummyTST.address,
    USDC: DummyUSDC.address,
    SEuro: SEuroAddress,
    SEuroOffering: SEuroOffering.address,
    SEuroCalculator: SEuroCalculator.address,
    TokenManager: TokenManager.address,
    BondingCurve: BondingCurve.address,
    BondingEvent: BondingEvent.address,
    BondStorage: BondStorage.address,
    StandardTokenGateway: StandardTokenGateway.address,
    OperatorStage2: OperatorStage2.address,
    Staking: Staking.address
  };

  return addresses;
};

const activateSEuroOffering = async () => {
  const [owner] = await ethers.getSigners();
  const SEuroOffering = await ethers.getContractAt('SEuroOffering', addresses.SEuroOffering);
  await SEuroOffering.connect(owner).activate();
};

const activateStaking = async () => {
  const [owner] = await ethers.getSigners();
  const Staking = await ethers.getContractAt('Staking', addresses.Staking);
  await Staking.connect(owner).activate();
};

const mintUser = async (address) => {
  await DummyUSDC.mint(address, parse6Dec(100_000_000));
  await DummyTST.mint(address, etherBalances.HUNDRED_MILLION);
};

const giveContractsRequiredPermissions = async () => {
  await SEuroCalculator.grantRole(await SEuroCalculator.OFFERING(), SEuroOffering.address);
  await BondingCurve.grantRole(await BondingCurve.UPDATER(), SEuroOffering.address);
  await BondingCurve.grantRole(await BondingCurve.CALCULATOR(), SEuroCalculator.address);
  await OperatorStage2.setBonding(BondingEvent.address);
  await StandardTokenGateway.setStorageAddress(BondStorage.address);
  await DummyTST.mint(StandardTokenGateway.address, etherBalances.HUNDRED_MILLION);
};

const mintTokensForAccount = async (accounts) => {
  const mints = accounts.map(async account => {
    await mintUser(account);
  });
  await Promise.all(mints);
};

const contractsFrontendReady = async (accounts) => {
  await activateSEuroOffering();
  await activateStaking();
  await giveContractsRequiredPermissions();
  await mintTokensForAccount(accounts);
};

module.exports = {
  deployContracts,
  contractsFrontendReady,
  mintUser
};
