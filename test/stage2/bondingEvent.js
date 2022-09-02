const { ethers } = require('hardhat');
const { expect } = require('chai');
const { POSITION_MANAGER_ADDRESS, etherBalances, rates, durations, ONE_WEEK_IN_SECONDS, MOST_STABLE_FEE, STABLE_TICK_SPACING, encodePriceSqrt, helperFastForwardTime, MAX_TICK, MIN_TICK, format6Dec, scaleUpForDecDiff, CHAINLINK_DEC, DEFAULT_CHAINLINK_EUR_USD_PRICE, getLibraryFactory, eurToTST, defaultConvertUsdToEur } = require('../common.js');

let owner, customer, wallet, SEuro, TST, USDC, BondingEvent, BondStorage, TokenGateway, BondingEventContract, BondStorageContract, RatioCalculatorContract, RatioCalculator, pricing, SwapManager;

describe('BondingEvent', async () => {

  beforeEach(async () => {
    // add 12 to nullify dec diff between usdc and seuro
    const SCALED_UP_CHAINLINK_DEC = CHAINLINK_DEC + 12;
    [owner, customer, wallet] = await ethers.getSigners();
    BondingEventContract = await ethers.getContractFactory('BondingEvent');
    const ERC20Contract = await ethers.getContractFactory('DUMMY');
    BondStorageContract = await getLibraryFactory(owner, 'BondStorage');
    const TokenGatewayContract = await ethers.getContractFactory('StandardTokenGateway');
    RatioCalculatorContract = await ethers.getContractFactory('RatioCalculator');
    SEuro = await ERC20Contract.deploy('sEURO', 'SEUR', 18);
    TST = await ERC20Contract.deploy('TST', 'TST', 18);
    USDC = await ERC20Contract.deploy('USDC', 'USDC', 6);
    const ChainlinkEurUsd = await (await ethers.getContractFactory('Chainlink')).deploy(DEFAULT_CHAINLINK_EUR_USD_PRICE);
    TokenGateway = await TokenGatewayContract.deploy(TST.address);
    BondStorage = await BondStorageContract.deploy(TokenGateway.address, ChainlinkEurUsd.address, SCALED_UP_CHAINLINK_DEC);
    RatioCalculator = await RatioCalculatorContract.deploy();
  });

  const isSEuroToken0 = () => {
    return SEuro.address.toLowerCase() < USDC.address.toLowerCase();
  };

  const deployBondingEvent = async (reserveSEuro, reserveOther) => {
    // note: ticks represent that sEURO is 18dec and USDC is 6dec
    // tick 275300 approx. 1 USDC = 0.903 sEURO
    // tick 279000 approx. 1 USDC = 1.307 sEURO
    // -279000 and -275300 are the inverse of these prices
    pricing = isSEuroToken0() ?
      {
        initial: encodePriceSqrt(reserveOther, reserveSEuro),
        lowerTick: -279000,
        upperTick: -275300
      } :
      {
        initial: encodePriceSqrt(reserveSEuro, reserveOther),
        lowerTick: 275300,
        upperTick: 279000
      };

    BondingEvent = await BondingEventContract.deploy(
      SEuro.address, USDC.address, POSITION_MANAGER_ADDRESS, BondStorage.address,
      owner.address, RatioCalculator.address, pricing.initial, pricing.lowerTick,
      pricing.upperTick, MOST_STABLE_FEE
    );
  };

  const deployBondingEventWithDefaultPrices = async () => {
    await deployBondingEvent(scaleUpForDecDiff(123, 12), 100);
  };

  const mintUsers = async () => {
    await SEuro.connect(owner).mint(owner.address, etherBalances.ONE_BILLION);
    await SEuro.connect(owner).mint(customer.address, etherBalances.HUNDRED_MILLION);
    await USDC.connect(owner).mint(owner.address, etherBalances.ONE_BILLION);
    await USDC.connect(owner).mint(customer.address, etherBalances.HUNDRED_MILLION);
  };

  const readyDependencies = async () => {
    await TST.connect(owner).mint(TokenGateway.address, etherBalances.FIVE_HUNDRED_MILLION);
    await TokenGateway.connect(owner).updateRewardSupply();
    await TokenGateway.connect(owner).setStorageAddress(BondStorage.address);
    await BondStorage.grantRole(await BondStorage.WHITELIST_BOND_STORAGE(), BondingEvent.address);
  };

  const swap = async (tokenIn, tokenOut, amountIn) => {
    if (!SwapManager) {
      SwapManager = await (await ethers.getContractFactory('SwapManager')).deploy();
    }
    await tokenIn.approve(SwapManager.address, amountIn);
    await SwapManager.swap(tokenIn.address, tokenOut.address, amountIn, MOST_STABLE_FEE);
  };

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
      await readyDependencies();
    });

    const helperGetActiveBonds = async () => {
      return await BondStorage.getActiveBonds(customer.address);
    };

    const helperGetBondAt = async (index) => {
      return await BondStorage.getBondAt(customer.address, index);
    };

    const helperGetProfit = async () => {
      return await BondStorage.getProfit(customer.address);
    };

    describe('calculating ratio', async () => {
      it('calculates the required amount of USDC for given sEURO', async () => {
        const amountSEuro = etherBalances['10K'];
        let { amountOther } = (await BondingEvent.getOtherAmount(amountSEuro));
        amountOther = format6Dec(amountOther);
        // comes from uniswap ui
        const expectedUSDC = 5970;
        expect(amountOther).to.equal(expectedUSDC);
      });
    });

    describe('tick defaults', async () => {
      it('updates lower and upper default ticks', async () => {
        const { lowerTick, upperTick } = pricing;

        await expect(BondingEvent.connect(customer).adjustTickDefaults(-10, 10)).to.be.revertedWith('invalid-pool-owner');
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
      });
    });

    async function testStartBond(seuroAmount, duration, rateFormat, otherContract) {
      const { amountOther } = await BondingEvent.getOtherAmount(seuroAmount);
      await SEuro.connect(customer).approve(BondingEvent.address, seuroAmount);
      await otherContract.connect(customer).approve(BondingEvent.address, amountOther);
      await BondingEvent.connect(owner).bond(
        customer.address, seuroAmount, duration, rateFormat,
      );
      return amountOther;
    }

    const verifyExpectedProfit = async (seuroProfit, otherProfit) => {
      const expectedProfit = eurToTST(seuroProfit).add(eurToTST(usdcToSeuro(otherProfit)));
      expect(await helperGetProfit()).to.eq(expectedProfit);
    }

    const usdcToSeuro = amount => {
      return defaultConvertUsdToEur(scaleUpForDecDiff(amount, 12));
    }

    describe('bond', async () => {
      it('bonds sEURO and USDC for 52 weeks and receives correct seuro profit', async () => {
        const amountSeuro = etherBalances.TWO_MILLION;
        const amountOther = await testStartBond(amountSeuro, durations.ONE_YR,
          rates.TEN_PC, USDC
        );

        const bondsAmount = await helperGetActiveBonds();
        expect(bondsAmount).to.equal(1);

        const firstBond = await helperGetBondAt(0);
        let seuroPrincipal = firstBond.principalSeuro;
        let otherPrincipal = firstBond.principalOther;
        let actualRate = firstBond.rate;
        expect(seuroPrincipal).to.equal(amountSeuro);
        expect(otherPrincipal).to.equal(amountOther);
        expect(actualRate).to.equal(rates.TEN_PC);

        await helperFastForwardTime(52 * ONE_WEEK_IN_SECONDS);

        const seuroProfit = amountSeuro.div(10);
        const usdcProfit = amountOther.div(10);
        await verifyExpectedProfit(seuroProfit, usdcProfit);
      });

      it('bonds with an amount less than one million and receives correct seuro profit', async () => {
        const amountSeuro = etherBalances['100K'];
        const amountOther = await testStartBond(amountSeuro, durations.ONE_WEEK,
          rates.TEN_PC, USDC
        );

        const bondsAmount = await helperGetActiveBonds();
        expect(bondsAmount).to.equal(1);

        const firstBond = await helperGetBondAt(0);
        let seuroPrincipal = firstBond.principalSeuro;
        let otherPrincipal = firstBond.principalOther;
        let actualRate = firstBond.rate;
        expect(seuroPrincipal).to.equal(amountSeuro);
        expect(otherPrincipal).to.equal(amountOther);
        expect(actualRate).to.equal(rates.TEN_PC);

        await helperFastForwardTime(ONE_WEEK_IN_SECONDS);

        const seuroProfit = amountSeuro.div(10);
        const usdcProfit = amountOther.div(10);
        await verifyExpectedProfit(seuroProfit, usdcProfit);
      });

      it('bonds with an amount less than one hundred thousand and receives correct seuro profit', async () => {
        const amountSeuro = etherBalances['10K'];
        const amountOther = await testStartBond(amountSeuro, durations.ONE_WEEK,
          rates.SIX_PC, USDC
        );

        await helperFastForwardTime(ONE_WEEK_IN_SECONDS);

        const seuroProfit = amountSeuro.mul(6).div(100);
        const usdcProfit = amountOther.mul(6).div(100);
        await verifyExpectedProfit(seuroProfit, usdcProfit);
      });

      it('bonds multiple times with various maturities and updates active and inactive bonds correctly', async () => {
        const amountSeuro = etherBalances.TWO_MILLION;
        const { amountOther } = await BondingEvent.getOtherAmount(amountSeuro);
        await SEuro.connect(customer).approve(BondingEvent.address, amountSeuro.mul(3));
        await USDC.connect(customer).approve(BondingEvent.address, amountOther.mul(3));
        await BondingEvent.connect(owner).bond(
          customer.address, amountSeuro, durations.ONE_WEEK, rates.FIVE_PC
        );
        await BondingEvent.connect(owner).bond(
          customer.address, amountSeuro, durations.TWO_WEEKS, rates.SIX_PC
        );
        await BondingEvent.connect(owner).bond(
          customer.address, amountSeuro, durations.FOUR_WEEKS, rates.TEN_PC
        );

        let expectedActiveBonds = 3;
        let actualActiveBonds = await helperGetActiveBonds();
        expect(actualActiveBonds).to.equal(expectedActiveBonds);

        let expectedProfit = '0';
        expect((await helperGetProfit()).toString()).to.equal(expectedProfit);

        await helperFastForwardTime(ONE_WEEK_IN_SECONDS);

        let seuroProfit = amountSeuro.div(20);
        let usdcProfit = amountOther.div(20);
        expectedProfit = eurToTST(seuroProfit).add(eurToTST(usdcToSeuro(usdcProfit)));
        expect(await helperGetProfit()).to.eq(expectedProfit);

        await helperFastForwardTime(ONE_WEEK_IN_SECONDS);

        seuroProfit = amountSeuro.mul(6).div(100);
        usdcProfit = amountOther.mul(6).div(100);
        expectedProfit = expectedProfit.add(eurToTST(seuroProfit).add(eurToTST(usdcToSeuro(usdcProfit))));
        expect(await helperGetProfit()).to.eq(expectedProfit);

        await helperFastForwardTime(2 * ONE_WEEK_IN_SECONDS);

        seuroProfit = amountSeuro.div(10);
        usdcProfit = amountOther.div(10);
        expectedProfit = expectedProfit.add(eurToTST(seuroProfit).add(eurToTST(usdcToSeuro(usdcProfit))));
        expect(await helperGetProfit()).to.eq(expectedProfit);
      });
    });

    describe('excess seuro', async () => {
      it('will transfer the excess sEURO if there is a designated wallet', async () => {
        // difficult to test transfer of excess USDC, because it would require a mid-transaction price slip
        await BondingEvent.setExcessCollateralWallet(wallet.address);
        expect(await SEuro.balanceOf(wallet.address)).to.equal(0);

        await testStartBond(etherBalances.TWO_MILLION, durations.ONE_YR,
          rates.TEN_PC, USDC
        );

        expect(await SEuro.balanceOf(wallet.address)).to.be.gt(0);
      });
    });
  });

  describe('liquidity positions', async () => {
    context('initialised with price in middle 20%', async () => {
      beforeEach(async () => {
        await deployBondingEvent(scaleUpForDecDiff(112, 12), 100);
        await mintUsers();
        await readyDependencies();
      });

      it('creates a new position if there is not one for the range', async () => {
        const amountSEuro = etherBalances.TWO_MILLION;
        const { amountOther } = await BondingEvent.getOtherAmount(amountSEuro);
        await SEuro.connect(customer).approve(BondingEvent.address, amountSEuro);
        await USDC.connect(customer).approve(BondingEvent.address, amountOther);
        await BondingEvent.connect(owner).bond(
          customer.address, amountSEuro, durations.ONE_YR, rates.TEN_PC,
        );

        const positions = await BondingEvent.getPositions();
        expect(positions).to.be.length(1);
        const { position } = await BondingEvent.getPositionByTokenId(positions[0].tokenId);
        expect(position.lowerTick).to.equal(pricing.lowerTick);
        expect(position.upperTick).to.equal(pricing.upperTick);
        expect(position.liquidity).to.be.gt(0);
      });

      it('adds liquidity to existing position if one exists', async () => {
        const amountSEuro = etherBalances.TWO_MILLION;
        const { amountOther } = await BondingEvent.getOtherAmount(amountSEuro);
        // approve twice as much as the bonding amount
        await SEuro.connect(customer).approve(BondingEvent.address, amountSEuro.mul(2));
        await USDC.connect(customer).approve(BondingEvent.address, amountOther.mul(2));

        await BondingEvent.connect(owner).bond(
          customer.address, amountSEuro, durations.ONE_YR, rates.TEN_PC,
        );
        let initialPositions = await BondingEvent.getPositions();
        const initialLiquidityTotal = (await BondingEvent.getPositionByTokenId(initialPositions[0].tokenId)).position.liquidity;
        await BondingEvent.connect(owner).bond(
          customer.address, amountSEuro, durations.ONE_YR, rates.TEN_PC,
        );

        positions = await BondingEvent.getPositions();
        expect(positions.length).to.equal(1);
        const { position } = await BondingEvent.getPositionByTokenId(positions[0].tokenId);
        expect(position.tokenId).to.equal(initialPositions[0].tokenId);
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
        await USDC.connect(customer).approve(BondingEvent.address, amountOther);
        await BondingEvent.connect(owner).bond(
          customer.address, amountSEuro, durations.ONE_YR, rates.TEN_PC,
        );

        let positions = await BondingEvent.getPositions();
        expect(positions).to.be.length(1);
        let { position } = await BondingEvent.getPositionByTokenId(positions[0].tokenId);
        expect(position.lowerTick).to.equal(pricing.lowerTick);
        expect(position.upperTick).to.equal(pricing.upperTick);
        expect(position.liquidity).to.be.gt(0);

        // move the price price outside of middle 20%
        // moves current price tick to 277962
        await swap(SEuro, USDC, etherBalances['100K'].mul(5));

        // bonding again will create a new position, as first one is not viable since price change
        amountSEuro = etherBalances.TWO_MILLION;
        ({ amountOther } = await BondingEvent.getOtherAmount(amountSEuro));
        await SEuro.connect(customer).approve(BondingEvent.address, amountSEuro);
        await USDC.connect(customer).approve(BondingEvent.address, amountOther);
        await BondingEvent.connect(owner).bond(
          customer.address, amountSEuro, durations.ONE_YR, rates.TEN_PC,
        );

        positions = await BondingEvent.getPositions();
        expect(positions).to.be.length(2);
        ({ position } = await BondingEvent.getPositionByTokenId(positions[1].tokenId));
        // since swap, new tick is at 277962 - shifting lower tick to 272300 and upper to 282000 puts at in middle 20%
        const expectedDiff = 3000;
        expect(position.lowerTick).to.equal(pricing.lowerTick - expectedDiff);
        expect(position.upperTick).to.equal(pricing.upperTick + expectedDiff);
        expect(position.liquidity).to.be.gt(0);
      });
    });
  });

  describe('liquidity ratios', async () => {

    it('gives the default if current price in middle 20% between ticks', async () => {
      // puts price tick at 276812, between 40th + 60th percentile between 275300 and 279000 ticks
      await deployBondingEvent(scaleUpForDecDiff(105, 12), 100);
      await mintUsers();
      await readyDependencies();

      // add some liquidity to pool, to allow some swapping;
      const amountSEuro = etherBalances.TWO_MILLION;
      const { amountOther } = await BondingEvent.getOtherAmount(amountSEuro);
      await SEuro.connect(customer).approve(BondingEvent.address, amountSEuro);
      await USDC.connect(customer).approve(BondingEvent.address, amountOther);
      await BondingEvent.connect(owner).bond(
        customer.address, amountSEuro, durations.ONE_YR, rates.TEN_PC,
      );

      for (let i = 0; i < 10; i++) {
        // initial current price tick is at 276812, swap 100k sEURO at a time and it stays within middle 20%
        // so no new position created
        const { lowerTick, upperTick } = await BondingEvent.getOtherAmount(amountSEuro);
        expect(lowerTick).to.equal(pricing.lowerTick);
        expect(upperTick).to.equal(pricing.upperTick);
        await swap(SEuro, USDC, etherBalances['100K']);
      }
    });

    it('gives a new tick range if current price outside of range of default ticks', async () => {
      // sets current price tick to 279025, outside of ticks 275300 and 279000
      await deployBondingEvent(scaleUpForDecDiff(131, 12), 100);
      const amountSEuro = etherBalances.TWO_MILLION;

      const { lowerTick, upperTick } = await BondingEvent.getOtherAmount(amountSEuro);

      // 8000 expansion to 267300 and 287000 satisfies 40th - 60th percentile buffer
      const expectedDiff = 8000;
      expect(lowerTick).to.eq(pricing.lowerTick - expectedDiff);
      expect(upperTick).to.eq(pricing.upperTick + expectedDiff);
    });

    it('gives a new tick range if current price close to edge of tick range', async () => {
      // sets current price tick to 278556, narrowly inside ticks 275300 and 279000
      await deployBondingEvent(scaleUpForDecDiff(125, 12), 100);
      const amountSEuro = etherBalances.TWO_MILLION;

      const { lowerTick, upperTick } = await BondingEvent.getOtherAmount(amountSEuro);

      // 6000 expansion to 269300 and 285000 satisfies 40th - 60th percentile buffer
      const expectedDiff = 6000;
      expect(lowerTick).to.eq(pricing.lowerTick - expectedDiff);
      expect(upperTick).to.eq(pricing.upperTick + expectedDiff);
    });

    it('gives max limit tick range if current price is very extreme', async () => {
      // sets current price tick to 508826
      await deployBondingEvent(scaleUpForDecDiff(125, 20), 1);
      const amountSEuro = etherBalances.TWO_MILLION;

      const { lowerTick, upperTick } = await BondingEvent.getOtherAmount(amountSEuro);

      // the closest the tick range can get to putting the current price tick (508826) in the middle 20%
      // is by setting upper and lower ticks to the limit
      expect(lowerTick).to.eq(MIN_TICK);
      expect(upperTick).to.eq(MAX_TICK);
    });
  });

  describe('retracting liquidity', async () => {
    beforeEach(async () => {
      await deployBondingEventWithDefaultPrices();
      await mintUsers();
      await readyDependencies();
    });

    it('sends all liquidity - plus fees - to designated collateral wallet, given a token ID', async () => {
      // create the first position
      let amountSEuro = etherBalances.TWO_MILLION;
      let { amountOther } = await BondingEvent.getOtherAmount(amountSEuro);
      await SEuro.connect(customer).approve(BondingEvent.address, amountSEuro);
      await USDC.connect(customer).approve(BondingEvent.address, amountOther);
      await BondingEvent.connect(owner).bond(
        customer.address, amountSEuro, durations.ONE_YR, rates.TEN_PC,
      );
      expect(await BondingEvent.getPositions()).to.be.length(1);

      // create some fees to collect and also moves the price so there will be more than one position
      await swap(SEuro, USDC, etherBalances['125K'].mul(5));

      // create a second position
      amountSEuro = etherBalances.TWO_MILLION;
      ({ amountOther } = await BondingEvent.getOtherAmount(amountSEuro));
      await SEuro.connect(customer).approve(BondingEvent.address, amountSEuro);
      await USDC.connect(customer).approve(BondingEvent.address, amountOther);
      await BondingEvent.connect(owner).bond(
        customer.address, amountSEuro, durations.ONE_YR, rates.TEN_PC,
      );
      const positions = await BondingEvent.getPositions();
      expect(positions).to.be.length(2);
      await swap(USDC, SEuro, etherBalances['125K'].mul(5));

      await expect(BondingEvent.clearPositionAndBurn(positions[0].tokenId)).to.be.revertedWith('err-no-wallet-assigned');

      await BondingEvent.setExcessCollateralWallet(wallet.address);

      const collect = BondingEvent.clearPositionAndBurn(positions[0].tokenId);

      await expect(collect).not.to.be.reverted;
      // remove the liquidity position token
      await expect(await BondingEvent.getPositions()).to.be.length(1);
      // should emit the data about the collection
      await expect(collect).to.emit(BondingEvent, 'LiquidityCollected');
      const collectedData = (await (await collect).wait()).events.filter(e => e.event == 'LiquidityCollected')[0].args;
      // should transfer to the given collateral wallet
      const transferred = isSEuroToken0() ?
        { SEuro: collectedData.collectedTotal0, USDC: collectedData.collectedTotal1 } :
        { SEuro: collectedData.collectedTotal1, USDC: collectedData.collectedTotal0 };
      expect(await SEuro.balanceOf(wallet.address)).to.equal(transferred.SEuro);
      expect(await USDC.balanceOf(wallet.address)).to.equal(transferred.USDC);
      // fees should be generated
      expect(collectedData.feesCollected0).to.be.gt(0);
      expect(collectedData.feesCollected1).to.be.gt(0);
      expect(collectedData.collectedTotal0).to.eq(collectedData.retractedAmount0.add(collectedData.feesCollected0));
      expect(collectedData.collectedTotal1).to.eq(collectedData.retractedAmount1.add(collectedData.feesCollected1));
    });
  });

  describe('dependencies', async () => {
    it('allows the owner to update the dependencies', async () => {
      await deployBondingEventWithDefaultPrices();
      const newStorage = await BondStorageContract.deploy(ethers.constants.AddressZero, ethers.constants.AddressZero, 0);
      const newOperator = await (await ethers.getContractFactory('OperatorStage2')).deploy();
      const newCalculator = await (await ethers.getContractFactory('RatioCalculator')).deploy();

      let setStorage = BondingEvent.connect(customer).setStorageContract(newStorage.address);
      let setOperator = BondingEvent.connect(customer).setOperator(newOperator.address);
      let setCalculator = BondingEvent.connect(customer).setRatioCalculator(newCalculator.address);
      await expect(setStorage).to.be.revertedWith('invalid-pool-owner');
      await expect(setOperator).to.be.revertedWith('invalid-pool-owner');
      await expect(setCalculator).to.be.revertedWith('invalid-pool-owner');
      expect(await BondingEvent.bondStorageAddress()).to.equal(BondStorage.address);
      expect(await BondingEvent.operatorAddress()).to.equal(owner.address);
      expect(await BondingEvent.ratioCalculator()).to.equal(RatioCalculator.address);

      setStorage = BondingEvent.connect(owner).setStorageContract(newStorage.address);
      setOperator = BondingEvent.connect(owner).setOperator(newOperator.address);
      setCalculator = BondingEvent.connect(owner).setRatioCalculator(newCalculator.address);
      await expect(setStorage).not.to.be.reverted;
      await expect(setOperator).not.to.be.reverted;
      await expect(setCalculator).not.to.be.reverted;
      expect(await BondingEvent.bondStorageAddress()).to.equal(newStorage.address);
      expect(await BondingEvent.operatorAddress()).to.equal(newOperator.address);
      expect(await BondingEvent.ratioCalculator()).to.equal(newCalculator.address);
    });
  });
});
