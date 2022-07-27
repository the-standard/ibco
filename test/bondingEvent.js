const { ethers } = require('hardhat');
const { BigNumber } = ethers;
const { expect } = require('chai');
const bn = require('bignumber.js');
const { POSITION_MANAGER_ADDRESS, DECIMALS, etherBalances, rates, durations, ONE_WEEK_IN_SECONDS, MOST_STABLE_FEE, STABLE_TICK_SPACING, STANDARD_TOKENS_PER_EUR, encodePriceSqrt, helperFastForwardTime, MAX_TICK, MIN_TICK } = require('./common.js');

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 })

let owner, customer, wallet, SEuro, TST, USDT, BondingEvent, BondStorage, TokenGateway, BondingEventContract, RatioCalculator, pricing, SwapManager;

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

  const isSEuroToken0 = () => {
    return SEuro.address.toLowerCase() < USDT.address.toLowerCase();
  }

  const deployBondingEvent = async (reserveSEuro, reserveOther) => {
    // tick -400 approx. 0.96 USDT per SEUR
    // tick 3000 approx. 1.35 USDT per SEUR
    // 400 and -3000 are the inverse of these prices
    pricing = isSEuroToken0() ?
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

  const swap = async (tokenIn, tokenOut, amountIn) => {
    if (!SwapManager) {
      SwapManager = await (await ethers.getContractFactory('SwapManager')).deploy();
    }
    await tokenIn.approve(SwapManager.address, amountIn);
    await SwapManager.swap(tokenIn.address, tokenOut.address, amountIn, MOST_STABLE_FEE);
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

      it('creates a new position if there is not one for the range', async () => {
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

      it('creates a second position if the price moves after initialisation', async () => {
        // will create the first position
        let amountSEuro = etherBalances.TWO_MILLION;
        let { amountOther } = await BondingEvent.getOtherAmount(amountSEuro);
        await SEuro.connect(customer).approve(BondingEvent.address, amountSEuro);
        await USDT.connect(customer).approve(BondingEvent.address, amountOther);
        await BondingEvent.connect(owner).bond(
          customer.address, amountSEuro, durations.ONE_YR_WEEKS, rates.TEN_PC,
        );

        let positions = await BondingEvent.getPositions();
        expect(positions).to.be.length(1);
        let position = await BondingEvent.getPositionData(positions[0]);
        expect(position.lowerTick).to.equal(pricing.lowerTick);
        expect(position.upperTick).to.equal(pricing.upperTick);
        expect(position.liquidity).to.be.gt(0);

        // move the price to the edge of default tick range
        // moves current price tick to 909
        await swap(SEuro, USDT, etherBalances['100K'].mul(5));

        // bonding again will create a new position, as first one is not viable since price change
        amountSEuro = etherBalances.TWO_MILLION;
        ({ amountOther } = await BondingEvent.getOtherAmount(amountSEuro));
        await SEuro.connect(customer).approve(BondingEvent.address, amountSEuro);
        await USDT.connect(customer).approve(BondingEvent.address, amountOther);
        await BondingEvent.connect(owner).bond(
          customer.address, amountSEuro, durations.ONE_YR_WEEKS, rates.TEN_PC,
        );

        positions = await BondingEvent.getPositions();
        expect(positions).to.be.length(2);
        let secondPosition = await BondingEvent.getPositionData(positions[1]);
        // since swap, new tick is at 909 - shifting lower tick to -700 and upper to 3300 puts 909 at in middle 20%
        const expectedDiff = 300;
        expect(secondPosition.lowerTick).to.equal(pricing.lowerTick - expectedDiff);
        expect(secondPosition.upperTick).to.equal(pricing.upperTick + expectedDiff);
        expect(secondPosition.liquidity).to.be.gt(0);
      });
    });
  });

  describe('liquidity ratios', async () => {

    it('gives the default if current price in middle 20% between ticks', async () => {
      // sets the price tick at 199
      await deployBondingEvent(9802,10000);
      await mintUsers();
      await readyTokenGateway();
      const initialLower = -1000;
      const initialUpper = 1000;
      await BondingEvent.adjustTickDefaults(initialLower,initialUpper);

      // add some liquidity to pool, to allow some swapping;
      const amountSEuro = etherBalances.TWO_MILLION;
      const { amountOther } = await BondingEvent.getOtherAmount(amountSEuro);
      await SEuro.connect(customer).approve(BondingEvent.address, amountSEuro);
      await USDT.connect(customer).approve(BondingEvent.address, amountOther);
      await BondingEvent.connect(owner).bond(
        customer.address, amountSEuro, durations.ONE_YR_WEEKS, rates.TEN_PC,
      );

      for (let i = 0; i < 11; i++) {
        // initial current price tick is at 200, we move it towards -200 gradually (via swapping the seuro for the usdt liquidity in there)
        // we expect the lower and upper ticks to stay within +/- 1000, because +/- 200 is in the middle 20%
        const { lowerTick, upperTick } = await BondingEvent.getOtherAmount(amountSEuro);
        expect(lowerTick).to.equal(initialLower);
        expect(upperTick).to.equal(initialUpper);
        await swap(SEuro, USDT, etherBalances['100K']);
      }
    });

    it('gives a new tick range if current price outside of range of default ticks', async () => {
      // sets current price tick to 4054
      await deployBondingEvent(100, 150);
      const initialLower = -1000;
      const initialUpper = 1000;
      await BondingEvent.adjustTickDefaults(initialLower,initialUpper);
      const amountSEuro = etherBalances.TWO_MILLION;

      const { lowerTick, upperTick } = await BondingEvent.getOtherAmount(amountSEuro);

      // 1000 expansion to -2000 and 2000 (or inverted), doesn't suffice
      // 10000 expansion to -12000 and 12000 (or inverted), doesn't suffice
      // further 10000 expansion to -22000 and 22000 (or inverted), puts current price tick (4054) in middle 20% of tick range
      const expectedDiff = 21000;
      expect(lowerTick).to.eq(initialLower - expectedDiff);
      expect(upperTick).to.eq(initialUpper + expectedDiff);
    });

    it('gives a new tick range if current price outside of range of default ticks', async () => {
      // sets current price tick to -953
      await deployBondingEvent(110, 100);
      const initialLower = -1000;
      const initialUpper = 1000;
      await BondingEvent.adjustTickDefaults(initialLower,initialUpper);
      const amountSEuro = etherBalances.TWO_MILLION;

      const { lowerTick, upperTick } = await BondingEvent.getOtherAmount(amountSEuro);

      // 1000 expansion to -2000 and 2000 (or inverted), doesn't suffice
      // further 3000 expansion to -5000 and 5000 (or inverted), puts current price tick (953) in middle 20% of tick range
      const expectedDiff = 4000;
      expect(lowerTick).to.eq(initialLower - expectedDiff);
      expect(upperTick).to.eq(initialUpper + expectedDiff);
    });

    it('gives max limit tick range if current price is very extreme', async () => {
      // sets current price tick to 184216
      await deployBondingEvent(1, BigNumber.from(10).pow(8));
      const initialLower = -1000;
      const initialUpper = 1000;
      await BondingEvent.adjustTickDefaults(initialLower,initialUpper);
      const amountSEuro = etherBalances.TWO_MILLION;

      const { lowerTick, upperTick } = await BondingEvent.getOtherAmount(amountSEuro);

      // the closest the tick range can get to putting the current price tick (184216) in the middle 20%
      // is by setting upper and lower ticks to the limit
      expect(lowerTick).to.eq(MIN_TICK);
      expect(upperTick).to.eq(MAX_TICK);
    })
  });

  describe('retracting liquidity', async () => {
    beforeEach(async () => {
      await deployBondingEventWithDefaultPrices();
      await mintUsers();
      await readyTokenGateway();
    });

    it('sends all liquidity - plus fees - to designated collateral wallet, given a token ID', async () => {
      // create the first position
      let amountSEuro = etherBalances.TWO_MILLION;
      let { amountOther } = await BondingEvent.getOtherAmount(amountSEuro);
      await SEuro.connect(customer).approve(BondingEvent.address, amountSEuro);
      await USDT.connect(customer).approve(BondingEvent.address, amountOther);
      await BondingEvent.connect(owner).bond(
        customer.address, amountSEuro, durations.ONE_YR_WEEKS, rates.TEN_PC,
      );
      expect(await BondingEvent.getPositions()).to.be.length(1);

      // create some fees to collect and also moves the price so there will be more than one position
      await swap(SEuro, USDT, etherBalances['125K'].mul(5));

      // create a second position
      amountSEuro = etherBalances.TWO_MILLION;
      ({ amountOther } = await BondingEvent.getOtherAmount(amountSEuro));
      await SEuro.connect(customer).approve(BondingEvent.address, amountSEuro);
      await USDT.connect(customer).approve(BondingEvent.address, amountOther);
      await BondingEvent.connect(owner).bond(
        customer.address, amountSEuro, durations.ONE_YR_WEEKS, rates.TEN_PC,
      );
      const positions = await BondingEvent.getPositions();
      expect(positions).to.be.length(2);
      await swap(USDT, SEuro, etherBalances['125K'].mul(5));

      await expect(BondingEvent.clearPositionAndBurn(positions[0])).to.be.revertedWith('err-no-wallet-assigned');

      await BondingEvent.setExcessCollateralWallet(wallet.address);

      const collect = BondingEvent.clearPositionAndBurn(positions[0]);

      await expect(collect).not.to.be.reverted;
      // remove the liquidity position token
      await expect(await BondingEvent.getPositions()).to.be.length(1);
      // should emit the data about the collection
      await expect(collect).to.emit(BondingEvent, 'LiquidityCollected');
      const collectedData = (await (await collect).wait()).events.filter(e => e.event == 'LiquidityCollected')[0].args;
      // should transfer to the given collateral wallet
      const transferred = isSEuroToken0() ?
        {SEuro: collectedData.collectedTotal0, USDT: collectedData.collectedTotal1} :
        {SEuro: collectedData.collectedTotal1, USDT: collectedData.collectedTotal0};
      expect(await SEuro.balanceOf(wallet.address)).to.equal(transferred.SEuro);
      expect(await USDT.balanceOf(wallet.address)).to.equal(transferred.USDT);
      // fees should be generated
      expect(collectedData.feesCollected0).to.be.gt(0);
      expect(collectedData.feesCollected1).to.be.gt(0);
      expect(collectedData.collectedTotal0).to.eq(collectedData.retractedAmount0.add(collectedData.feesCollected0));
      expect(collectedData.collectedTotal1).to.eq(collectedData.retractedAmount1.add(collectedData.feesCollected1));
    });
  });
 
  //
  //
  //
  // --------------------------------------
  // TODO:
  // - make sure the principals / profits on bonds are correct, and based on both amounts sent in
  // - fee collection?
  // - restrict position data to owner?
  // - transfer nfts?
  // --------------------------------------
  //
  //
  //
});
