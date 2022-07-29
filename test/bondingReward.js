const { ethers } = require('hardhat');
const { expect } = require('chai');
const bn = require('bignumber.js');
const { POSITION_MANAGER_ADDRESS, STANDARD_TOKENS_PER_EUR, DECIMALS, etherBalances, rates, durations, ONE_WEEK_IN_SECONDS, MOST_STABLE_FEE, helperFastForwardTime, DEFAULT_SQRT_PRICE, MIN_TICK, MAX_TICK } = require('./common.js');
bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 })

describe('BondingReward', async () => {
  let owner, customer, SEuro, TST, USDT, BondingEvent, BStorage, TGateway, RatioCalculator;

  beforeEach(async () => {
    [owner, customer] = await ethers.getSigners();
    const ERC20Contract = await ethers.getContractFactory('DummyDec18');
    const SEuroContract = await ethers.getContractFactory('SEuro');
    SEuro = await SEuroContract.deploy('sEURO', 'sEUR', [owner.address]);
    USDT = await ERC20Contract.deploy('USDT', 'USDT', ethers.utils.parseEther('10000000'));
    TST = await ERC20Contract.deploy('TST', 'TST', ethers.utils.parseEther('10000000'));

    const BondingEventContract = await ethers.getContractFactory('BondingEvent');
    const StorageContract = await ethers.getContractFactory('BondStorage');
    const TokenGatewayContract = await ethers.getContractFactory('StandardTokenGateway');
    const RatioCalculatorContract = await ethers.getContractFactory('RatioCalculator');

    TGateway = await TokenGatewayContract.deploy(TST.address, SEuro.address);
    BStorage = await StorageContract.deploy(TGateway.address);
    RatioCalculator = await RatioCalculatorContract.deploy();
    BondingEvent = await BondingEventContract.deploy(
      SEuro.address, USDT.address, POSITION_MANAGER_ADDRESS, BStorage.address, owner.address,
      RatioCalculator.address, DEFAULT_SQRT_PRICE, MIN_TICK, MAX_TICK, MOST_STABLE_FEE
    );

    // mint some sEUROs, USDTs, and TSTs
    await SEuro.connect(owner).mint(customer.address, etherBalances.HUNDRED_MILLION);
    await USDT.connect(owner).mint(customer.address, etherBalances.HUNDRED_MILLION);
    await SEuro.connect(owner).mint(owner.address, etherBalances.ONE_BILLION);
    await USDT.connect(owner).mint(owner.address, etherBalances.ONE_BILLION);
    await TST.connect(owner).mint(TGateway.address, etherBalances.FIVE_HUNDRED_MILLION);
    await TGateway.connect(owner).updateRewardSupply();

    // approve the bonding contract to move customer sEUR and USDT funds
    await SEuro.connect(customer).approve(BondingEvent.address, etherBalances.HUNDRED_MILLION);
    await USDT.connect(customer).approve(BondingEvent.address, etherBalances.HUNDRED_MILLION);
  });

  async function balanceTST() {
    return TST.balanceOf(customer.address);
  }

  describe('bonding', async () => {
    it('successfully transfers TSTs to the user and adjusts gateway contract', async () => {
      let actualClaim, expectedClaim, bond, actualStandardBal;

      await TGateway.connect(owner).setStorageAddress(BStorage.address);
      await BondingEvent.connect(owner).bond(
        customer.address, etherBalances.TWO_MILLION, durations.ONE_WEEK, rates.TEN_PC
      );
      bond = await BStorage.getBondAt(customer.address, 0);
      let principal = 2000000;
      expect(bond.principal.div(DECIMALS)).to.equal(principal);

      actualClaim = await BStorage.getClaimAmount(customer.address);
      expect(actualClaim).to.equal(0);

      await helperFastForwardTime(ONE_WEEK_IN_SECONDS);

      actualClaim = await BStorage.getClaimAmount(customer.address);
      expect(actualClaim).to.equal(0);

      await BStorage.connect(customer).refreshBondStatus(customer.address);

      let profitSeuro = principal * 1.1; // ten percent rate
      let profitStandard = profitSeuro * STANDARD_TOKENS_PER_EUR;
      expectedClaim = profitStandard.toString();
      // claim has been properly registered in bond backend
      actualClaim = (await BStorage.getClaimAmount(customer.address)).div(DECIMALS).toString();
      expect(actualClaim).to.equal(expectedClaim);

      // verify TST balance is zero
      actualStandardBal = await balanceTST();
      expect(actualStandardBal).to.equal(0);
      // claim the reward!
      await BStorage.connect(customer).claimReward(customer.address);
      // verify that reward is at user now
      actualStandardBal = (await balanceTST()).div(DECIMALS).toString();
      expect(actualStandardBal).to.equal(expectedClaim);
      // verify that there is no claim anymore
      actualClaim = (await BStorage.getClaimAmount(customer.address)).div(DECIMALS).toString();
      expect(actualClaim).to.equal('0');

      let actualLeftover = (await TST.balanceOf(TGateway.address)).div(DECIMALS).toString();
      let maximumRewardSupply = 500 * 10 ** 6;
      let expectedLeftover = (maximumRewardSupply - profitStandard).toString();
      expect(actualLeftover).to.equal(expectedLeftover);
    });
  });
});




