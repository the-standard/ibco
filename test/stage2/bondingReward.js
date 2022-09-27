const { ethers } = require('hardhat');
const { BigNumber } = ethers;
const { expect } = require('chai');
const bn = require('bignumber.js');
const { POSITION_MANAGER_ADDRESS, etherBalances, rates, durations, ONE_WEEK_IN_SECONDS, MOST_STABLE_FEE, helperFastForwardTime, DEFAULT_SQRT_PRICE, MIN_TICK, MAX_TICK, CHAINLINK_DEC, DEFAULT_CHAINLINK_EUR_USD_PRICE, defaultConvertUsdToEur, encodePriceSqrt, scaleUpForDecDiff, parse6Dec, getLibraryFactory, eurToTST } = require('../common.js');
bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });
const eurUsdPrice = DEFAULT_CHAINLINK_EUR_USD_PRICE;

describe('BondingReward', async () => {
  let owner, customer, SEuro, TST, USDC, USDT, BondingEventContract, BondingEvent, StorageContract, BStorage, TGateway, RatioCalculator, ChainlinkEurUsd;

  beforeEach(async () => {
    [owner, customer] = await ethers.getSigners();
    const ERC20Contract = await ethers.getContractFactory('MintableERC20');
    SEuro = await ERC20Contract.deploy('sEURO', 'sEUR', 18);
    USDC = await ERC20Contract.deploy('USDC', 'USDC', 18);
    USDT = await ERC20Contract.deploy('USDT', 'USDT', 6);
    TST = await ERC20Contract.deploy('TST', 'TST', 18);

    BondingEventContract = await ethers.getContractFactory('BondingEvent');
    StorageContract = await getLibraryFactory(owner, 'BondStorage');
    const TokenGatewayContract = await ethers.getContractFactory('StandardTokenGateway');
    const RatioCalculatorContract = await ethers.getContractFactory('RatioCalculator');

    ChainlinkEurUsd = await (await ethers.getContractFactory('ChainlinkMock')).deploy(eurUsdPrice);
    TGateway = await TokenGatewayContract.deploy(TST.address);
    RatioCalculator = await RatioCalculatorContract.deploy();

    // mint some sEUROs, USDCs, USDTS and TSTs
    await SEuro.connect(owner).mint(customer.address, etherBalances.HUNDRED_MILLION);
    await USDC.connect(owner).mint(customer.address, etherBalances.HUNDRED_MILLION);
    await USDT.connect(owner).mint(customer.address, parse6Dec(100_000_000));
  });

  async function balanceTST() {
    return TST.balanceOf(customer.address);
  }

  describe('bonding', async () => {
    it('will not bond if no TST in gateway', async () => {
      BStorage = await StorageContract.deploy(TGateway.address, ChainlinkEurUsd.address, SEuro.address, USDC.address);
      BondingEvent = await BondingEventContract.deploy(
        SEuro.address, USDC.address, POSITION_MANAGER_ADDRESS, BStorage.address, owner.address,
        RatioCalculator.address, DEFAULT_SQRT_PRICE, MIN_TICK, MAX_TICK, MOST_STABLE_FEE
      );
      await BStorage.grantRole(await BStorage.WHITELIST_BOND_STORAGE(), BondingEvent.address);
      
      await SEuro.connect(customer).approve(BondingEvent.address, etherBalances.HUNDRED_MILLION);
      await USDC.connect(customer).approve(BondingEvent.address, etherBalances.HUNDRED_MILLION);
      await TGateway.connect(owner).setStorageAddress(BStorage.address);

      const bond = BondingEvent.connect(owner).bond(
        customer.address, etherBalances.TWO_MILLION, durations.ONE_WEEK, rates.TEN_PC
      );

      await expect(bond).to.be.revertedWith('err-insuff-tst-supply')
      expect(await BStorage.getActiveBonds(customer.address)).to.equal(0);
    });

    context('minted gateway', async () => {
      beforeEach(async () => {
        await TST.connect(owner).mint(TGateway.address, etherBalances.FIVE_HUNDRED_MILLION);
        await TGateway.connect(owner).updateRewardSupply();
      });

      context('other asset is 18 dec token', async () => {
        beforeEach(async () => {
          BStorage = await StorageContract.deploy(TGateway.address, ChainlinkEurUsd.address, SEuro.address, USDC.address);
          BondingEvent = await BondingEventContract.deploy(
            SEuro.address, USDC.address, POSITION_MANAGER_ADDRESS, BStorage.address, owner.address,
            RatioCalculator.address, DEFAULT_SQRT_PRICE, MIN_TICK, MAX_TICK, MOST_STABLE_FEE
          );
          await BStorage.grantRole(await BStorage.WHITELIST_BOND_STORAGE(), BondingEvent.address);
  
          // approve the bonding contract to move customer sEUR and USDC funds
          await SEuro.connect(customer).approve(BondingEvent.address, etherBalances.HUNDRED_MILLION);
          await USDC.connect(customer).approve(BondingEvent.address, etherBalances.HUNDRED_MILLION);
        });
  
        it('successfully transfers TSTs to the user and adjusts gateway contract', async () => {
          await TGateway.connect(owner).setStorageAddress(BStorage.address);
          const amountSEuro = etherBalances.TWO_MILLION;
          const { amountOther } = await BondingEvent.getOtherAmount(amountSEuro);
          await BondingEvent.connect(owner).bond(
            customer.address, etherBalances.TWO_MILLION, durations.ONE_WEEK, rates.TEN_PC
          );
          const bond = await BStorage.getBondAt(customer.address, 0);
          expect(bond.principalSeuro).to.eq(amountSEuro);
          expect(bond.principalOther).to.eq(amountOther);
  
          let claimAmount = await BStorage.getClaimAmount(customer.address);
          expect(claimAmount).to.equal(0);
  
          await helperFastForwardTime(ONE_WEEK_IN_SECONDS);
  
          const payoutSeuro = amountSEuro.add(amountSEuro.div(10)); // ten percent rate
          const payoutOther = amountOther.add(amountOther.div(10)); // ten percent rate
          const payoutStandard = eurToTST(payoutSeuro).add(eurToTST(defaultConvertUsdToEur(payoutOther)));
          // claim has been properly registered in bond backend
          claimAmount = await BStorage.getClaimAmount(customer.address);
          expect(claimAmount).to.equal(payoutStandard);
  
          // verify TST balance is zero
          let actualStandardBal = await balanceTST();
          expect(actualStandardBal).to.equal(0);
          // claim the reward!
          await BStorage.claimReward(customer.address);
          // verify that reward is at user now
          expect(await balanceTST()).to.equal(payoutStandard);
          // verify that there is no claim anymore
          expect(await BStorage.getClaimAmount(customer.address)).to.equal(0);
  
          let actualLeftover = await TST.balanceOf(TGateway.address);
          let maximumRewardSupply = etherBalances.FIVE_HUNDRED_MILLION;
          let expectedLeftover = maximumRewardSupply.sub(payoutStandard);
          expect(actualLeftover).to.equal(expectedLeftover);
        });
      });
  
      context('other asset is 6 dec token', async () => {
        const sortedPrice = (reserveSeuro, reserveOther) => {
          return (SEuro.address.toLowerCase() < USDT.address.toLowerCase()) ?
            encodePriceSqrt(reserveOther, reserveSeuro) :
            encodePriceSqrt(reserveSeuro, reserveOther);
        };
  
        const EUR_USD_CONVERSION_SCALE = 20;
  
        beforeEach(async () => {
          // storage chainlink decimals need to be scaled up to match seuro
          BStorage = await StorageContract.deploy(TGateway.address, ChainlinkEurUsd.address, SEuro.address, USDT.address);
          const sixDecPrice = sortedPrice(scaleUpForDecDiff(100, 12), 105);
          BondingEvent = await BondingEventContract.deploy(
            SEuro.address, USDT.address, POSITION_MANAGER_ADDRESS, BStorage.address, owner.address,
            RatioCalculator.address, sixDecPrice, MIN_TICK, MAX_TICK, MOST_STABLE_FEE
          );
          await BStorage.grantRole(await BStorage.WHITELIST_BOND_STORAGE(), BondingEvent.address);
          
          // approve the bonding contract to move customer sEUR and USDT funds
          await SEuro.connect(customer).approve(BondingEvent.address, etherBalances.HUNDRED_MILLION);
          await USDT.connect(customer).approve(BondingEvent.address, etherBalances.HUNDRED_MILLION);
        });
  
        const convertUsdToEurWithScale = (amount, scale) => {
          const chainlinkDecScale = BigNumber.from(10).pow(scale);
          return amount.mul(chainlinkDecScale).div(DEFAULT_CHAINLINK_EUR_USD_PRICE);
        };
  
        it('successfully transfers TSTs to the user and adjusts gateway contract', async () => {
          await TGateway.connect(owner).setStorageAddress(BStorage.address);
          const amountSEuro = etherBalances.TWO_MILLION;
          const { amountOther } = await BondingEvent.getOtherAmount(amountSEuro);
          await BondingEvent.connect(owner).bond(
            customer.address, etherBalances.TWO_MILLION, durations.ONE_WEEK, rates.TEN_PC
          );
          const bond = await BStorage.getBondAt(customer.address, 0);
          expect(bond.principalSeuro).to.eq(amountSEuro);
          expect(bond.principalOther).to.eq(amountOther);
  
          let claimAmount = await BStorage.getClaimAmount(customer.address);
          expect(claimAmount).to.equal(0);
  
          await helperFastForwardTime(ONE_WEEK_IN_SECONDS);
  
          const payoutSeuro = amountSEuro.add(amountSEuro.div(10)); // ten percent rate
          const payoutOther = amountOther.add(amountOther.div(10)); // ten percent rate
          const payoutStandard = eurToTST((payoutSeuro))
            .add(eurToTST(convertUsdToEurWithScale(payoutOther, EUR_USD_CONVERSION_SCALE)));
          // claim has been properly registered in bond backend
          claimAmount = await BStorage.getClaimAmount(customer.address);
          expect(claimAmount).to.equal(payoutStandard);
  
          // verify TST balance is zero
          let actualStandardBal = await balanceTST();
          expect(actualStandardBal).to.equal(0);
          // claim the reward!
          await BStorage.claimReward(customer.address);
          // verify that reward is at user now
          expect(await balanceTST()).to.equal(payoutStandard);
          // verify that there is no claim anymore
          expect(await BStorage.getClaimAmount(customer.address)).to.equal(0);
  
          let actualLeftover = await TST.balanceOf(TGateway.address);
          let maximumRewardSupply = etherBalances.FIVE_HUNDRED_MILLION;
          let expectedLeftover = maximumRewardSupply.sub(payoutStandard);
          expect(actualLeftover).to.equal(expectedLeftover);
        });
      });

    });
  });
});




