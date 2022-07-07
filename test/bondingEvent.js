const { ethers } = require('hardhat');
const { expect } = require('chai');
const bn = require('bignumber.js');

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 })

const encodePriceSqrt = (reserve1, reserve0) => {
  return ethers.BigNumber.from(
	new bn(reserve1.toString())
	.div(reserve0.toString())
	.sqrt()
	.multipliedBy(new bn(2).pow(96))
	.integerValue(3)
	.toString()
  )
}

let owner, customer, SEuro, TST, USDT, BStorage;
let USDT_ADDRESS, CUSTOMER_ADDR;
const POSITION_MANAGER_ADDRESS = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
var etherBalances = {
  "TWO_MILLION": ethers.utils.parseEther('2000000'),
  "FOUR_MILLION": ethers.utils.parseEther('4000000'),
  "FIFTY_MILLION": ethers.utils.parseEther('50000000'),
  "HUNDRED_MILLION": ethers.utils.parseEther('100000000'),
  "ONE_BILLION": ethers.utils.parseEther('1000000000'),
};
const MOST_STABLE_FEE = 500;
const ONE_WEEK_IN_SECONDS = 7 * 24 * 60 * 60;
const STANDARD_TOKENS_PER_EUR = 20; // 1 TST = 0.05 EUR
const DECIMALS = 10 ** 18;
var rates = {
  "HALF_PC": 500,
  "FIVE_PC": 5000,
  "SIX_PC": 6000,
  "SEVEN_PC": 7000,
  "TEN_PC": 10000
};
var durations = {
  "ONE_YR_WEEKS": 52,
  "HALF_YR_WEEKS": 26,
  "ONE_WEEK": 1,
  "TWO_WEEKS": 2,
  "FOUR_WEEKS": 4,
  "EIGHT_WEEKS": 8
};

beforeEach(async () => {
  [owner, customer] = await ethers.getSigners();
  const SEuroContract = await ethers.getContractFactory('SEuro');
  const ERC20Contract = await ethers.getContractFactory('DUMMY');
  SEuro = await SEuroContract.deploy('sEURO', 'SEUR', [owner.address]);
  USDT = await ERC20Contract.deploy('USDT', 'USDT', ethers.utils.parseEther('100000000'));
  TST = await ERC20Contract.deploy('TST', 'TST', ethers.utils.parseEther('10000000'));
  USDT_ADDRESS = USDT.address;
  TST_ADDRESS = TST.address;
  SEUR_ADDRESS = SEuro.address;
  CUSTOMER_ADDR = customer.address;
  OWNER_ADDR = owner.address;
});

describe('BondingEvent', async () => {

  let BondingEventContract, BondingEvent, BondStorageContract, BondStorage, TokenGateway;

  beforeEach(async () => {
	BondingEventContract = await ethers.getContractFactory('BondingEvent');
	BondStorageContract = await ethers.getContractFactory('BondStorage');
	TokenGatewayContract = await ethers.getContractFactory('StandardTokenGateway');
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

		  await SEuro.connect(owner).mint(CUSTOMER_ADDR, etherBalances["HUNDRED_MILLION"]);
		  await USDT.connect(owner).mint(CUSTOMER_ADDR, etherBalances["HUNDRED_MILLION"]);
		  await SEuro.connect(owner).mint(OWNER_ADDR, etherBalances["ONE_BILLION"]);
		  await USDT.connect(owner).mint(OWNER_ADDR, etherBalances["ONE_BILLION"]);
		  await SEuro.connect(owner).approve(BondingEvent.address, etherBalances["HUNDRED_MILLION"]);
		  await USDT.connect(owner).approve(BondingEvent.address, etherBalances["HUNDRED_MILLION"]);
		  await SEuro.connect(customer).approve(BondingEvent.address, etherBalances["HUNDRED_MILLION"]);
		  await USDT.connect(customer).approve(BondingEvent.address, etherBalances["HUNDRED_MILLION"]);
		});

		async function helperGetActiveBonds() {
		  return BStorage.getActiveBonds(CUSTOMER_ADDR);
		}

		async function helperGetBondAt(index) {
		  return BStorage.getBondAt(CUSTOMER_ADDR, index);
		}

		async function helperUpdateBondStatus() {
		  return BStorage.connect(customer).refreshBondStatus(CUSTOMER_ADDR);
		}

		async function helperGetProfit() {
		  return BStorage.getProfit(CUSTOMER_ADDR);
		}

		async function helperFastForwardTime(seconds) {
		  ethers.provider.send('evm_increaseTime', [ seconds ]);
		  ethers.provider.send('evm_mine');
		}

		it('bonds sEURO and USDT for 52 weeks and receives correct reward', async () => {
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

		it('bonds multiple times with various maturities and updates active/inactive bonds correctly', async () => {
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
