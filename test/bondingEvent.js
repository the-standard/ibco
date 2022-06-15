const { ethers } = require('hardhat');
const { bigNumber } = ethers;
const { expect, use } = require('chai');
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

let owner, customer, SEuro, USDT, BStorage;
let USDT_ADDRESS, CUSTOMER_ADDR;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const POSITION_MANAGER_ADDRESS = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
const TWO_MILLION = ethers.utils.parseEther('2000000');
const TEN_MILLION = ethers.utils.parseEther('10000000');
const MOST_STABLE_FEE = 500;
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
  const BondContract = await ethers.getContractFactory('BondStorage');
  SEuro = await SEuroContract.deploy('sEURO', 'SEUR', [owner.address]);
  USDT = await ERC20Contract.deploy('USDT', 'USDT', ethers.utils.parseEther('100000000'));
  BStorage = await BondContract.deploy();
  USDT_ADDRESS = USDT.address;
  CUSTOMER_ADDR = customer.address;
});

describe('BondingEvent', async () => {

  let BondingEventContract, BondingEvent, BondStorageContract, BondStorage;

  beforeEach(async () => {
	BondingEventContract = await ethers.getContractFactory('BondingEvent');
	BondStorageContract = await ethers.getContractFactory('BondStorage');
  });

  describe('initialise bonding event', async () => {
	it('has not initialised pool', async () => {
	  BondingEvent = await BondingEventContract.deploy(SEuro.address, USDT_ADDRESS, POSITION_MANAGER_ADDRESS, BStorage.address);
	  expect(await BondingEvent.isPoolInitialised()).to.equal(false);
	});
  });

  context('bonding event deployed', async () => {
	beforeEach(async () => {
	  BStorage = await BondStorageContract.deploy();
	  BondingEvent = await BondingEventContract.deploy(SEuro.address, USDT_ADDRESS, POSITION_MANAGER_ADDRESS, BStorage.address);
	});

	describe('initialise pool', async () => {
	  it('initialises and changes the tick range for the pool', async () => {
		const price = encodePriceSqrt(100, 93);
		expect(await BondingEvent.isPoolInitialised()).to.equal(false);
		await BondingEvent.initialisePool("USDT", USDT_ADDRESS, price, MOST_STABLE_FEE);
		expect(await BondingEvent.isPoolInitialised()).to.equal(true);
		expect(await BondingEvent.tickSpacing()).to.equal(10);

		let bound = await BondingEvent.getTickBounds();
		expect(bound[0]).to.equal(-10000);
		expect(bound[1]).to.equal(10000);
		await BondingEvent.adjustTick(-25000, 25000);
		bound = await BondingEvent.getTickBounds();
		expect(bound[0]).to.equal(-25000);
		expect(bound[1]).to.equal(25000);

		await expect(BondingEvent.adjustTick(-9999999999, 10000)).to.be.throw;
		await expect(BondingEvent.adjustTick(10000, 9999999999)).to.be.throw;
		await expect(BondingEvent.adjustTick(-10001, 10000)).to.be.throw;
		await expect(BondingEvent.adjustTick(-10000, 10001)).to.be.throw;
		await expect(BondingEvent.adjustTick(0, 10000)).to.be.reverted;
		await expect(BondingEvent.adjustTick(10000, 0)).to.be.reverted;
	  });
	});

	describe('bonding', async () => {
	  context('pool initialised', async () => {
		beforeEach(async () => {
		  const SeurosPerUsdt = ethers.BigNumber.from(93).mul(ethers.BigNumber.from(10).pow(12));
		  const price = SEuro.address < USDT.address ?
			encodePriceSqrt(100, SeurosPerUsdt) :
			encodePriceSqrt(SeurosPerUsdt, 100);
		  await BondingEvent.initialisePool("USDT", USDT_ADDRESS, price, MOST_STABLE_FEE);
		  expect(await BondingEvent.isPoolInitialised()).to.equal(true);

		  await SEuro.connect(owner).mint(CUSTOMER_ADDR, TEN_MILLION);
		  await USDT.connect(owner).mint(CUSTOMER_ADDR, TEN_MILLION);
		  await SEuro.connect(customer).approve(BondingEvent.address, TEN_MILLION);
		  await USDT.connect(customer).approve(BondingEvent.address, TEN_MILLION);
		});

		it('bonds sEURO and USDT for 52 weeks and receives correct reward', async () => {
		  await BondingEvent.connect(customer).bond(
			TWO_MILLION, TWO_MILLION, USDT_ADDRESS, durations["ONE_YR_WEEKS"], rates["TEN_PC"],
		  );

		  const bondsAmount = await BondingEvent.connect(customer).getAmountBonds(CUSTOMER_ADDR);
		  expect(bondsAmount).to.equal(1);

		  const firstBond = await BondingEvent.connect(customer).getUserBondAt(CUSTOMER_ADDR, 0);
		  let actualPrincipal = firstBond.principal;
		  let actualRate = firstBond.rate;
		  expect(actualPrincipal).to.equal(TWO_MILLION);
		  expect(actualRate).to.equal(rates["TEN_PC"]);

		  const fiftyTwoWeeksInSeconds = 52 * 7 * 24 * 60 * 60;
		  await ethers.provider.send('evm_increaseTime', [fiftyTwoWeeksInSeconds]);
		  await ethers.provider.send('evm_mine');
		  await BondingEvent.connect(customer).updateBondStatus(CUSTOMER_ADDR);

		  let expectedReward = ethers.utils.parseEther('200000').toString(); // 2_000_000 * 0.1 = 200_000
		  let actualReward = (await BondingEvent.getUserProfit(CUSTOMER_ADDR)).toString();
		  expect(actualReward).to.equal(expectedReward);
		});

		it('bonds multiple times with various maturities and updates active/inactive bonds correctly', async () => {
		  await BondingEvent.connect(customer).bond(
			TWO_MILLION, TWO_MILLION, USDT_ADDRESS, durations["ONE_WEEK"], rates["FIVE_PC"]
		  );
		  await BondingEvent.connect(customer).bond(
			TWO_MILLION, TWO_MILLION, USDT_ADDRESS, durations["TWO_WEEKS"], rates["SIX_PC"]
		  );
		  await BondingEvent.connect(customer).bond(
			TWO_MILLION, TWO_MILLION, USDT_ADDRESS, durations["FOUR_WEEKS"], rates["TEN_PC"]
		  );

		  let expectedActiveBonds = 3;
		  let actualActiveBonds = await BondingEvent.connect(customer).getAmountBonds(CUSTOMER_ADDR);
		  expect(actualActiveBonds).to.equal(expectedActiveBonds);

		  let expectedReward = '0';
		  let actualReward = (await BondingEvent.getUserProfit(CUSTOMER_ADDR)).toString();
		  expect(actualReward).to.equal(expectedReward);

		  await ethers.provider.send('evm_increaseTime', [/* one week */ 7 * 24 * 60 * 60 ]);
		  await ethers.provider.send('evm_mine');
		  await BondingEvent.connect(customer).updateBondStatus(CUSTOMER_ADDR);

		  expectedReward = ethers.utils.parseEther('100000').toString(); // 2_000_000 * 0.05 = 100_000
		  actualReward = (await BondingEvent.getUserProfit(CUSTOMER_ADDR)).toString();
		  expect(actualReward).to.equal(expectedReward);
		  expectedActiveBonds = 2;
		  actualActiveBonds = await BondingEvent.connect(customer).getAmountBonds(CUSTOMER_ADDR);
		  expect(actualActiveBonds).to.equal(expectedActiveBonds);

		  await ethers.provider.send('evm_increaseTime', [ 7 * 24 * 60 * 60 ]);
		  await ethers.provider.send('evm_mine');
		  await BondingEvent.connect(customer).updateBondStatus(CUSTOMER_ADDR);

		  expectedReward = ethers.utils.parseEther('220000').toString(); // 100_000 + (2_000_000 * 0.06) = 220_000
		  actualReward = (await BondingEvent.getUserProfit(CUSTOMER_ADDR)).toString();
		  expect(actualReward).to.equal(expectedReward);
		  expectedActiveBonds = 1;
		  actualActiveBonds = await BondingEvent.connect(customer).getAmountBonds(CUSTOMER_ADDR);
		  expect(actualActiveBonds).to.equal(expectedActiveBonds);

		  await ethers.provider.send('evm_increaseTime', [ 14 * 24 * 60 * 60 ]);
		  await ethers.provider.send('evm_mine');
		  await BondingEvent.connect(customer).updateBondStatus(CUSTOMER_ADDR);

		  expectedReward = ethers.utils.parseEther('420000').toString();
		  actualReward = (await BondingEvent.getUserProfit(CUSTOMER_ADDR)).toString();
		  expect(actualReward).to.equal(expectedReward);
		  expectedActiveBonds = 0;
		  actualActiveBonds = await BondingEvent.connect(customer).getAmountBonds(CUSTOMER_ADDR);
		  expect(actualActiveBonds).to.equal(expectedActiveBonds);
		});
	  });
	});
  });
});
