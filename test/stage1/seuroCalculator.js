const { ethers } = require('hardhat');
const { expect } = require('chai');
const { 
  etherBalances, parse6Dec, getLibraryFactory, CHAINLINK_SCALE, DECIMALS_18,
  scaleUpForDecDiff, DEFAULT_CHAINLINK_EUR_USD_PRICE, DEFAULT_CHAINLINK_ETH_USD_PRICE
} = require('../common.js');

describe('SEuroCalculator', async () => {
  let wethToken, daiToken, ChainlinkDaiUsd;
  let SEuroCalculator, BondingCurveContract, BondingCurve, owner, offering, customer;
  const INITIAL_PRICE = ethers.utils.parseEther('0.8');
  const MAX_SUPPLY = ethers.utils.parseEther('200000000');
  const BUCKET_SIZE = ethers.utils.parseEther('100000');

  beforeEach(async () => {
    [owner, offering, customer] = await ethers.getSigners();
    BondingCurveContract = await getLibraryFactory(owner, 'BondingCurve');
    BondingCurve = await BondingCurveContract.deploy(INITIAL_PRICE, MAX_SUPPLY, BUCKET_SIZE);
    const SEuroCalculatorContract = await getLibraryFactory(owner, 'SEuroCalculator');
    const ChainlinkEurUsd = await (await ethers.getContractFactory('ChainlinkMock')).deploy(DEFAULT_CHAINLINK_EUR_USD_PRICE);
    const ChainlinkEthUsd = await (await ethers.getContractFactory('ChainlinkMock')).deploy(DEFAULT_CHAINLINK_ETH_USD_PRICE);
    ChainlinkDaiUsd = await (await ethers.getContractFactory('ChainlinkMock')).deploy(100000000);
    SEuroCalculator = await SEuroCalculatorContract.deploy(BondingCurve.address, ChainlinkEurUsd.address);
    await BondingCurve.grantRole(await BondingCurve.CALCULATOR(), SEuroCalculator.address);
    const WETH = await (await ethers.getContractFactory('MintableERC20')).deploy('Wrapped Ether', 'WETH', 18);
    wethToken = {
      name: await WETH.symbol(),
      addr: WETH.address,
      dec: await WETH.decimals(),
      chainlinkAddr: ChainlinkEthUsd.address,
      chainlinkDec: await ChainlinkEthUsd.decimals()
    }
    const DAI = await (await ethers.getContractFactory('MintableERC20')).deploy('Dai Stablecoin', 'DAI', 18);
    daiToken = {
      name: await DAI.symbol(),
      addr: DAI.address,
      dec: await DAI.decimals(),
      chainlinkAddr: ChainlinkDaiUsd.address,
      chainlinkDec: await ChainlinkDaiUsd.decimals()
    }
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
    const decDiff = 18 - token.dec;
    amount = scaleUpForDecDiff(amount, decDiff);
    const usd = await tokenToUsd(token, amount);
    const euros = await usdToEur(usd);
    return DECIMALS_18.mul(euros).div((await BondingCurve.currentBucket()).price);
  }

  it('calculates the seuros for weth', async () => {
    const amount = ethers.utils.parseEther('1');
    const seuros = await SEuroCalculator.callStatic.calculate(amount, wethToken);
    expect(seuros).to.equal(await expectedSEuros(wethToken, amount));
  });

  it('calculates the rate for other tokens', async () => {
    const amount = etherBalances['10K'];
    const seuros = await SEuroCalculator.callStatic.calculate(amount, daiToken);
    expect(seuros).to.equal(await expectedSEuros(daiToken, amount));
  });

  it('calculates the rate for 6 decimal tokens', async () => {
    const amount = parse6Dec(1000);
    const USDT = await (await ethers.getContractFactory('MintableERC20')).deploy('Tether', 'USDT', 6);
    const token = {
      name: await USDT.symbol(),
      addr: USDT.address,
      dec: await USDT.decimals(),
      chainlinkAddr: ChainlinkDaiUsd.address,
      chainlinkDec: await ChainlinkDaiUsd.decimals()
    }

    const seuros = await SEuroCalculator.callStatic.calculate(amount, token);
    expect(seuros).to.equal(await expectedSEuros(token, amount));
  });

  it('does not do state-changing calculation unless called by offering contract', async () => {
    const amount = etherBalances['10K'];
    await expect(SEuroCalculator.connect(offering).calculate(amount, daiToken)).to.be.revertedWith('invalid-calculator-offering');

    await SEuroCalculator.grantRole(await SEuroCalculator.OFFERING(), offering.address);
    await expect(SEuroCalculator.connect(offering).calculate(amount, daiToken)).not.to.be.reverted;
  });

  it('calculates using read-only bonding curve', async () => {
    const amount = etherBalances.TWO_MILLION;
    const seuros = await SEuroCalculator.readOnlyCalculate(amount, daiToken);
    expect(seuros).to.equal(await expectedSEuros(daiToken, amount));
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
