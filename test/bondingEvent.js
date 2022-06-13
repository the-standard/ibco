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

// const getToken = async (token, signer, amount) => {
//   const SwapManager = await (await ethers.getContractFactory('SwapManager')).deploy();
//   // await SwapManager.connect(signer).swapEthForToken(token, {value: amount});
// }

let owner, customer, SEuro, USDT, BStorage;
let USDT_ADDRESS;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const POSITION_MANAGER_ADDRESS = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
const MOST_STABLE_FEE = 500;
const HALF_PERCENT_RATE = 5000;
const ONE_YEAR_IN_WEEKS = 52;


beforeEach(async () => {
  [owner, customer] = await ethers.getSigners();
  const SEuroContract = await ethers.getContractFactory('SEuro');
  const ERC20Contract = await ethers.getContractFactory('DUMMY');
  const BondContract = await ethers.getContractFactory('BondStorage');
  SEuro = await SEuroContract.deploy('sEURO', 'SEUR', [owner.address]);
  USDT = await ERC20Contract.deploy('USDT', 'USDT', ethers.utils.parseEther('100000000'));
  BStorage = await BondContract.deploy();
  USDT_ADDRESS = USDT.address;
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
	  it('initialises and stores the tick spacing for the pool', async () => {
		const price = encodePriceSqrt(100, 93);
		expect(await BondingEvent.isPoolInitialised()).to.equal(false);
		await BondingEvent.initialisePool("USDT", USDT_ADDRESS, price, MOST_STABLE_FEE);
		expect(await BondingEvent.isPoolInitialised()).to.equal(true);
		expect(await BondingEvent.tickSpacing()).to.equal(10);
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
		});

		it('bonds given sEURO amount with required USDT for 1 year', async () => {
		  const CUSTOMER_ADDR = customer.address;
		  const minLiquidityAmount = ethers.utils.parseEther('4000000');

		  await SEuro.connect(owner).mint(CUSTOMER_ADDR, minLiquidityAmount);
		  await USDT.connect(owner).mint(CUSTOMER_ADDR, minLiquidityAmount);
		  const euroBalance = await SEuro.balanceOf(CUSTOMER_ADDR);
		  const usdtBalance = await USDT.balanceOf(CUSTOMER_ADDR);
		  expect(euroBalance).to.equal(minLiquidityAmount);
		  expect(usdtBalance).to.equal(minLiquidityAmount);

		  const seuroAmount = ethers.utils.parseEther('2000000');
		  const usdtAmount = ethers.utils.parseEther('2000000');
		  const belowAmount = ethers.utils.parseEther('1900000');
		  await SEuro.connect(customer).approve(BondingEvent.address, seuroAmount);
		  await USDT.connect(customer).approve(BondingEvent.address, usdtAmount);

		  await BondingEvent.connect(customer).bond(
			seuroAmount, usdtAmount, USDT_ADDRESS, ONE_YEAR_IN_WEEKS, HALF_PERCENT_RATE,
		  );

		  const bondsAmount = await BondingEvent.connect(customer).getAmountBonds(CUSTOMER_ADDR);
		  expect(bondsAmount).to.equal(1);

		  const firstBond = await BondingEvent.connect(customer).getUserBondAt(CUSTOMER_ADDR, 0);
		  let actualPrincipal = firstBond.principal;
		  let actualRate = firstBond.rate;
		  expect(actualPrincipal).to.equal(seuroAmount);
		  expect(actualRate).to.equal(HALF_PERCENT_RATE);

		  //TODO: skip forward 52 weeks and test that the payout is correct
		  //TODO: add multiple bonds to test that the list of active bonds and inactive bonds are updated properly
		  //TODO: add failure cases with "unreasonable" bond data (e.g., a maturity in the past) that should not process
		  //TODO: find other clever ways to try to "game" the system
		});
	  });
	});
  });
});
