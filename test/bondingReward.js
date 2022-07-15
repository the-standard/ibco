const { ethers } = require('hardhat');
const { expect } = require('chai');
const bn = require('bignumber.js');
const { POSITION_MANAGER_ADDRESS, STANDARD_TOKENS_PER_EUR, DECIMALS, etherBalances, rates, durations, ONE_WEEK_IN_SECONDS, MOST_STABLE_FEE, helperFastForwardTime } = require('./common.js');
bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 })

let owner, customer, SEuro, TST, USDT;
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

describe('BondingReward', async () => {
  let BondingEventContract, BondingEvent, StorageContract, BStorage, TokenGatewayContract, TGateway;

  beforeEach(async () => {
	BondingEventContract = await ethers.getContractFactory('BondingEvent');
	StorageContract = await ethers.getContractFactory('BondStorage');
	TokenGatewayContract = await ethers.getContractFactory('StandardTokenGateway');
  });

  context('bonding event deployed', async () => {
	beforeEach(async () => {
	  TGateway = await TokenGatewayContract.deploy(TST_ADDRESS, SEUR_ADDRESS);
	  BStorage = await StorageContract.deploy(TGateway.address);
	  BondingEvent = await BondingEventContract.deploy(
		SEUR_ADDRESS, USDT_ADDRESS, POSITION_MANAGER_ADDRESS, BStorage.address, OWNER_ADDR
	  );
	});

	describe('bonding', async () => {
	  context('initialised pool, tokens minted and approved', async () => {
		beforeEach(async () => {
		  const EVENT_ADDRESS = BondingEvent.address;
		  let price = ethers.BigNumber.from(2).pow(96); // This corresponds to 1
		  await BondingEvent.initialisePool(USDT_ADDRESS, price, MOST_STABLE_FEE);
		  expect(await BondingEvent.isPoolInitialised()).to.equal(true);

		  // mint some sEUROs, USDTs, and TSTs
		  await SEuro.connect(owner).mint(CUSTOMER_ADDR, etherBalances["HUNDRED_MILLION"]);
		  await USDT.connect(owner).mint(CUSTOMER_ADDR, etherBalances["HUNDRED_MILLION"]);
		  await SEuro.connect(owner).mint(OWNER_ADDR, etherBalances["ONE_BILLION"]);
		  await USDT.connect(owner).mint(OWNER_ADDR, etherBalances["ONE_BILLION"]);
		  await TST.connect(owner).mint(TGateway.address, etherBalances["FIVE_HUNDRED_MILLION"]);
		  await TGateway.connect(owner).updateRewardSupply();

		  // approve the bonding contract to move customer sEUR and USDT funds
		  await SEuro.connect(customer).approve(EVENT_ADDRESS, etherBalances["HUNDRED_MILLION"]);
		  await USDT.connect(customer).approve(EVENT_ADDRESS, etherBalances["HUNDRED_MILLION"]);
		});

		async function balanceTST() {
		  return TST.balanceOf(CUSTOMER_ADDR);
		}

		it('successfully transfers TSTs to the user and adjusts gateway contract', async () => {
		  let actualClaim, expectedClaim, bond, actualStandardBal;

		  await TGateway.connect(owner).setStorageAddress(BStorage.address);
		  await BondingEvent.connect(owner).bond(
			CUSTOMER_ADDR, etherBalances["TWO_MILLION"], etherBalances["TWO_MILLION"], USDT_ADDRESS, durations["ONE_WEEK"], rates["TEN_PC"]
		  );
		  bond = await BStorage.getBondAt(CUSTOMER_ADDR, 0);
		  let principal = 2000000;
		  expect(bond.principal.div(DECIMALS)).to.equal(principal);

		  actualClaim = await BStorage.getClaimAmount(CUSTOMER_ADDR);
		  expect(actualClaim).to.equal(0);

		  await helperFastForwardTime(ONE_WEEK_IN_SECONDS);

		  actualClaim = await BStorage.getClaimAmount(CUSTOMER_ADDR);
		  expect(actualClaim).to.equal(0);

		  await BStorage.connect(customer).refreshBondStatus(CUSTOMER_ADDR);

		  let profitSeuro = principal * 1.1; // ten percent rate
		  let profitStandard = profitSeuro * STANDARD_TOKENS_PER_EUR;
		  expectedClaim = profitStandard.toString();
		  // claim has been properly registered in bond backend
		  actualClaim = (await BStorage.getClaimAmount(CUSTOMER_ADDR)).div(DECIMALS).toString();
		  expect(actualClaim).to.equal(expectedClaim);

		  // verify TST balance is zero
		  actualStandardBal = await balanceTST();
		  expect(actualStandardBal).to.equal(0);
		  // claim the reward!
		  await BStorage.connect(customer).claimReward(CUSTOMER_ADDR);
		  // verify that reward is at user now
		  actualStandardBal = (await balanceTST()).div(DECIMALS).toString();
		  expect(actualStandardBal).to.equal(expectedClaim);
		  // verify that there is no claim anymore
		  actualClaim = (await BStorage.getClaimAmount(CUSTOMER_ADDR)).div(DECIMALS).toString();
		  expect(actualClaim).to.equal('0');

		  let actualLeftover = (await TST.balanceOf(TGateway.address)).div(DECIMALS).toString();
		  let maximumRewardSupply = 500 * 10 ** 6;
		  let expectedLeftover = (maximumRewardSupply - profitStandard).toString();
		  expect(actualLeftover).to.equal(expectedLeftover);
		});
	  });
	});
  });
});




