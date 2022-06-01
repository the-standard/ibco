const { ethers } = require('hardhat');
const { BigNumber } = ethers;
const { expect } = require('chai');

describe('SEuroRateCalculator', async () => {
  const CL_ETH_USD = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';
  const CL_ETH_USD_DEC = 8;
  const CL_DAI_USD = '0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9';
  const CL_DAI_USD_DEC = 8;
  const CALCULATOR_FIXED_POINT = BigNumber.from(10).pow(BigNumber.from(18));
  let SEuroRateCalculator, BondingCurve;

  beforeEach(async () => {
    const SEuroContract = await ethers.getContractFactory('SEuro');
    const SEuro = await SEuroContract.deploy('SEuro', 'SEUR', []);
    const BondingCurveContract = await ethers.getContractFactory('BondingCurve');
    const INITIAL_PRICE = ethers.utils.parseEther('0.7');
    const MAX_SUPPLY = 200_000_000;
    BondingCurve = await BondingCurveContract.deploy(SEuro.address, INITIAL_PRICE, MAX_SUPPLY);
    const SEuroRateCalculatorContract = await ethers.getContractFactory('SEuroRateCalculator');
    SEuroRateCalculator = await SEuroRateCalculatorContract.deploy(BondingCurve.address);
  });

  async function getBaseEurRate(clTokUsd) {
    const eurUsdCl = await SEuroRateCalculator.EUR_USD_CL();
    const tokUsdRate = (await (await ethers.getContractAt('Chainlink', clTokUsd)).latestRoundData()).answer;
    const eurUsdRate = (await (await ethers.getContractAt('Chainlink', eurUsdCl)).latestRoundData()).answer;
    return CALCULATOR_FIXED_POINT.mul(tokUsdRate).div(eurUsdRate);
  }

  async function expectedRate(clTokUsd) {
    return (await getBaseEurRate(clTokUsd))
      .mul(await BondingCurve.FIXED_POINT())
      .div(await BondingCurve.pricePerEuro());
  }

  it('calculates the rate for weth', async () => {
    const rate = await SEuroRateCalculator.calculate(CL_ETH_USD, CL_ETH_USD_DEC);
    expect(rate).to.equal(await expectedRate(CL_ETH_USD));
  });

  it('calculates the rate for other tokens', async () => {
    const rate = await SEuroRateCalculator.calculate(CL_DAI_USD, CL_DAI_USD_DEC);
    expect(rate).to.equal(await expectedRate(CL_DAI_USD));
  });
});
