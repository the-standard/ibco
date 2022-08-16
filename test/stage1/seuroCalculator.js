const { ethers } = require('hardhat');
const { expect } = require('chai');
const { etherBalances, WETH_ADDRESS, DAI_ADDRESS, USDT_ADDRESS, CHAINLINK_ETH_USD, CHAINLINK_DEC, CHAINLINK_DAI_USD, CHAINLINK_USDT_USD, CHAINLINK_EUR_USD, parse6Dec, WETH_BYTES, DAI_BYTES, getLibraryFactory, CHAINLINK_SCALE, DECIMALS_18 } = require('../common.js');

describe('SEuroCalculator', async () => {
  const WETH_TOKEN = {
    name: WETH_BYTES,
    addr: WETH_ADDRESS,
    dec: 18,
    chainlinkAddr: CHAINLINK_ETH_USD,
    chainlinkDec: CHAINLINK_DEC
  };
  const DAI_TOKEN = {
    name: DAI_BYTES,
    addr: DAI_ADDRESS,
    dec: 18,
    chainlinkAddr: CHAINLINK_DAI_USD,
    chainlinkDec: CHAINLINK_DEC
  };
  let SEuroCalculator, BondingCurveContract, BondingCurve, owner, offering, customer;
  const INITIAL_PRICE = ethers.utils.parseEther('0.8');
  const MAX_SUPPLY = ethers.utils.parseEther('200000000');
  const BUCKET_SIZE = ethers.utils.parseEther('100000');

  beforeEach(async () => {
    [owner, offering, customer] = await ethers.getSigners();
    BondingCurveContract = await getLibraryFactory(owner, 'BondingCurve');
    BondingCurve = await BondingCurveContract.deploy(INITIAL_PRICE, MAX_SUPPLY, BUCKET_SIZE);
    const SEuroCalculatorContract = await getLibraryFactory(owner, 'SEuroCalculator');
    SEuroCalculator = await SEuroCalculatorContract.deploy(BondingCurve.address, CHAINLINK_EUR_USD, CHAINLINK_DEC);
    await BondingCurve.grantRole(await BondingCurve.CALCULATOR(), SEuroCalculator.address);
  });

  const tokenToUsd = async (token, amount) => {
    const tokUsdRate = (await (await ethers.getContractAt('IChainlink', token.chainlinkAddr)).latestRoundData()).answer;
    return tokUsdRate.mul(amount).div(CHAINLINK_SCALE);
  }

  const usdToEur = async (amount) => {
    const eurUsdCl = await SEuroCalculator.EUR_USD_CL();
    const eurUsdRate = (await (await ethers.getContractAt('IChainlink', eurUsdCl)).latestRoundData()).answer;
    return CHAINLINK_SCALE.mul(amount).div(eurUsdRate);
  }

  async function expectedSEuros(token, amount) {
    const usd = await tokenToUsd(token, amount);
    const euros = await usdToEur(usd);
    return DECIMALS_18.mul(euros).div((await BondingCurve.currentBucket()).price);
  }

  it('calculates the seuros for weth', async () => {
    const amount = ethers.utils.parseEther('1');
    const seuros = await SEuroCalculator.callStatic.calculate(amount, WETH_TOKEN);
    expect(seuros).to.equal(await expectedSEuros(WETH_TOKEN, amount));
  });

  it('calculates the rate for other tokens', async () => {
    const amount = etherBalances['10K'];
    const seuros = await SEuroCalculator.callStatic.calculate(amount, DAI_TOKEN);
    expect(seuros).to.equal(await expectedSEuros(DAI_TOKEN, amount));
  });

  it('calculates the rate for 6 decimal tokens', async () => {
    const amount = parse6Dec(1000);
    const token = {
      name: ethers.utils.formatBytes32String('USDT'),
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
    await expect(SEuroCalculator.connect(offering).calculate(amount, DAI_TOKEN)).to.be.revertedWith('invalid-calculator-offering');

    await SEuroCalculator.grantRole(await SEuroCalculator.OFFERING(), offering.address);
    await expect(SEuroCalculator.connect(offering).calculate(amount, DAI_TOKEN)).not.to.be.reverted;
  });

  it('calculates using read-only bonding curve', async () => {
    const amount = etherBalances.TWO_MILLION;
    const seuros = await SEuroCalculator.readOnlyCalculate(amount, DAI_TOKEN);
    expect(seuros).to.equal(await expectedSEuros(DAI_TOKEN, amount));
  });

  describe('dependencies', async () => {
    it('updates bonding curve', async () => {
      const newCurve = await BondingCurveContract.deploy(INITIAL_PRICE, MAX_SUPPLY, BUCKET_SIZE);

      let update = SEuroCalculator.connect(customer).setBondingCurve(newCurve.address);
      await expect(update).to.be.revertedWith('invalid-admin');
      expect(await SEuroCalculator.bondingCurve()).to.equal(BondingCurve.address);

      update = SEuroCalculator.connect(owner).setBondingCurve(newCurve.address);
      await expect(update).not.to.be.reverted;
      expect(await SEuroCalculator.bondingCurve()).to.equal(newCurve.address);
    });
  });
});
