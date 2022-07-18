const bn = require('bignumber.js');
const { ethers } = require('hardhat');
const { BigNumber } = ethers;

var POSITION_MANAGER_ADDRESS = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
var etherBalances = {
  "8K": ethers.utils.parseEther('8000'),
  "10K": ethers.utils.parseEther('10000'),
  "80K": ethers.utils.parseEther('80000'),
  "100K": ethers.utils.parseEther('100000'),
  "125K": ethers.utils.parseEther('125000'),
  "TWO_MILLION": ethers.utils.parseEther('2000000'),
  "FOUR_MILLION": ethers.utils.parseEther('4000000'),
  "FIFTY_MILLION": ethers.utils.parseEther('50000000'),
  "HUNDRED_MILLION": ethers.utils.parseEther('100000000'),
  "FIVE_HUNDRED_MILLION": ethers.utils.parseEther('500000000'),
  "ONE_BILLION": ethers.utils.parseEther('1000000000'),
};
const MOST_STABLE_FEE = 500;
const STABLE_TICK_SPACING = 10;
const MIN_TICK = -887270;
const MAX_TICK = 887270;
const DEFAULT_SQRT_PRICE = BigNumber.from(2).pow(96);
const ONE_WEEK_IN_SECONDS = 7 * 24 * 60 * 60;
const STANDARD_TOKENS_PER_EUR = 20; // 1 TST = 0.05 EUR
const DECIMALS = BigNumber.from(10).pow(18);
var rates = {
  "HALF_PC": 500,
  "FIVE_PC": 5000,
  "SIX_PC": 6000,
  "SEVEN_PC": 7000,
  "TEN_PC": 10000,
  "TWENTY_PC": 20000,
};
var durations = {
  "ONE_YR_WEEKS": 52,
  "HALF_YR_WEEKS": 26,
  "ONE_WEEK": 1,
  "TWO_WEEKS": 2,
  "FOUR_WEEKS": 4,
  "EIGHT_WEEKS": 8
};

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 })

// ============== FUNCTIONS ==============
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


module.exports = {
  POSITION_MANAGER_ADDRESS,
  etherBalances,
  MOST_STABLE_FEE,
  STABLE_TICK_SPACING,
  MIN_TICK,
  MAX_TICK,
  DEFAULT_SQRT_PRICE,
  ONE_WEEK_IN_SECONDS,
  STANDARD_TOKENS_PER_EUR,
  DECIMALS,
  rates,
  durations,
  encodePriceSqrt,
  helperFastForwardTime
}

