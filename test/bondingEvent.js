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

let owner, customer, SEuro, USDT;
let USDT_ADDRESS;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const POSITION_MANAGER_ADDRESS = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
const MOST_STABLE_FEE = 500;

beforeEach(async () => {
  [owner, customer] = await ethers.getSigners();
  const SEuroContract = await ethers.getContractFactory('SEuro');
  const ERC20Contract = await ethers.getContractFactory('DUMMY');
  SEuro = await SEuroContract.deploy('sEURO', 'SEUR', [owner.address]);
  USDT = await ERC20Contract.deploy('USDT', 'USDT', ethers.utils.parseEther('100000000'));
  USDT_ADDRESS = USDT.address;
});

describe('BondingEvent', async () => {

  let BondingEventContract, BondingEvent;

  beforeEach(async () => {
    BondingEventContract = await ethers.getContractFactory('BondingEvent');
  });

  describe('initialise bonding event', async () => {
    it('has not initialised pool', async () => {
      BondingEvent = await BondingEventContract.deploy(SEuro.address, POSITION_MANAGER_ADDRESS);
      expect(await BondingEvent.amountCurrencyPairs()).to.equal(0);
    });
  });

  context('bonding event deployed', async () => {
    beforeEach(async () => {
      BondingEvent = await BondingEventContract.deploy(SEuro.address, POSITION_MANAGER_ADDRESS);
    });

    describe('initialise pool', async () => {
      it('initialises the uniswap pool with one currency pair', async () => {
        const price = encodePriceSqrt(100,93);
        await BondingEvent.initialisePool("USDT", USDT_ADDRESS, price, MOST_STABLE_FEE);
        expect(await BondingEvent.amountCurrencyPairs()).not.to.equal(0);
      });

      it('stores the tick spacing for the pool', async () => {
        const price = encodePriceSqrt(100, 93);
        await BondingEvent.initialisePool("USDT", USDT_ADDRESS, price, MOST_STABLE_FEE);
        expect(await BondingEvent.tickSpacing()).to.be.gt(0);
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
        });

        it('bonds given sEURO amount with required USDT', async () => {
          const amountSeuro = ethers.utils.parseEther('1000');
          const amountUsdt = amountSeuro.mul(2).div(ethers.BigNumber.from(10).pow(12));
          await SEuro.connect(owner).mint(customer.address, amountSeuro);

          // transfer USDT to customer
          await USDT.transfer(customer.address, ethers.utils.parseEther('100'));
          const usdtBalance = await USDT.balanceOf(customer.address);

          await SEuro.connect(customer).approve(BondingEvent.address, amountSeuro);
          await USDT.connect(customer).approve(BondingEvent.address, amountUsdt);
          await BondingEvent.connect(customer).bond(amountSeuro, USDT_ADDRESS, amountUsdt); 

          expect(await SEuro.balanceOf(customer.address)).to.equal(0);
          expect(await USDT.balanceOf(customer.address)).to.be.lt(usdtBalance);
        });
      });
    });
  });
});
