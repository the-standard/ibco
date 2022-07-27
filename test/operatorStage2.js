const { ethers } = require('hardhat');
const { expect } = require('chai');
const bn = require('bignumber.js');
const { POSITION_MANAGER_ADDRESS, STANDARD_TOKENS_PER_EUR, DECIMALS, etherBalances, rates, durations, ONE_WEEK_IN_SECONDS, MOST_STABLE_FEE, helperFastForwardTime, DEFAULT_SQRT_PRICE, MIN_TICK, MAX_TICK } = require('./common.js');
bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 })

let owner, customer, SEuro, TST, USDT;

beforeEach(async () => {
  [owner, customer] = await ethers.getSigners();
  const ERC20Contract = await ethers.getContractFactory('DUMMY');
  const SEuroContract = await ethers.getContractFactory('SEuro');
  SEuro = await SEuroContract.deploy('sEURO', 'sEUR', [owner.address]);
  USDT = await ERC20Contract.deploy('USDT', 'USDT', ethers.utils.parseEther('10000000'));
  TST = await ERC20Contract.deploy('TST', 'TST', ethers.utils.parseEther('10000000'));
});

describe('Stage 2', async () => {
  let BondingEventContract, BondingEvent, StorageContract, BStorage, TokenGatewayContract, TGateway, OperatorStage2, OP2, RatioCalculator;

  beforeEach(async () => {
    RatioCalculatorContract = await ethers.getContractFactory('RatioCalculator');
    BondingEventContract = await ethers.getContractFactory('BondingEvent');
    StorageContract = await ethers.getContractFactory('BondStorage');
    TokenGatewayContract = await ethers.getContractFactory('StandardTokenGateway');
    OperatorStage2 = await ethers.getContractFactory('OperatorStage2');
  });

  context('operator contract deployed and connected', async () => {
    beforeEach(async () => {
      RatioCalculator = await RatioCalculatorContract.deploy();
      TGateway = await TokenGatewayContract.deploy(TST.address, SEuro.address);
      BStorage = await StorageContract.deploy(TGateway.address);
      BondingEvent = await BondingEventContract.deploy(
        SEuro.address, USDT.address, POSITION_MANAGER_ADDRESS, BStorage.address, owner.address,
        RatioCalculator.address, DEFAULT_SQRT_PRICE, MIN_TICK, MAX_TICK, MOST_STABLE_FEE
      );
      OP2 = await OperatorStage2.deploy();
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
          await OP2.connect(owner).setGateway(TGateway.address);
        });

        async function formatCustomerBalance() {
          return (await TST.balanceOf(customer.address)).div(DECIMALS).toString();
        }

        async function testingSuite(seuroAmount, rate) {
          await OP2.connect(owner).newBond(
            customer.address, seuroAmount, durations.ONE_WEEK, rate
          );

          await BStorage.connect(customer).refreshBondStatus(customer.address);

          let actualBalance = await formatCustomerBalance();
          expect(actualBalance).to.equal('0');

          let firstBond = await BStorage.getBondAt(customer.address, 0);
          let actualPrincipal = firstBond.principal;
          let actualRate = firstBond.rate;
          expect(actualPrincipal).to.equal(etherBalances['125K']);
          expect(actualRate).to.equal(rates.TWENTY_PC);

          await helperFastForwardTime(ONE_WEEK_IN_SECONDS);
          await OP2.connect(customer).refreshBond(customer.address);
          await OP2.connect(customer).claim();
        }

        async function expectedTokBalance(principal, rateMultiplier) {
          let profitSeuro = principal * rateMultiplier;
          let expectedStandardBal = (profitSeuro * STANDARD_TOKENS_PER_EUR).toString();
          let actualStandardBal = await formatCustomerBalance();
          expect(actualStandardBal).to.equal(expectedStandardBal);
        }

        it('[final price (1.0)] rewards with TST successfully', async () => {
          await testingSuite(etherBalances['125K'], rates.TWENTY_PC);
          await expectedTokBalance(125000, 1.2);
        });
      });
    });
  });
});
