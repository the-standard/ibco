const { ethers } = require('hardhat');
const { expect } = require('chai');
const bn = require('bignumber.js');
const { POSITION_MANAGER_ADDRESS, STANDARD_TOKENS_PER_EUR, DECIMALS, etherBalances, rates, durations, ONE_WEEK_IN_SECONDS, MOST_STABLE_FEE, encodePriceSqrt, helperFastForwardTime } = require('./common.js');
bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 })

let owner, customer, SEuro, TST, USDT, BStorage;
let USDT_ADDRESS, CUSTOMER_ADDR;

beforeEach(async () => {
  [owner, customer] = await ethers.getSigners();
  const ERC20Contract = await ethers.getContractFactory('DUMMY');
  const SEuroContract = await ethers.getContractFactory('SEuro');
  SEuro = await SEuroContract.deploy('sEURO', 'sEUR', [owner.address]);
  USDT = await ERC20Contract.deploy('USDT', 'USDT', ethers.utils.parseEther('10000000'));
  TST = await ERC20Contract.deploy('TST', 'TST', ethers.utils.parseEther('10000000'));
  USDT_ADDRESS = USDT.address;
  TST_ADDRESS = TST.address;
  SEUR_ADDRESS = SEuro.address;
  CUSTOMER_ADDR = customer.address;
  OWNER_ADDR = owner.address;
});

describe('Stage 2', async () => {
  let BondingEventContract, BondingEvent, StorageContract, BStorage, TokenGatewayContract, TGateway, OperatorStage2, OP2;

  beforeEach(async () => {
	BondingEventContract = await ethers.getContractFactory('BondingEvent');
	StorageContract = await ethers.getContractFactory('BondStorage');
	TokenGatewayContract = await ethers.getContractFactory('StandardTokenGateway');
	OperatorStage2 = await ethers.getContractFactory('OperatorStage2');
  });

  context('operator contract deployed and connected', async() => {
	beforeEach(async () => {
	  TGateway = await TokenGatewayContract.deploy(TST_ADDRESS, SEUR_ADDRESS);
	  BStorage = await StorageContract.deploy(TGateway.address);
	  BondingEvent = await BondingEventContract.deploy(
		SEUR_ADDRESS, USDT_ADDRESS, POSITION_MANAGER_ADDRESS, BStorage.address, OWNER_ADDR
	  );
	  OP2 = await OperatorStage2.deploy();
	});

	describe('bonding and rewards happy case, various pool prices', async() => {
	  context('all stage 2 contracts deployed with an existing balance', async () => {
		beforeEach(async () => {
		  const EVENT_ADDRESS = BondingEvent.address;

		  await SEuro.connect(owner).mint(OWNER_ADDR, etherBalances["ONE_BILLION"]);
		  await USDT.connect(owner).mint(OWNER_ADDR, etherBalances["ONE_BILLION"]);
		  await SEuro.connect(owner).mint(CUSTOMER_ADDR, etherBalances["TWO_MILLION"]);
		  await USDT.connect(owner).mint(CUSTOMER_ADDR, etherBalances["TWO_MILLION"]);
		  await TST.connect(owner).mint(TGateway.address, etherBalances["FIVE_HUNDRED_MILLION"]);
		  await TGateway.connect(owner).updateRewardSupply();
		  await SEuro.connect(customer).approve(EVENT_ADDRESS, etherBalances["TWO_MILLION"]);
		  await USDT.connect(customer).approve(EVENT_ADDRESS, etherBalances["TWO_MILLION"]);

		  await TGateway.connect(owner).setStorageAddress(BStorage.address);
		  await BondingEvent.connect(owner).setOperator(OP2.address);
		  await OP2.connect(owner).setStorage(BStorage.address);
		  await OP2.connect(owner).setBonding(BondingEvent.address);
		  await OP2.connect(owner).setGateway(TGateway.address);
		});

		async function balanceTST() {
		  return TST.balanceOf(CUSTOMER_ADDR);
		}

		async function helperUpdateBondStatus() {
		  return BStorage.connect(customer).refreshBondStatus(CUSTOMER_ADDR);
		}

		async function helperGetBondAt(index) {
		  return BStorage.getBondAt(CUSTOMER_ADDR, index);
		}

		it('[final price] rewards with TST successfully', async () => {
		  let actualClaim, expectedClaim, bond, actualStandardBal, expectedStandardBal;

		  let price = ethers.BigNumber.from(2).pow(96); // assumed sEUR/EUR = 1.0 and USD/EUR = 1.0;
		  await BondingEvent.initialisePool(USDT_ADDRESS, price, MOST_STABLE_FEE);


		  await OP2.connect(owner).newBond(
			  CUSTOMER_ADDR, etherBalances["125K"], etherBalances["125K"], USDT_ADDRESS, durations["ONE_WEEK"], rates["TWENTY_PC"]
		  );
		
		  await helperUpdateBondStatus();
		  actualStandardBal = await balanceTST();
		  expect(actualStandardBal).to.equal(0);

		  let firstBond = await helperGetBondAt(0);
		  let actualPrincipal = firstBond.principal;
		  let actualRate = firstBond.rate;
		  expect(actualPrincipal).to.equal(etherBalances["125K"]);
		  expect(actualRate).to.equal(rates["TWENTY_PC"]);

		  await helperFastForwardTime(ONE_WEEK_IN_SECONDS);
		  await OP2.connect(customer).refreshBond(CUSTOMER_ADDR);
		  await BStorage.connect(customer).claimReward();

		  let principal = 125000;
		  let twentyPercentRate = 1.2;
		  let profitSeuro = principal * twentyPercentRate;
		  let profitStandard = profitSeuro * STANDARD_TOKENS_PER_EUR; // 3 million TST
		  expectedStandardBal = profitStandard.toString();
		  actualStandardBal = (await balanceTST() / DECIMALS).toString();
		  expect(actualStandardBal).to.equal(expectedStandardBal);
		});

		it('[initial price] rewards with TST successfully', async () => {
		  let seuroPerUsd = 1.25; // assumes sEUR/EUR = 0.8 and USD/EUR = 1.0
		  let usdPrice = 1;
		  let price = SEUR_ADDRESS < USDT_ADDRESS ?
			encodePriceSqrt(usdPrice, seuroPerUsd) :
			encodePriceSqrt(seuroPerUsd, usdPrice);
		});
	  });
	});
  });
});