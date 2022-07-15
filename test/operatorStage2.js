const { ethers } = require('hardhat');
const { expect } = require('chai');
const bn = require('bignumber.js');
const { POSITION_MANAGER_ADDRESS, STANDARD_TOKENS_PER_EUR, DECIMALS, etherBalances, rates, durations, ONE_WEEK_IN_SECONDS, MOST_STABLE_FEE, encodePriceSqrt, helperFastForwardTime, DEFAULT_SQRT_PRICE, MIN_TICK, MAX_TICK } = require('./common.js');
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
			TGateway = await TokenGatewayContract.deploy(TST_ADDRESS, SEUR_ADDRESS);
			BStorage = await StorageContract.deploy(TGateway.address);
			BondingEvent = await BondingEventContract.deploy(
				SEUR_ADDRESS, USDT_ADDRESS, POSITION_MANAGER_ADDRESS, BStorage.address, OWNER_ADDR,
				RatioCalculator.address, DEFAULT_SQRT_PRICE, MIN_TICK, MAX_TICK, MOST_STABLE_FEE
			);
			OP2 = await OperatorStage2.deploy();
		});

		describe('bonding and rewards happy case, various pool prices', async () => {
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

				async function formatCustomerBalance() {
					return (await TST.balanceOf(CUSTOMER_ADDR)).div(DECIMALS).toString();
				}

				async function testingSuite(seuroAmount, otherAmount, rate) {
					OP2.connect(owner).newBond(
						CUSTOMER_ADDR, seuroAmount, otherAmount, durations["ONE_WEEK"], rate
					);

					BStorage.connect(customer).refreshBondStatus(CUSTOMER_ADDR);

					let actualBalance = await formatCustomerBalance();
					expect(actualBalance).to.equal('0');

					let firstBond = await BStorage.getBondAt(CUSTOMER_ADDR, 0);
					let actualPrincipal = firstBond.principal;
					let actualRate = firstBond.rate;
					expect(actualPrincipal).to.equal(etherBalances["125K"]);
					expect(actualRate).to.equal(rates["TWENTY_PC"]);

					await helperFastForwardTime(ONE_WEEK_IN_SECONDS);
					await OP2.connect(customer).refreshBond(CUSTOMER_ADDR);
					await OP2.connect(customer).claim();
				}

				async function expectedTokBalance(principal, rateMultiplier) {
					let profitSeuro = principal * rateMultiplier;
					let expectedStandardBal = (profitSeuro * STANDARD_TOKENS_PER_EUR).toString();
					let actualStandardBal = await formatCustomerBalance();
					expect(actualStandardBal).to.equal(expectedStandardBal);
				}

				it('[final price (1.0)] rewards with TST successfully', async () => {
					await testingSuite(etherBalances["125K"], etherBalances["125K"], rates["TWENTY_PC"]);
					await expectedTokBalance(125000, 1.2);
				});
			});
		});
	});
});
