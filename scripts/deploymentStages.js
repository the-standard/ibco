const { ethers, network } = require('hardhat');
const fs = require('fs');
const { encodePriceSqrt, MOST_STABLE_FEE, etherBalances } = require('../test/common');
let addresses;
let DummyTST, DummyUSDT, SEuro, SEuroOffering, OperatorStage2, BondStorage, BondingEvent, StandardTokenGateway, BondingCurve, SEuroCalculator, Staking;

const INITIAL_PRICE = ethers.utils.parseEther('0.8');
const MAX_SUPPLY = ethers.utils.parseEther('200000000');
const BUCKET_SIZE = ethers.utils.parseEther('100000');

const completed = async (contract, name) => {
  console.log(`${name} deploying ...`)
  await contract.deployed();
  console.log(`${name} deployed at ${contract.address}`)
}

const getPricing = () => {
  return SEuro.address.toLowerCase() < DummyUSDT.address.toLowerCase() ?
    {
      initial: encodePriceSqrt(114, 100),
      lowerTick: -400,
      upperTick: 3000
    } :
    {
      initial: encodePriceSqrt(100, 114),
      lowerTick: -3000,
      upperTick: 400,
    }
}

const deployContracts = async () => {  
  const { externalContracts } = JSON.parse(fs.readFileSync('scripts/deploymentConfig.json'))[network.name];

  DummyTST = await (await ethers.getContractFactory('DUMMY')).deploy('Standard Token', 'TST', 0);
  await completed(DummyTST, 'TST');
  DummyUSDT = await (await ethers.getContractFactory('DUMMY')).deploy('Tether', 'USDT', 0);
  await completed(DummyUSDT, 'USDT');
  SEuro = await (await ethers.getContractFactory('SEuro')).deploy('sEURO', 'SEUR', []);
  await completed(SEuro, 'SEuro');
  BondingCurve = await (await ethers.getContractFactory('BondingCurve')).deploy(INITIAL_PRICE, MAX_SUPPLY, BUCKET_SIZE);
  await completed(BondingCurve, 'BondingCurve')
  SEuroCalculator = await (await ethers.getContractFactory('SEuroCalculator')).deploy(BondingCurve.address, externalContracts.eurUsdCl.address, externalContracts.eurUsdCl.dec);
  await completed(SEuroCalculator, 'SEuroCalculator')
  const TokenManager = await (await ethers.getContractFactory('TokenManager')).deploy(externalContracts.weth, externalContracts.ethUsdCl.address, externalContracts.ethUsdCl.dec);
  await completed(TokenManager, 'TokenManager')
  SEuroOffering = await (await ethers.getContractFactory('SEuroOffering')).deploy(
    SEuro.address, SEuroCalculator.address, TokenManager.address, BondingCurve.address
  );
  await completed(SEuroOffering, 'SEuroOffering')
  StandardTokenGateway = await (await ethers.getContractFactory('StandardTokenGateway')).deploy(DummyTST.address, SEuro.address);
  await completed(StandardTokenGateway, 'StandardTokenGateway')
  BondStorage = await (await ethers.getContractFactory('BondStorage')).deploy(StandardTokenGateway.address);
  await completed(BondStorage, 'BondStorage')
  const RatioCalculator = await (await ethers.getContractFactory('RatioCalculator')).deploy();
  await completed(RatioCalculator, 'RatioCalculator')
  const pricing = getPricing();
  OperatorStage2 = await (await ethers.getContractFactory('OperatorStage2')).deploy();
  BondingEvent = await (await ethers.getContractFactory('BondingEvent')).deploy(
    SEuro.address, DummyUSDT.address, externalContracts.uniswapLiquidityManager, BondStorage.address, OperatorStage2.address,
    RatioCalculator.address, pricing.initial, pricing.lowerTick, pricing.upperTick, MOST_STABLE_FEE
  );
  await completed(BondingEvent, 'BondingEvent')

  let timeNow = Math.floor(Date.now() / 1000);
  let oneWeek = 60 * 60 * 24 * 7;
  let seuroPerTst = 0.8 / 0.05;
  let fivePc = 5000;
  Staking = await (await ethers.getContractFactory('Staking')).deploy(
	'TST Staking', 'TST-S', timeNow, timeNow + oneWeek, DummyTST.address, SEuro.address, seuroPerTst, fivePc
  );
  await completed(Staking, 'Staking');

  addresses = {
    TST: DummyTST.address,
    USDT: DummyUSDT.address,
    SEuro: SEuro.address,
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

  return addresses
}

const activateSEuroOffering = async () => {
  const [owner] = await ethers.getSigners();
  const SEuroOffering = await ethers.getContractAt('SEuroOffering', addresses.SEuroOffering);
  await SEuroOffering.connect(owner).activate();
}

const activateStaking = async() => {
  const [owner] = await ethers.getSigners();
  const Staking = await ethers.getContractAt('Staking', addresses.Staking);
  await Staking.connect(owner).activate();
}

const mintUser = async (address) => {
  await SEuro.mint(address, etherBalances.HUNDRED_MILLION);
  await DummyUSDT.mint(address, etherBalances.HUNDRED_MILLION);
  await DummyTST.mint(address, etherBalances.HUNDRED_MILLION);
}

const giveContractsRequiredPermissions = async () => {
  await SEuro.grantRole(await SEuro.MINTER_ROLE(), SEuroOffering.address);
  await SEuroCalculator.grantRole(await SEuroCalculator.OFFERING(), SEuroOffering.address);
  await BondingCurve.grantRole(await BondingCurve.UPDATER(), SEuroOffering.address);
  await BondingCurve.grantRole(await BondingCurve.CALCULATOR(), SEuroCalculator.address);
  await OperatorStage2.setStorage(BondStorage.address);
  await OperatorStage2.setBonding(BondingEvent.address);
  await OperatorStage2.setGateway(StandardTokenGateway.address);
  await StandardTokenGateway.setStorageAddress(BondStorage.address);
  await DummyTST.mint(StandardTokenGateway.address, etherBalances.HUNDRED_MILLION);
}

const mintTokensForAccount = async (accounts) => {
  const mints = accounts.map(async account => {
    await mintUser(account);
  })
  await Promise.all(mints);
}

const contractsFrontendReady = async (accounts) => {
  await activateSEuroOffering();
  await activateStaking();
  await giveContractsRequiredPermissions();
  await mintTokensForAccount(accounts);
}

module.exports = {
  deployContracts,
  contractsFrontendReady,
  mintUser
}
