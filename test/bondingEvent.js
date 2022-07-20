const { ethers } = require('hardhat');
const { BigNumber } = ethers;
const { expect } = require('chai');
const bn = require('bignumber.js');
const { POSITION_MANAGER_ADDRESS, DECIMALS, etherBalances, rates, durations, ONE_WEEK_IN_SECONDS, MOST_STABLE_FEE, STABLE_TICK_SPACING, STANDARD_TOKENS_PER_EUR, encodePriceSqrt, helperFastForwardTime, MAX_TICK, MIN_TICK } = require('./common.js');

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 })

let owner, customer, wallet, SEuro, TST, USDT, BondingEvent, BondStorage, TokenGateway, BondingEventContract, RatioCalculator, pricing;

describe('BondingEvent', async () => {


  beforeEach(async () => {
    [owner, customer, wallet] = await ethers.getSigners();
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

  const deployBondingEvent = async (reserveSEuro, reserveOther) => {
    // tick -400 approx. 0.96 USDT per SEUR
    // tick 3000 approx. 1.35 USDT per SEUR
    // 400 and -3000 are the inverse of these prices
    pricing = SEuro.address < USDT.address ?
      {
        initial: encodePriceSqrt(reserveOther, reserveSEuro),
        lowerTick: -400,
        upperTick: 3000
      } :
      {
        initial: encodePriceSqrt(reserveSEuro, reserveOther),
        lowerTick: -3000,
        upperTick: 400,
      }

    BondingEvent = await BondingEventContract.deploy(
      SEuro.address, USDT.address, POSITION_MANAGER_ADDRESS, BondStorage.address,
      owner.address, RatioCalculator.address, pricing.initial, pricing.lowerTick,
      pricing.upperTick, MOST_STABLE_FEE
    );
  }

  const deployBondingEventWithDefaultPrices = async () => {
    await deployBondingEvent(100, 114);
  };

  const mintUsers = async () => {
    await SEuro.connect(owner).mint(owner.address, etherBalances.ONE_BILLION);
    await SEuro.connect(owner).mint(customer.address, etherBalances.HUNDRED_MILLION);
    await USDT.connect(owner).mint(owner.address, etherBalances.ONE_BILLION);
    await USDT.connect(owner).mint(customer.address, etherBalances.HUNDRED_MILLION);
  }

  const readyTokenGateway = async () => {
    await TST.connect(owner).mint(TokenGateway.address, etherBalances.FIVE_HUNDRED_MILLION);
    await TokenGateway.connect(owner).updateRewardSupply();
    await TokenGateway.connect(owner).setStorageAddress(BondStorage.address);
  }

  describe('initialisation', async () => {
    it('initialises the pool with the given price', async () => {
      await deployBondingEventWithDefaultPrices();

      expect(await BondingEvent.pool()).not.to.equal(ethers.constants.AddressZero);
      expect(await BondingEvent.tickSpacing()).to.equal(STABLE_TICK_SPACING);
    });
  });

  context('initialised with default prices', async () => {
    beforeEach(async () => {
      await deployBondingEventWithDefaultPrices();
      await mintUsers();
      await readyTokenGateway();
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
        let { amountOther } = (await BondingEvent.getOtherAmount(amountSEuro));
        amountOther = amountOther.div(DECIMALS);
        // comes from uniswap ui, adding the 0.01% extra from "getOtherAmount" in BondingEvent
        const expectedUSDT = 11534;
        expect(amountOther).to.equal(expectedUSDT);
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

      it('bonds sEURO and USDT for 52 weeks and receives correct seuro profit', async () => {
        const amountSEuro = etherBalances.TWO_MILLION;
        const { amountOther } = await BondingEvent.getOtherAmount(amountSEuro);
        await SEuro.connect(customer).approve(BondingEvent.address, amountSEuro);
        await USDT.connect(customer).approve(BondingEvent.address, amountOther);
        await BondingEvent.connect(owner).bond(
          customer.address, amountSEuro, durations.ONE_YR_WEEKS, rates.TEN_PC,
        );

        await helperUpdateBondStatus();
        const bondsAmount = await helperGetActiveBonds();
        expect(bondsAmount).to.equal(1);

        const firstBond = await helperGetBondAt(0);
        let actualPrincipal = firstBond.principal;
        let actualRate = firstBond.rate;
        expect(actualPrincipal).to.equal(etherBalances.TWO_MILLION);
        expect(actualRate).to.equal(rates.TEN_PC);

        await helperFastForwardTime(52 * ONE_WEEK_IN_SECONDS);
        await helperUpdateBondStatus();

        const seuroProfit = 200000;
        let expectedReward = (STANDARD_TOKENS_PER_EUR * seuroProfit).toString();
        let actualReward = ((await helperGetProfit()).div(DECIMALS)).toString();
        expect(actualReward).to.equal(expectedReward);
      });

      it('bonds with an amount less than one million and receives correct seuro profit', async () => {
        const amountSEuro = etherBalances['100K'];
        const { amountOther } = await BondingEvent.getOtherAmount(amountSEuro);
        await SEuro.connect(customer).approve(BondingEvent.address, amountSEuro);
        await USDT.connect(customer).approve(BondingEvent.address, amountOther);
        await BondingEvent.connect(owner).bond(
          customer.address, amountSEuro, durations.ONE_WEEK, rates.TEN_PC
        );

        await helperUpdateBondStatus();
        const bondsAmount = await helperGetActiveBonds();
        expect(bondsAmount).to.equal(1);

        const firstBond = await helperGetBondAt(0);
        let actualPrincipal = firstBond.principal;
        let actualRate = firstBond.rate;
        // TODO how should principal be calculated?
        expect(actualPrincipal).to.equal(etherBalances['100K']);
        expect(actualRate).to.equal(rates.TEN_PC);

        await helperFastForwardTime(ONE_WEEK_IN_SECONDS);
        await helperUpdateBondStatus();

        const seuroProfit = 10000;
        let expectedProfit = STANDARD_TOKENS_PER_EUR * seuroProfit;
        let actualProfit = (await helperGetProfit()).div(DECIMALS);
        expect(actualProfit).to.equal(expectedProfit);
      });

      it('bonds with an amount less than one hundred thousand and receives correct seuro profit', async () => {
        const amountSEuro = etherBalances['10K'];
        const { amountOther } = await BondingEvent.getOtherAmount(amountSEuro);
        await SEuro.connect(customer).approve(BondingEvent.address, amountSEuro);
        await USDT.connect(customer).approve(BondingEvent.address, amountOther);
        await BondingEvent.connect(owner).bond(
          customer.address, amountSEuro, durations.ONE_WEEK, rates.SIX_PC
        );

        await helperFastForwardTime(ONE_WEEK_IN_SECONDS);
        await helperUpdateBondStatus();

        const seuroProfit = 600;
        let expectedProfit = STANDARD_TOKENS_PER_EUR * seuroProfit;
        let actualProfit = (await helperGetProfit()).div(DECIMALS);
        expect(actualProfit).to.equal(expectedProfit);
      });

      it('bonds multiple times with various maturities and updates active and inactive bonds correctly', async () => {
        const amountSEuro = etherBalances.TWO_MILLION;
        const { amountOther } = await BondingEvent.getOtherAmount(amountSEuro);
        await SEuro.connect(customer).approve(BondingEvent.address, amountSEuro.mul(3));
        await USDT.connect(customer).approve(BondingEvent.address, amountOther.mul(3));
        await BondingEvent.connect(owner).bond(
          customer.address, amountSEuro, durations.ONE_WEEK, rates.FIVE_PC
        );
        await BondingEvent.connect(owner).bond(
          customer.address, amountSEuro, durations.TWO_WEEKS, rates.SIX_PC
        );
        await BondingEvent.connect(owner).bond(
          customer.address, amountSEuro, durations.FOUR_WEEKS, rates.TEN_PC
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

    describe('excess usdt', async () => {
      it('will transfer the excess usdt if there is a designated wallet', async () => {
        await BondingEvent.setExcessCollateralWallet(wallet.address);
        expect(await USDT.balanceOf(wallet.address)).to.equal(0);

        const amountSEuro = etherBalances.TWO_MILLION;
        const { amountOther } = await BondingEvent.getOtherAmount(amountSEuro);
        await SEuro.connect(customer).approve(BondingEvent.address, amountSEuro);
        await USDT.connect(customer).approve(BondingEvent.address, amountOther);
        await BondingEvent.connect(owner).bond(
          customer.address, amountSEuro, durations.ONE_YR_WEEKS, rates.TEN_PC,
        );

        expect(await USDT.balanceOf(wallet.address)).to.be.gt(0);
      });
    });
  });

  describe('liquidity positions', async () => {
    context('initialised default prices', async () => {
      beforeEach(async () => {
        await deployBondingEventWithDefaultPrices();
        await mintUsers();
        await readyTokenGateway();
      });

      it('creates a new one if there is not one for the position range', async () => {
        const amountSEuro = etherBalances.TWO_MILLION;
        const { amountOther } = await BondingEvent.getOtherAmount(amountSEuro);
        await SEuro.connect(customer).approve(BondingEvent.address, amountSEuro);
        await USDT.connect(customer).approve(BondingEvent.address, amountOther);
        await BondingEvent.connect(owner).bond(
          customer.address, amountSEuro, durations.ONE_YR_WEEKS, rates.TEN_PC,
        );
  
        const positions = await BondingEvent.getPositions();
        expect(positions).to.be.length(1);
        const position = await BondingEvent.getPositionData(positions[0]);
        expect(position.lowerTick).to.equal(pricing.lowerTick);
        expect(position.upperTick).to.equal(pricing.upperTick);
        expect(position.liquidity).to.be.gt(0);
      });
  
      it('adds liquidity to existing position if one exists', async () => {
        const amountSEuro = etherBalances.TWO_MILLION;
        const { amountOther } = await BondingEvent.getOtherAmount(amountSEuro);
        // approve twice as much as the bonding amount
        await SEuro.connect(customer).approve(BondingEvent.address, amountSEuro.mul(2));
        await USDT.connect(customer).approve(BondingEvent.address, amountOther.mul(2));
  
        await BondingEvent.connect(owner).bond(
          customer.address, amountSEuro, durations.ONE_YR_WEEKS, rates.TEN_PC,
        );
        let initialPositions = await BondingEvent.getPositions();
        const initialLiquidityTotal = (await BondingEvent.getPositionData(initialPositions[0])).liquidity;
        await BondingEvent.connect(owner).bond(
          customer.address, amountSEuro, durations.ONE_YR_WEEKS, rates.TEN_PC,
        );
  
        positions = await BondingEvent.getPositions();
        expect(positions).to.eql(initialPositions);
        const position = await BondingEvent.getPositionData(positions[0]);
        expect(position.lowerTick).to.equal(pricing.lowerTick);
        expect(position.upperTick).to.equal(pricing.upperTick);
        const expectedLiquidity = initialLiquidityTotal.mul(2);
        expect(position.liquidity).to.equal(expectedLiquidity);
      });
    });

    it('creates a different position if price is completely outside of default ticks', async () => {
      // initialise bonding event with price outside of default liquidity range
      // redeploy tokens so we can re-initialise pool
      // new tick will be at 4054 (or inverted)
      await deployBondingEvent(100, 150);
      await mintUsers();
      await readyTokenGateway();

      const amountSEuro = etherBalances.TWO_MILLION;
      const { amountOther } = await BondingEvent.getOtherAmount(amountSEuro);
      await SEuro.connect(customer).approve(BondingEvent.address, amountSEuro);
      await USDT.connect(customer).approve(BondingEvent.address, amountOther);

      await BondingEvent.connect(owner).bond(
        customer.address, amountSEuro, durations.ONE_YR_WEEKS, rates.TEN_PC,
      );

      const positions = await BondingEvent.getPositions();
      expect(positions).to.be.length(1);
      const position = await BondingEvent.getPositionData(positions[0]);
      // 1000 expansion to -1400 and 4000 (or inverted), doesn't suffice
      // 10000 expansion to -11400 and 14000 (or inverted), doesn't suffice
      // further 10000 expansion to -21400 and 24000 (or inverted), is sufficient buffer around current price tick (4054)
      const expectedMagnitude = 21000;
      expect(position.lowerTick).to.eq(pricing.lowerTick - expectedMagnitude);
      expect(position.upperTick).to.eq(pricing.upperTick + expectedMagnitude);
      expect(position.liquidity).to.be.gt(0);
    });

    it('creates a different position if price is near the edge of default ticks', async () => {
      // initialise bonding event with price outside near edge of liquidity range
      // redeploy tokens so we can re-initialise pool
      // new price tick will be at -305 (or inverted)
      await deployBondingEvent(100, 97);
      await mintUsers();
      await readyTokenGateway();

      const amountSEuro = etherBalances.TWO_MILLION;
      const { amountOther } = await BondingEvent.getOtherAmount(amountSEuro);
      await SEuro.connect(customer).approve(BondingEvent.address, amountSEuro);
      await USDT.connect(customer).approve(BondingEvent.address, amountOther);

      await BondingEvent.connect(owner).bond(
        customer.address, amountSEuro, durations.ONE_YR_WEEKS, rates.TEN_PC,
      );

      const positions = await BondingEvent.getPositions();
      expect(positions).to.be.length(1);
      const position = await BondingEvent.getPositionData(positions[0]);
      const expectedMagnitude = 7000;
      // moves tickets to -7400 and 10000 (or inverted), sufficient buffer around the current price tick (-305)
      expect(position.lowerTick).to.eq(pricing.lowerTick - expectedMagnitude);
      expect(position.upperTick).to.eq(pricing.upperTick + expectedMagnitude);
      expect(position.liquidity).to.be.gt(0);
    });

    it('expands the position right out to min / max tick, if pool price becomes extreme', async () => {
      // initialise bonding event with price tick very near to liquidity max tick
      // redeploy tokens so we can re-initialise pool
      // new price tick will be at 184217 (or inverted)
      await deployBondingEvent(1, BigNumber.from(10).pow(8));
      await mintUsers();
      // needs more minted because of the extreme price difference
      await USDT.connect(owner).mint(customer.address, etherBalances.HUNDRED_MILLION.mul(etherBalances.HUNDRED_MILLION));
      await readyTokenGateway();

      const amountSEuro = etherBalances.TWO_MILLION;
      const { amountOther } = await BondingEvent.getOtherAmount(amountSEuro);
      await SEuro.connect(customer).approve(BondingEvent.address, amountSEuro);
      await USDT.connect(customer).approve(BondingEvent.address, amountOther);

      await BondingEvent.connect(owner).bond(
        customer.address, amountSEuro, durations.ONE_YR_WEEKS, rates.TEN_PC,
      );

      const positions = await BondingEvent.getPositions();
      expect(positions).to.be.length(1);
      const position = await BondingEvent.getPositionData(positions[0]);
      expect(position.lowerTick).to.eq(MIN_TICK);
      expect(position.upperTick).to.eq(MAX_TICK);
      expect(position.liquidity).to.be.gt(0);
    });
  });

  //
  //
  //
  // --------------------------------------
  // TODO:
  // - test a second position is created if price moves after initialisation
  // - make sure the principals / profits on bonds are correct, and based on both amounts sent in
  // - fee collection?
  // - restrict position data to owner?
  // - transfer nfts?
  // --------------------------------------
  //
  //
  //
});
