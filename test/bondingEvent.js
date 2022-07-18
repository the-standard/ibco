const { ethers } = require('hardhat');
const { expect } = require('chai');
const bn = require('bignumber.js');
const { POSITION_MANAGER_ADDRESS, DECIMALS, etherBalances, rates, durations, ONE_WEEK_IN_SECONDS, MOST_STABLE_FEE, STABLE_TICK_SPACING, STANDARD_TOKENS_PER_EUR, encodePriceSqrt, helperFastForwardTime, MAX_TICK, MIN_TICK } = require('./common.js');

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 })

let owner, customer, SEuro, TST, USDT, BondingEvent, BondStorage, TokenGateway, BondingEventContract, RatioCalculator, pricing;

describe('BondingEvent', async () => {


  beforeEach(async () => {
    [owner, customer] = await ethers.getSigners();
    BondingEventContract = await ethers.getContractFactory('BondingEvent');
    const SEuroContract = await ethers.getContractFactory('SEuro');
    const ERC20Contract = await ethers.getContractFactory('DUMMY');
    const BondStorageContract = await ethers.getContractFactory('BondStorage');
    const TokenGatewayContract = await ethers.getContractFactory('StandardTokenGateway');
    const RatioCalculatorContract = await ethers.getContractFactory('RatioCalculator');
    SEuro = await SEuroContract.deploy('sEURO', 'SEUR', [owner.address]);
    TST = await ERC20Contract.deploy('TST', 'TST', ethers.utils.parseEther('10000000'));
    USDT = await ERC20Contract.deploy('USDT', 'USDT', ethers.utils.parseEther('100000000'));
    TokenGateway = await TokenGatewayContract.deploy(TST.address, SEuro.address);
    BondStorage = await BondStorageContract.deploy(TokenGateway.address);
    RatioCalculator = await RatioCalculatorContract.deploy();
  });

  const deployBondingEvent = async () => {
    // tick -400 approx. 0.96 USDT per SEUR
    // tick 3000 approx. 1.35 USDT per SEUR
    // 400 and -3000 are the inverse of these prices
    pricing = SEuro.address < USDT.address ?
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

    BondingEvent = await BondingEventContract.deploy(
      SEuro.address, USDT.address, POSITION_MANAGER_ADDRESS, BondStorage.address,
      owner.address, RatioCalculator.address, pricing.initial, pricing.lowerTick,
      pricing.upperTick, MOST_STABLE_FEE
    );
  };

  describe('initialisation', async () => {
    it('initialises the pool with the given price', async () => {
      await deployBondingEvent();

      expect(await BondingEvent.pool()).not.to.equal(ethers.constants.AddressZero);
      expect(await BondingEvent.tickSpacing()).to.equal(STABLE_TICK_SPACING);
    });
  });

  context('initialised', async () => {
    beforeEach(async () => {
      await deployBondingEvent();
    });

    const helperUpdateBondStatus = async () => {
      await BondStorage.connect(customer).refreshBondStatus(customer.address);
    }

    const helperGetActiveBonds = async () => {
      return await BondStorage.getActiveBonds(customer.address);
    }

    const helperGetBondAt = async (index) => {
      return await BondStorage.getBondAt(customer.address, index);
    }

    const helperGetProfit = async () => {
      return await BondStorage.getProfit(customer.address);
    }

    describe('calculating ratio', async () => {
      it('calculates the required amount of USDT for given sEURO', async () => {
        const amountSEuro = etherBalances['10K'];
        const requiredUSDT = (await BondingEvent.getOtherAmount(amountSEuro)).div(DECIMALS);
        // comes from uniswap ui
        const expectedUSDT = 11533;
        expect(requiredUSDT).to.equal(expectedUSDT);
      });
    });

    describe('tick defaults', async () => {
      it('updates lower and upper default ticks', async () => {
        const { lowerTick, upperTick } = pricing;

        await expect(BondingEvent.connect(customer).adjustTickDefaults(-10, 10)).to.be.revertedWith('invalid-user');
        await expect(BondingEvent.adjustTickDefaults(-15, 10)).to.be.revertedWith('tick-mod-spacing-nonzero');
        await expect(BondingEvent.adjustTickDefaults(-10, MAX_TICK + 10)).to.be.revertedWith('tick-max-exceeded');
        await expect(BondingEvent.adjustTickDefaults(MIN_TICK - 10, 10)).to.be.revertedWith('tick-min-exceeded');

        expect(await BondingEvent.lowerTickDefault()).to.equal(lowerTick);
        expect(await BondingEvent.upperTickDefault()).to.equal(upperTick);

        const newLower = -10;
        const newUpper = 10;
        await BondingEvent.adjustTickDefaults(newLower, newUpper);
        expect(await BondingEvent.lowerTickDefault()).to.equal(newLower);
        expect(await BondingEvent.upperTickDefault()).to.equal(newUpper);
      })
    });

    describe('bond', async () => {
      beforeEach(async () => {
        // mint balances
        await SEuro.connect(owner).mint(owner.address, etherBalances["ONE_BILLION"]);
        await SEuro.connect(owner).mint(customer.address, etherBalances["HUNDRED_MILLION"]);
        await USDT.connect(owner).mint(owner.address, etherBalances["ONE_BILLION"]);
        await USDT.connect(owner).mint(customer.address, etherBalances["HUNDRED_MILLION"]);

        // fill token gateway with TST as rewards
        await TST.connect(owner).mint(TokenGateway.address, etherBalances["FIVE_HUNDRED_MILLION"]);
        await TokenGateway.connect(owner).updateRewardSupply();
      });

      it('bonds sEURO and USDT for 52 weeks and receives correct seuro profit', async () => {
        await TokenGateway.connect(owner).setStorageAddress(BondStorage.address);
        const amountSEuro = etherBalances["TWO_MILLION"];
        const amountOther = await BondingEvent.getOtherAmount(amountSEuro);
        await SEuro.connect(customer).approve(BondingEvent.address, amountSEuro);
        await USDT.connect(customer).approve(BondingEvent.address, amountOther);
        await BondingEvent.connect(owner).bond(
          customer.address, amountSEuro, amountOther, durations["ONE_YR_WEEKS"], rates["TEN_PC"],
        );

        await helperUpdateBondStatus();
        const bondsAmount = await helperGetActiveBonds();
        expect(bondsAmount).to.equal(1);

        const firstBond = await helperGetBondAt(0);
        let actualPrincipal = firstBond.principal;
        let actualRate = firstBond.rate;
        expect(actualPrincipal).to.equal(etherBalances["TWO_MILLION"]);
        expect(actualRate).to.equal(rates["TEN_PC"]);

        await helperFastForwardTime(52 * ONE_WEEK_IN_SECONDS);
        await helperUpdateBondStatus();

        const seuroProfit = 200000;
        let expectedReward = (STANDARD_TOKENS_PER_EUR * seuroProfit).toString();
        let actualReward = ((await helperGetProfit()).div(DECIMALS)).toString();
        expect(actualReward).to.equal(expectedReward);
      });

      it('bonds with an amount less than one million and receives correct seuro profit', async () => {
        await TokenGateway.connect(owner).setStorageAddress(BondStorage.address);
        const amountSEuro = etherBalances['100K'];
        const amountOther = await BondingEvent.getOtherAmount(amountSEuro);
        await SEuro.connect(customer).approve(BondingEvent.address, amountSEuro);
        await USDT.connect(customer).approve(BondingEvent.address, amountOther);
        await BondingEvent.connect(owner).bond(
          customer.address, amountSEuro, amountOther, durations["ONE_WEEK"], rates["TEN_PC"]
        );

        await helperUpdateBondStatus();
        const bondsAmount = await helperGetActiveBonds();
        expect(bondsAmount).to.equal(1);

        const firstBond = await helperGetBondAt(0);
        let actualPrincipal = firstBond.principal;
        let actualRate = firstBond.rate;
        // TODO how should principal be calculated?
        expect(actualPrincipal).to.equal(etherBalances["100K"]);
        expect(actualRate).to.equal(rates["TEN_PC"]);

        await helperFastForwardTime(ONE_WEEK_IN_SECONDS);
        await helperUpdateBondStatus();

        const seuroProfit = 10000;
        let expectedProfit = STANDARD_TOKENS_PER_EUR * seuroProfit;
        let actualProfit = (await helperGetProfit()).div(DECIMALS);
        expect(actualProfit).to.equal(expectedProfit);
      });

      it('bonds with an amount less than one hundred thousand and receives correct seuro profit', async () => {
        await TokenGateway.connect(owner).setStorageAddress(BondStorage.address);
        const amountSEuro = etherBalances['10K'];
        const amountOther = await BondingEvent.getOtherAmount(amountSEuro);
        await SEuro.connect(customer).approve(BondingEvent.address, amountSEuro);
        await USDT.connect(customer).approve(BondingEvent.address, amountOther);
        await BondingEvent.connect(owner).bond(
          customer.address, amountSEuro, amountOther, durations["ONE_WEEK"], rates["SIX_PC"]
        );

        await helperFastForwardTime(ONE_WEEK_IN_SECONDS);
        await helperUpdateBondStatus();

        const seuroProfit = 600;
        let expectedProfit = STANDARD_TOKENS_PER_EUR * seuroProfit;
        let actualProfit = (await helperGetProfit()).div(DECIMALS);
        expect(actualProfit).to.equal(expectedProfit);
      });

      it('bonds multiple times with various maturities and updates active and inactive bonds correctly', async () => {
        await TokenGateway.connect(owner).setStorageAddress(BondStorage.address);
        const amountSEuro = etherBalances['TWO_MILLION'];
        const amountOther = await BondingEvent.getOtherAmount(amountSEuro);
        await SEuro.connect(customer).approve(BondingEvent.address, amountSEuro.mul(3));
        await USDT.connect(customer).approve(BondingEvent.address, amountOther.mul(3));
        await BondingEvent.connect(owner).bond(
          customer.address, amountSEuro, amountOther, durations["ONE_WEEK"], rates["FIVE_PC"]
        );
        await BondingEvent.connect(owner).bond(
          customer.address, amountSEuro, amountOther, durations["TWO_WEEKS"], rates["SIX_PC"]
        );
        await BondingEvent.connect(owner).bond(
          customer.address, amountSEuro, amountOther, durations["FOUR_WEEKS"], rates["TEN_PC"]
        );

        let expectedActiveBonds = 3;
        let actualActiveBonds = await helperGetActiveBonds();
        expect(actualActiveBonds).to.equal(expectedActiveBonds);

        let expectedReward = '0';
        let actualReward = (await helperGetProfit()).toString();
        expect(actualReward).to.equal(expectedReward);

        await helperFastForwardTime(ONE_WEEK_IN_SECONDS);
        await helperUpdateBondStatus();

        let seuroProfit = 100000;
        expectedReward = (STANDARD_TOKENS_PER_EUR * seuroProfit).toString();
        actualReward = ((await helperGetProfit()).div(DECIMALS)).toString();
        expect(actualReward).to.equal(expectedReward);
        expectedActiveBonds = 2;
        actualActiveBonds = await helperGetActiveBonds();
        expect(actualActiveBonds).to.equal(expectedActiveBonds);

        await helperFastForwardTime(ONE_WEEK_IN_SECONDS);
        await helperUpdateBondStatus();

        seuroProfit = 220000;
        expectedReward = (STANDARD_TOKENS_PER_EUR * seuroProfit).toString();
        actualReward = (await helperGetProfit() / DECIMALS).toString();
        expect(actualReward).to.equal(expectedReward);
        expectedActiveBonds = 1;
        actualActiveBonds = await helperGetActiveBonds();
        expect(actualActiveBonds).to.equal(expectedActiveBonds);

        await helperFastForwardTime(2 * ONE_WEEK_IN_SECONDS);
        await helperUpdateBondStatus();

        seuroProfit = 420000;
        expectedReward = (STANDARD_TOKENS_PER_EUR * seuroProfit).toString();
        actualReward = (await helperGetProfit() / DECIMALS).toString();
        expect(actualReward).to.equal(expectedReward);
        expectedActiveBonds = 0;
        actualActiveBonds = await helperGetActiveBonds();
        expect(actualActiveBonds).to.equal(expectedActiveBonds);
      });
    });
  });


  //
  //
  //
  // --------------------------------------
  // TODO:
  // - test adjusting ticks
  // - test liquidity position created
  // - test different liquidity positions created
  // - make sure the principals / profits on bonds are correct, and based on both amounts sent in
  // - fee collection?
  // - transfer nfts?
  // --------------------------------------
  //
  //
  //
});
