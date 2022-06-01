const { ethers } = require('hardhat');
const { bigNumber } = ethers;
const { expect, use } = require('chai');
const bn = require('bignumber.js');

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 })

const encodePriceSqrt = (reserve1, reserve0) => {
	return BigNumber.from(
	  new bn(reserve1.toString())
		.div(reserve0.toString())
		.sqrt()
		.multipliedBy(new bn(2).pow(96))
		.integerValue(3)
		.toString()
	)
}

const getToken = async (token, signer, amount) => {
	const SwapManager = await (await ethers.getContractFactory('SwapManager')).deploy();
	await SwapManager.connect(signer).swapEthForToken(token, {value: amount});
}

describe('SEuro', async () => {
	let owner, customer, SEuro, USDT, BondingEventContract, BondingEvent;
	const USDT_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
	const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
	const POSITION_MANAGER_ADDRESS = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
	const MOST_STABLE_FEE = 500;

	beforeEach(async () => {
		[owner, customer] = await ethers.getSigners();
		const SEuroContract = await ethers.getContractFactory('SEuro');
		SEuro = await SEuroContract.deploy('sEURO', 'SEUR', [owner.address]);
		BondingEventContract = await ethers.getContractFactory('BondingEvent');
                // USDT = await ethers.getContractAt('@openzeppelin/contracts/token/ERC20/IERC20.sol', USDT_ADDRESS);
		USDT = await SEuroContract.deploy('USDT', 'USDT', [owner.address]);
	});

	describe('initialise bonding event', async () => {
		it('has not initialised pool', async () => {
			BondingEvent = await BondingEventContract.deploy(SEuro.address, USDT_ADDRESS, POSITION_MANAGER_ADDRESS);
			expect(await BondingEvent.pool()).to.equal(ZERO_ADDRESS);
		});
	});

	context('bonding event deployed', async () => {
		beforeEach(async () => {
			BondingEvent = await BondingEventContract.deploy(SEuro.address, USDT_ADDRESS, POSITION_MANAGER_ADDRESS);
		});

		describe('initialise pool', async () => {
			it('initialises the uniswap pool with given price', async () => {
				const price = encodePriceSqrt(100,93);
				await BondingEvent.initialisePool(price, MOST_STABLE_FEE);
				expect(await BondingEvent.pool()).not.to.equal(ZERO_ADDRESS);
			});

			it('stores the tick spacing for the pool', async () => {
				const price = encodePriceSqrt(100,93);
				await BondingEvent.initialisePool(price, MOST_STABLE_FEE);
				expect(await BondingEvent.tickSpacing()).to.be.gt(0);
			});
		});

		describe('bonding', async () => {
			context('pool initialised', async () => {
				beforeEach(async () => {
					const SeurosPerUsdt = BigNumber.from(93).mul(BigNumber.from(10).pow(12));
					const price = SEuro.address < USDT.address ?
						encodePriceSqrt(100, SeurosPerUsdt) :
						encodePriceSqrt(SeurosPerUsdt, 100);
					await BondingEvent.initialisePool(price, MOST_STABLE_FEE);
				});

				it('bonds given sEURO amount with required USDT', async () => {
					const amountSeuro = ethers.utils.parseEther('1000');
					const amountUsdt = amountSeuro.mul(2).div(BigNumber.from(10).pow(12));
					await SEuro.connect(owner).mint(customer.address, amountSeuro);
					await getToken(USDT_ADDRESS, customer, ethers.utils.parseEther('100'));
					const usdtBalance = await USDT.balanceOf(customer.address);

					await SEuro.connect(customer).approve(BondingEvent.address, amountSeuro);
					await USDT.connect(customer).approve(BondingEvent.address, maountUsdt);
					await BondingEvent.connect(customer).bond(amountSeuro, amountUsdt); 

					expect(await SEuro.balanceOf(customer.address)).to.equal(0);
					expect(await USDT.balanceOf(customer.address)).to.be.lt(usdtBalance);
				});
			});
		});
	});
});
