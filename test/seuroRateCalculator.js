const { ethers } = require('hardhat');
const { BigNumber } = ethers;
const { expect } = require('chai');
const { etherBalances } = require('./common')

let owner, offering;

describe('SEuroCalculator', async () => {
  const CL_ETH_USD = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';
  const CL_ETH_USD_DEC = 8;
  const CL_DAI_USD = '0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9';
  const CL_DAI_USD_DEC = 8;
  const EUR_USD_CL = '0xb49f677943BC038e9857d61E7d053CaA2C1734C1';
  const EUR_USD_CL_DEC = 8;
  const CALCULATOR_FIXED_POINT = BigNumber.from(10).pow(BigNumber.from(18));
  let SEuroCalculator, BondingCurve;

  beforeEach(async () => {
    [ owner, offering ] = await ethers.getSigners();
    const SEuroContract = await ethers.getContractFactory('SEuro');
    const SEuro = await SEuroContract.deploy('SEuro', 'SEUR', []);
    const BondingCurveContract = await ethers.getContractFactory('BondingCurve');
    const INITIAL_PRICE = ethers.utils.parseEther('0.8');
    const MAX_SUPPLY = ethers.utils.parseEther('200000000');
    const BUCKET_SIZE = ethers.utils.parseEther('100000');
    BondingCurve = await BondingCurveContract.deploy(INITIAL_PRICE, MAX_SUPPLY, BUCKET_SIZE);
    const SEuroCalculatorContract = await ethers.getContractFactory('SEuroCalculator');
    SEuroCalculator = await SEuroCalculatorContract.deploy(BondingCurve.address, EUR_USD_CL, EUR_USD_CL_DEC);
    await BondingCurve.grantRole(await BondingCurve.CALCULATOR(), SEuroCalculator.address);
  });

  async function getBaseEurRate(clTokUsd) {
    const eurUsdCl = await SEuroCalculator.EUR_USD_CL();
    const tokUsdRate = (await (await ethers.getContractAt('Chainlink', clTokUsd)).latestRoundData()).answer;
    const eurUsdRate = (await (await ethers.getContractAt('Chainlink', eurUsdCl)).latestRoundData()).answer;
    return CALCULATOR_FIXED_POINT.mul(tokUsdRate).div(eurUsdRate);
  }

  async function expectedSEuros(clTokUsd, amount) {
    return (await getBaseEurRate(clTokUsd))
      .mul(amount)
      .div((await BondingCurve.currentBucket()).price);
  }

  it('calculates the seuros for weth', async () => {
    const amount = ethers.utils.parseEther('1');
    const seuros = await SEuroCalculator.callStatic.calculate(amount, CL_ETH_USD, CL_ETH_USD_DEC);
    expect(seuros).to.equal(await expectedSEuros(CL_ETH_USD, amount));
  });

  it('calculates the rate for other tokens', async () => {
    const amount = etherBalances['10K'];
    const seuros = await SEuroCalculator.callStatic.calculate(amount, CL_DAI_USD, CL_DAI_USD_DEC);
    expect(seuros).to.equal(await expectedSEuros(CL_DAI_USD, amount));
  });

  it('does not do state-changing calculation unless called by offering contract', async () => {
    const amount = etherBalances['10K'];
    await expect(SEuroCalculator.connect(offering).calculate(amount, CL_DAI_USD, CL_DAI_USD_DEC)).to.be.revertedWith('invalid-user');

    await SEuroCalculator.grantRole(await SEuroCalculator.OFFERING(), offering.address);
    await expect(SEuroCalculator.connect(offering).calculate(amount, CL_DAI_USD, CL_DAI_USD_DEC)).not.to.be.reverted;
  });

  it('calculates using read-only bonding curve', async () => {
    const amount = etherBalances.TWO_MILLION;
    const seuros = await SEuroCalculator.readOnlyCalculate(amount, CL_DAI_USD, CL_DAI_USD_DEC);
    expect(seuros).to.equal(await expectedSEuros(CL_DAI_USD, amount));
  });
});
