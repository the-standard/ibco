const { ethers } = require('hardhat');
const { BigNumber } = ethers;
const { expect } = require('chai');
const { etherBalances, WETH_ADDRESS, DAI_ADDRESS, USDT_ADDRESS, CHAINLINK_ETH_USD, CHAINLINK_DEC, CHAINLINK_DAI_USD, CHAINLINK_USDT_USD, CHAINLINK_EUR_USD, format6Dec, parse6Dec } = require('./common')

describe('SEuroCalculator', async () => {
  const CALCULATOR_FIXED_POINT = BigNumber.from(10).pow(BigNumber.from(18));
  let SEuroCalculator, BondingCurve;

  beforeEach(async () => {
    [ owner, offering ] = await ethers.getSigners();
    const SEuroContract = await ethers.getContractFactory('SEuro');
    await SEuroContract.deploy('SEuro', 'SEUR', []);
    const BondingCurveContract = await ethers.getContractFactory('BondingCurve');
    const INITIAL_PRICE = ethers.utils.parseEther('0.8');
    const MAX_SUPPLY = ethers.utils.parseEther('200000000');
    const BUCKET_SIZE = ethers.utils.parseEther('100000');
    BondingCurve = await BondingCurveContract.deploy(INITIAL_PRICE, MAX_SUPPLY, BUCKET_SIZE);
    const SEuroCalculatorContract = await ethers.getContractFactory('SEuroCalculator');
    SEuroCalculator = await SEuroCalculatorContract.deploy(BondingCurve.address, CHAINLINK_EUR_USD, CHAINLINK_DEC);
    await BondingCurve.grantRole(await BondingCurve.CALCULATOR(), SEuroCalculator.address);
  });

  async function getBaseEurRate(ClTokUsd) {
    const eurUsdCl = await SEuroCalculator.EUR_USD_CL();
    const tokUsdRate = (await (await ethers.getContractAt('IChainlink', ClTokUsd)).latestRoundData()).answer;
    const eurUsdRate = (await (await ethers.getContractAt('IChainlink', eurUsdCl)).latestRoundData()).answer;
    return CALCULATOR_FIXED_POINT.mul(tokUsdRate).div(eurUsdRate);
  }

  async function expectedSEuros(token, amount) {
    return (await getBaseEurRate(token.chainlinkAddr))
      .mul(amount)
      .mul(CALCULATOR_FIXED_POINT)
      .div((await BondingCurve.currentBucket()).price)
      .div(BigNumber.from(10).pow(token.dec));
  }

  it('calculates the seuros for weth', async () => {
    const amount = ethers.utils.parseEther('1');
    const token = {
      addr: WETH_ADDRESS,
      dec: 18,
      chainlinkAddr: CHAINLINK_ETH_USD,
      chainlinkDec: CHAINLINK_DEC
    };
    const seuros = await SEuroCalculator.callStatic.calculate(amount, token);
    expect(seuros).to.equal(await expectedSEuros(token, amount));
  });

  it('calculates the rate for other tokens', async () => {
    const amount = etherBalances['10K'];
    const token = {
      addr: DAI_ADDRESS,
      dec: 18,
      chainlinkAddr: CHAINLINK_DAI_USD,
      chainlinkDec: CHAINLINK_DEC
    };
    const seuros = await SEuroCalculator.callStatic.calculate(amount, token);
    expect(seuros).to.equal(await expectedSEuros(token, amount));
  });

  it.only('calculates the rate for 6 decimal tokens', async () => {
    const amount = parse6Dec(1000);
    const token = {
      addr: USDT_ADDRESS,
      dec: 6,
      chainlinkAddr: CHAINLINK_USDT_USD,
      chainlinkDec: CHAINLINK_DEC
    };
    const seuros = await SEuroCalculator.callStatic.calculate(amount, token);
    expect(seuros).to.equal(await expectedSEuros(token, amount));
  });

  it('does not do state-changing calculation unless called by offering contract', async () => {
    const amount = etherBalances['10K'];
    const token = {
      addr: DAI_ADDRESS,
      dec: 18,
      chainlinkAddr: CHAINLINK_DAI_USD,
      chainlinkDec: CHAINLINK_DEC
    };
    await expect(SEuroCalculator.connect(offering).calculate(amount, token)).to.be.revertedWith('invalid-user');

    await SEuroCalculator.grantRole(await SEuroCalculator.OFFERING(), offering.address);
    await expect(SEuroCalculator.connect(offering).calculate(amount, token)).not.to.be.reverted;
  });

  it('calculates using read-only bonding curve', async () => {
    const amount = etherBalances.TWO_MILLION;
    const token = {
      addr: DAI_ADDRESS,
      dec: 18,
      chainlinkAddr: CHAINLINK_DAI_USD,
      chainlinkDec: CHAINLINK_DEC
    };
    const seuros = await SEuroCalculator.readOnlyCalculate(amount, token);
    expect(seuros).to.equal(await expectedSEuros(token, amount));
  });
});
