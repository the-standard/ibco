const { ethers } = require('hardhat');
const { expect } = require('chai');
const bn = require('bignumber.js');
const { POSITION_MANAGER_ADDRESS, etherBalances, rates, ONE_WEEK_IN_SECONDS, MOST_STABLE_FEE, helperFastForwardTime, DEFAULT_SQRT_PRICE, MIN_TICK, MAX_TICK, DEFAULT_CHAINLINK_EUR_USD_PRICE, CHAINLINK_DEC, defaultConvertUsdToEur, getLibraryFactory, eurToTST } = require('../common.js');
bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

let owner, customer, SEuro, TST, USDT;

beforeEach(async () => {
  [owner, customer] = await ethers.getSigners();
  const ERC20Contract = await ethers.getContractFactory('DUMMY');
  SEuro = await ERC20Contract.deploy('sEURO', 'sEUR', 18);
  USDT = await ERC20Contract.deploy('USDT', 'USDT', 6);
  TST = await ERC20Contract.deploy('TST', 'TST', 18);
});

const weeks = (amount) => {
  const week = 60 * 60 * 24 * 7;
  return amount * week;
}

describe('Stage 2', async () => {
  let BondingEventContract, BondingEvent, StorageContract, BStorage, TokenGatewayContract, TGateway, OperatorStage2, OP2, RatioCalculator;

  beforeEach(async () => {
    RatioCalculatorContract = await ethers.getContractFactory('RatioCalculator');
    BondingEventContract = await ethers.getContractFactory('BondingEvent');
    StorageContract = await getLibraryFactory(owner, 'BondStorage');
    TokenGatewayContract = await ethers.getContractFactory('StandardTokenGateway');
    OperatorStage2 = await ethers.getContractFactory('OperatorStage2');
  });

  context('operator contract deployed and connected', async () => {
    beforeEach(async () => {
      RatioCalculator = await RatioCalculatorContract.deploy();
      const ChainlinkEurUsd = await (await ethers.getContractFactory('Chainlink')).deploy(DEFAULT_CHAINLINK_EUR_USD_PRICE);
      TGateway = await TokenGatewayContract.deploy(TST.address);
      BStorage = await StorageContract.deploy(TGateway.address, ChainlinkEurUsd.address, CHAINLINK_DEC);
      BondingEvent = await BondingEventContract.deploy(
        SEuro.address, USDT.address, POSITION_MANAGER_ADDRESS, BStorage.address, owner.address,
        RatioCalculator.address, DEFAULT_SQRT_PRICE, MIN_TICK, MAX_TICK, MOST_STABLE_FEE
      );
      OP2 = await OperatorStage2.deploy();
      await BStorage.grantRole(await BStorage.WHITELIST_BOND_STORAGE(), BondingEvent.address);
      await BStorage.grantRole(await BStorage.WHITELIST_BOND_STORAGE(), OP2.address);
    });

    describe('bonding and rewards happy case, various pool prices', async () => {
      context('all stage 2 contracts deployed with an existing balance', async () => {
        beforeEach(async () => {
          await SEuro.connect(owner).mint(owner.address, etherBalances.ONE_BILLION);
          await USDT.connect(owner).mint(owner.address, etherBalances.ONE_BILLION);
          await SEuro.connect(owner).mint(customer.address, etherBalances.TWO_MILLION);
          await USDT.connect(owner).mint(customer.address, etherBalances.TWO_MILLION);
          await TST.connect(owner).mint(TGateway.address, etherBalances.FIVE_HUNDRED_MILLION);
          await TGateway.connect(owner).updateRewardSupply();
          await SEuro.connect(customer).approve(BondingEvent.address, etherBalances.TWO_MILLION);
          await USDT.connect(customer).approve(BondingEvent.address, etherBalances.TWO_MILLION);

          await TGateway.connect(owner).setStorageAddress(BStorage.address);
          await BondingEvent.connect(owner).setOperator(OP2.address);
          await OP2.connect(owner).setStorage(BStorage.address);
          await OP2.connect(owner).setBonding(BondingEvent.address);
        });

        async function customerBalance() {
          return (await TST.balanceOf(customer.address));
        }

        async function testingSuite(amountSeuro, inputRate, inputDurationWeeks) {
          const { amountOther } = await BondingEvent.getOtherAmount(amountSeuro);
          await OP2.connect(customer).newBond(amountSeuro, inputRate);

          await BStorage.connect(customer).refreshBondStatus(customer.address);

          let actualBalance = await customerBalance();
          expect(actualBalance).to.equal(0);

          let firstBond = await BStorage.getBondAt(customer.address, 0);
          let seuroPrincipal = firstBond.principalSeuro;
          let otherPrincipal = firstBond.principalOther;
          let rate = firstBond.rate;
          expect(seuroPrincipal).to.equal(amountSeuro);
          expect(otherPrincipal).to.equal(amountOther);
          expect(rate).to.equal(inputRate);

          if (inputDurationWeeks == 0) {
            inputDurationWeeks = 52;
          }

          await helperFastForwardTime(inputDurationWeeks * ONE_WEEK_IN_SECONDS);
          await BStorage.connect(customer).refreshBondStatus(customer.address);
          await BStorage.connect(customer).claimReward(customer.address);
          return {seuroPrincipal, otherPrincipal};
        }

        async function expectedTokBalance(seuroPrincipal, otherPrincipal, ratePc) {
          let payoutSeuro = seuroPrincipal.mul(100 + ratePc).div(100);
          let payoutOther = otherPrincipal.mul(100 + ratePc).div(100);
          let expectedStandardBal = eurToTST(payoutSeuro).add(eurToTST(defaultConvertUsdToEur(payoutOther)));
          let actualStandardBal = await customerBalance();
          expect(actualStandardBal).to.equal(expectedStandardBal);
        }

        it('transfers TST rewards successfully when bonding', async () => {
          await OP2.connect(owner).addRate(rates.TWENTY_PC, weeks(1));
          const {seuroPrincipal, otherPrincipal} = await testingSuite(etherBalances['125K'], rates.TWENTY_PC, 1);
          await expectedTokBalance(seuroPrincipal, otherPrincipal, 20);
        });

        it('reverts when trying to bond with a non-added rate', async () => {
          let threePercent = 3000;
          let arbitraryWeeks = 36;
          await expect(testingSuite(etherBalances['125K'], threePercent, arbitraryWeeks)).to.be.revertedWith('err-rate-not-found');
        });

        it('adds and subtracts multiple new rates to grow and shrink the set of accepted rates', async () => {
          let expectedRates, actualRates;
          await OP2.connect(owner).addRate(rates.FIVE_PC, weeks(10));
          await OP2.connect(owner).addRate(rates.TEN_PC, weeks(20));
          await OP2.connect(owner).addRate(rates.TWENTY_PC, weeks(40));

          expectedRates = 3;
          actualRates = (await OP2.showRates()).length;
          expect(actualRates).to.equal(expectedRates);
          
          const invalidRemoval = OP2.removeRate(4);
          await expect(invalidRemoval).to.be.revertedWith('err-rate-not-found')
          await OP2.removeRate(rates.TWENTY_PC);
          await OP2.removeRate(rates.TEN_PC);
          expectedRates = 1;
          actualRates = (await OP2.showRates()).length;
          expect(actualRates).to.equal(expectedRates);
        });

        it('adds a rate and bonds successfully, then removes it such that following bonding fails', async () => {
          await OP2.connect(owner).addRate(rates.FIVE_PC, weeks(10));
          await testingSuite(etherBalances['125K'], rates.FIVE_PC, 10);
          await OP2.connect(owner).removeRate(rates.FIVE_PC);
          await expect(testingSuite(etherBalances['125K'], rates.FIVE_PC, 10)).to.be.revertedWith('err-rate-not-found');
        });
      });
    });

    describe('pausing', async () => {
      it('will not run state-changing functions when paused', async () => {
        let pause = OP2.connect(customer).pause();
        await expect(pause).to.be.revertedWith('Ownable: caller is not the owner');
        expect(await OP2.paused()).to.equal(false);
        pause = OP2.connect(owner).pause();
        await expect(pause).not.to.be.reverted;
        expect(await OP2.paused()).to.equal(true);
        
        let newBond = OP2.newBond(etherBalances.ONE_MILLION, 2000);
        await expect(newBond).to.be.revertedWith('err-paused');
        
        let unpause = OP2.connect(customer).unpause();
        await expect(unpause).to.be.revertedWith('Ownable: caller is not the owner');
        expect(await OP2.paused()).to.equal(true);
        unpause = OP2.connect(owner).unpause();
        await expect(unpause).not.to.be.reverted;
        expect(await OP2.paused()).to.equal(false);
        
        newBond = OP2.newBond(etherBalances.ONE_MILLION, 2000);
        await expect(newBond).not.to.be.revertedWith('err-paused');
      });
    });
  });
});
