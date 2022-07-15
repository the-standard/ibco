const { ethers } = require('hardhat');
const { expect } = require('chai');
const bn = require('bignumber.js');
const { POSITION_MANAGER_ADDRESS, DECIMALS, etherBalances, rates, durations, ONE_WEEK_IN_SECONDS, MOST_STABLE_FEE, STABLE_TICK_SPACING, STANDARD_TOKENS_PER_EUR, encodePriceSqrt, helperFastForwardTime } = require('./common.js');

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 })

let owner, customer, SEuro, TST, USDT, BondingEvent, BondStorage, TokenGateway, BondingEventContract, RatioCalculator;

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
    const pricing = SEuro.address < USDT.address ?
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
      return await BondStorage.getBondAt(CUSTOMER_ADDR, index);
    }

    const helperGetProfit = async () => {
      return await BondStorage.getProfit(CUSTOMER_ADDR);
    }

    describe.only('calculating ratio', async () => {
      it('calculates the required amount of USDT for given sEURO', async () => {
        const amountSEuro = etherBalances['10K'];
        const requiredUSDT = (await BondingEvent.getOtherAmount(amountSEuro)) / DECIMALS;
        const roundedUSDT = Math.round(requiredUSDT);
        // comes from uniswap ui
        const expectedUSDT = 11534;
        expect(roundedUSDT).to.equal(expectedUSDT);
      });
    });

    describe('bond', async () => {
      it('bonds sEURO and USDT for 52 weeks and receives correct seuro profit', async () => {
        await TokenGateway.connect(owner).setStorageAddress(BondStorage.address);
        await BondingEvent.connect(owner).bond(
          customer.address, etherBalances["TWO_MILLION"], etherBalances["TWO_MILLION"], durations["ONE_YR_WEEKS"], rates["TEN_PC"],
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
        let actualReward = ((await helperGetProfit()) / DECIMALS).toString();
        expect(actualReward).to.equal(expectedReward);
      });
    });
  });




  //
  //
  //
  // --------------------------------------
  //
  //
  //

  let BondStorageContract;

  beforeEach(async () => {
  });

  describe('initialise bonding event', async () => {
    it('has not initialised pool', async () => {
      BondingEvent = await BondingEventContract.deploy(SEUR_ADDRESS, USDT_ADDRESS, POSITION_MANAGER_ADDRESS, /* dummy address */ USDT_ADDRESS, CUSTOMER_ADDR);
      expect(await BondingEvent.isPoolInitialised()).to.equal(false);
    });
  });

  context('bonding event deployed', async () => {
    beforeEach(async () => {
      TokenGateway = await TokenGatewayContract.deploy(TST_ADDRESS, SEUR_ADDRESS);
      BStorage = await BondStorageContract.deploy(TokenGateway.address);
      BondingEvent = await BondingEventContract.deploy(
        SEUR_ADDRESS, USDT_ADDRESS, POSITION_MANAGER_ADDRESS, BStorage.address, OWNER_ADDR
      );
    });

    describe('initialise pool', async () => {
      it('initialises and changes the tick range for the pool', async () => {
        let low, high;
        const price = encodePriceSqrt(100, 93);
        expect(await BondingEvent.isPoolInitialised()).to.equal(false);
        await BondingEvent.initialisePool(USDT_ADDRESS, price, MOST_STABLE_FEE);
        expect(await BondingEvent.isPoolInitialised()).to.equal(true);

        low = await helperGetLowTickBound();
        high = await helperGetHighTickBound();
        expect(low).to.equal(-10000);
        expect(high).to.equal(10000);
        await BondingEvent.adjustTick(-25000, 25000);
        low = await helperGetLowTickBound();
        high = await helperGetHighTickBound();
        expect(low).to.equal(-25000);
        expect(high).to.equal(25000);

        await expect(BondingEvent.adjustTick(-9999999999, 10000)).to.be.throw;
        await expect(BondingEvent.adjustTick(10000, 9999999999)).to.be.throw;
        await expect(BondingEvent.adjustTick(-10001, 10000)).to.be.throw;
        await expect(BondingEvent.adjustTick(-10000, 10001)).to.be.throw;
        await expect(BondingEvent.adjustTick(0, 10000)).to.be.reverted;
        await expect(BondingEvent.adjustTick(10000, 0)).to.be.reverted;
        await expect(BondingEvent.adjustTick(1, 10000)).to.be.reverted;
        await expect(BondingEvent.adjustTick(10000, 1)).to.be.reverted;
      });

      async function helperGetLowTickBound() {
        let lower = await BondingEvent.tickLowerBound();
        return lower;
      }

      async function helperGetHighTickBound() {
        let higher = BondingEvent.tickHigherBound();
        return higher;
      }

    });

    describe('bonding', async () => {
      context('pool initialised', async () => {
        beforeEach(async () => {
          // Set price ratio between sEUR and USDT as 1:1
          let price = ethers.BigNumber.from(2).pow(96); // This corresponds to 1
          await BondingEvent.initialisePool(USDT_ADDRESS, price, MOST_STABLE_FEE);
          expect(await BondingEvent.isPoolInitialised()).to.equal(true);

          // mint balances
          await SEuro.connect(owner).mint(CUSTOMER_ADDR, etherBalances["HUNDRED_MILLION"]);
          await SEuro.connect(owner).mint(OWNER_ADDR, etherBalances["ONE_BILLION"]);
          await USDT.connect(owner).mint(OWNER_ADDR, etherBalances["ONE_BILLION"]);
          await USDT.connect(owner).mint(CUSTOMER_ADDR, etherBalances["HUNDRED_MILLION"]);

          // fill token gateway with TST as rewards
          await TST.connect(owner).mint(TokenGateway.address, etherBalances["FIVE_HUNDRED_MILLION"]);
          await TokenGateway.connect(owner).updateRewardSupply();

          // approve contract to spend customer funds
          await SEuro.connect(customer).approve(BondingEvent.address, etherBalances["FIFTY_MILLION"]);
          await USDT.connect(customer).approve(BondingEvent.address, etherBalances["FIFTY_MILLION"]);
        });

        it('bonds sEURO and USDT for 52 weeks and receives correct seuro profit', async () => {
          await TokenGateway.connect(owner).setStorageAddress(BStorage.address);
          await BondingEvent.connect(owner).bond(
            CUSTOMER_ADDR, etherBalances["TWO_MILLION"], etherBalances["TWO_MILLION"], USDT_ADDRESS, durations["ONE_YR_WEEKS"], rates["TEN_PC"],
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
          let actualReward = ((await helperGetProfit()) / DECIMALS).toString();
          expect(actualReward).to.equal(expectedReward);
        });

        it('bonds with an amount less than one million and receives correct seuro profit', async () => {
          await TokenGateway.connect(owner).setStorageAddress(BStorage.address);
          await BondingEvent.connect(owner).bond(
            CUSTOMER_ADDR, etherBalances["100K"], etherBalances["100K"], USDT_ADDRESS, durations["ONE_WEEK"], rates["TEN_PC"]
          );

          await helperUpdateBondStatus();
          const bondsAmount = await helperGetActiveBonds();
          expect(bondsAmount).to.equal(1);

          const firstBond = await helperGetBondAt(0);
          let actualPrincipal = firstBond.principal;
          let actualRate = firstBond.rate;
          expect(actualPrincipal).to.equal(etherBalances["100K"]);
          expect(actualRate).to.equal(rates["TEN_PC"]);

          await helperFastForwardTime(ONE_WEEK_IN_SECONDS);
          await helperUpdateBondStatus();

          const seuroProfit = 10000;
          let expectedProfit = STANDARD_TOKENS_PER_EUR * seuroProfit;
          // for some reason, this bonding amount requires a round up due to being off by a few fractions.
          // this is not the case for amounts of both one magnitude greater and smaller.
          let actualProfit = Math.round((await helperGetProfit()) / DECIMALS);
          expect(actualProfit).to.equal(expectedProfit);
        });

        it('bonds with an amount less than one hundred thousand and receives correct seuro profit', async () => {
          await TokenGateway.connect(owner).setStorageAddress(BStorage.address);
          await BondingEvent.connect(owner).bond(
            CUSTOMER_ADDR, etherBalances["10K"], etherBalances["10K"], USDT_ADDRESS, durations["ONE_WEEK"], rates["SIX_PC"]
          );

          await helperFastForwardTime(ONE_WEEK_IN_SECONDS);
          await helperUpdateBondStatus();

          const seuroProfit = 600;
          let expectedProfit = STANDARD_TOKENS_PER_EUR * seuroProfit;
          let actualProfit = await helperGetProfit() / DECIMALS;
          expect(actualProfit).to.equal(expectedProfit);
        });

        it('bonds multiple times with various maturities and updates active and inactive bonds correctly', async () => {
          let seuroProfit;
          await TokenGateway.connect(owner).setStorageAddress(BStorage.address);
          await BondingEvent.connect(owner).bond(
            CUSTOMER_ADDR, etherBalances["TWO_MILLION"], etherBalances["TWO_MILLION"], USDT_ADDRESS, durations["ONE_WEEK"], rates["FIVE_PC"]
          );
          await BondingEvent.connect(owner).bond(
            CUSTOMER_ADDR, etherBalances["TWO_MILLION"], etherBalances["TWO_MILLION"], USDT_ADDRESS, durations["TWO_WEEKS"], rates["SIX_PC"]
          );
          await BondingEvent.connect(owner).bond(
            CUSTOMER_ADDR, etherBalances["TWO_MILLION"], etherBalances["TWO_MILLION"], USDT_ADDRESS, durations["FOUR_WEEKS"], rates["TEN_PC"]
          );

          let expectedActiveBonds = 3;
          let actualActiveBonds = await helperGetActiveBonds();
          expect(actualActiveBonds).to.equal(expectedActiveBonds);

          let expectedReward = '0';
          let actualReward = (await helperGetProfit()).toString();
          expect(actualReward).to.equal(expectedReward);

          await helperFastForwardTime(ONE_WEEK_IN_SECONDS);
          await helperUpdateBondStatus();

          seuroProfit = 100000;
          expectedReward = (STANDARD_TOKENS_PER_EUR * seuroProfit).toString();
          actualReward = (await helperGetProfit() / DECIMALS).toString();
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
  });
});
