const bn = require('bignumber.js');
const { ethers } = require('hardhat');
const { BigNumber } = ethers;

const POSITION_MANAGER_ADDRESS = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';

const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const USDT_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const SEURO_ADDRESS = '0x4A8D1B11A6F431b8eBa69E617282aF1849F63052';

const CHAINLINK_ETH_USD = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';
const CHAINLINK_DAI_USD = '0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9';
const CHAINLINK_USDT_USD = '0x3E7d1eAB13ad0104d2750B8863b489D65364e32D';
const CHAINLINK_EUR_USD = '0xb49f677943BC038e9857d61E7d053CaA2C1734C1';
const CHAINLINK_DEC = 8;
const CHAINLINK_SCALE = BigNumber.from(10).pow(CHAINLINK_DEC);
const DEFAULT_CHAINLINK_EUR_USD_PRICE = 105000000;
const DEFAULT_CHAINLINK_ETH_USD_PRICE = 175000000000;

// Only usable for tokens with 18 decimals such as TST and SEURO
const etherBalances = {
  '8K': ethers.utils.parseEther('8000'),
  '10K': ethers.utils.parseEther('10000'),
  '80K': ethers.utils.parseEther('80000'),
  '100K': ethers.utils.parseEther('100000'),
  '125K': ethers.utils.parseEther('125000'),
  ONE_MILLION: ethers.utils.parseEther('1000000'),
  TWO_MILLION: ethers.utils.parseEther('2000000'),
  FOUR_MILLION: ethers.utils.parseEther('4000000'),
  FIFTY_MILLION: ethers.utils.parseEther('50000000'),
  HUNDRED_MILLION: ethers.utils.parseEther('100000000'),
  FIVE_HUNDRED_MILLION: ethers.utils.parseEther('500000000'),
  ONE_BILLION: ethers.utils.parseEther('1000000000'),
};

const MOST_STABLE_FEE = 500;
const STABLE_TICK_SPACING = 10;
const MIN_TICK = -887270;
const MAX_TICK = 887270;
const DEFAULT_SQRT_PRICE = BigNumber.from(2).pow(96);
const ONE_WEEK_IN_SECONDS = 7 * 24 * 60 * 60;
const DECIMALS_18 = BigNumber.from(10).pow(18);
const DECIMALS_6 = BigNumber.from(10).pow(6);

const rates = {
  HALF_PC: 500,
  FIVE_PC: 5000,
  SIX_PC: 6000,
  SEVEN_PC: 7000,
  TEN_PC: 10000,
  TWENTY_PC: 20000,
};

const week = 60 * 60 * 24 * 7

const durations = {
  ONE_YR: 52 * week,
  HALF_YR: 26 * week,
  ONE_WEEK: 1 * week,
  TWO_WEEKS: 2 * week,
  FOUR_WEEKS: 4 * week,
  EIGHT_WEEKS: 8 * week
};

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

// ============== MAIN TEST UTILS ==============


const encodePriceSqrt = (reserve1, reserve0) => {
  return ethers.BigNumber.from(
    new bn(reserve1.toString())
      .div(reserve0.toString())
      .sqrt()
      .multipliedBy(new bn(2).pow(96))
      .integerValue(3)
      .toString()
  )
}

const helperFastForwardTime = async (seconds) => {
  ethers.provider.send('evm_increaseTime', [seconds]);
  ethers.provider.send('evm_mine');
}

const format6Dec = (amount) => {
  return BigNumber.from(amount).div(DECIMALS_6);
}

const parse6Dec = (amount) => {
  return BigNumber.from(amount).mul(DECIMALS_6);
}

const scaleUpForDecDiff = (amount, decDiff) => {
  const scale = BigNumber.from(10).pow(decDiff);
  return BigNumber.from(amount).mul(scale);
}

const defaultConvertUsdToEur = amount => {
  const chainlinkDecScale = BigNumber.from(10).pow(CHAINLINK_DEC);
  return amount.mul(chainlinkDecScale).div(DEFAULT_CHAINLINK_EUR_USD_PRICE);
}

const getLibraryFactory = async (signerAccount, linkedContract) => {
  const LibContract = await ethers.getContractFactory('Rates');
  const lib = await LibContract.deploy();
  await lib.deployed();
  return await ethers.getContractFactory(linkedContract, {
    signer: signerAccount,
    libraries: {
      Rates: lib.address,
    },
  });
}

const eurToTST = amount => {
  // 0.055
  return amount.mul(1000).div(55);
}


module.exports = {
  POSITION_MANAGER_ADDRESS,
  WETH_ADDRESS,
  DAI_ADDRESS,
  USDT_ADDRESS,
  SEURO_ADDRESS,
  CHAINLINK_ETH_USD,
  CHAINLINK_DAI_USD,
  CHAINLINK_USDT_USD,
  CHAINLINK_EUR_USD,
  CHAINLINK_DEC,
  CHAINLINK_SCALE,
  DEFAULT_CHAINLINK_EUR_USD_PRICE,
  DEFAULT_CHAINLINK_ETH_USD_PRICE,
  etherBalances,
  MOST_STABLE_FEE,
  STABLE_TICK_SPACING,
  MIN_TICK,
  MAX_TICK,
  DEFAULT_SQRT_PRICE,
  ONE_WEEK_IN_SECONDS,
  DECIMALS_18,
  DECIMALS_6,
  rates,
  durations,
  encodePriceSqrt,
  helperFastForwardTime,
  format6Dec,
  parse6Dec,
  scaleUpForDecDiff,
  defaultConvertUsdToEur,
  getLibraryFactory,
  eurToTST
}

