const { ethers } = require('hardhat');
const { expect, use } = require('chai');
const { etherBalances, getLibraryFactory, DEFAULT_CHAINLINK_EUR_USD_PRICE, DEFAULT_CHAINLINK_ETH_USD_PRICE } = require('../common.js');

describe('SEuroOffering', async () => {
  const BUCKET_SIZE = ethers.utils.parseEther('100000');
  const INITIAL_PRICE = ethers.utils.parseEther('0.8');
  const MAX_SUPPLY = ethers.utils.parseEther('200000000');
  let SEuroOffering, SEuro, BondingCurve, SEuroCalculator, TokenManager, WETH, DAI,
    owner, user, collateralWallet, BondingCurveContract, SEuroCalculatorContract,
    TokenManagerContract, ChainlinkEthUsd, ChainlinkDaiUsd, ChainlinkEurUsd;

  async function getEthToSEuro(amount) {
    const token = {
      name: await WETH.symbol(),
      addr: WETH.address,
      dec: 18,
      chainlinkAddr: ChainlinkEthUsd.address,
      chainlinkDec: await ChainlinkEthUsd.decimals()
    };
    return await SEuroCalculator.callStatic.calculate(amount, token);
  }

  async function getDaiToSEuro(amount) {
    const token = {
      name: await DAI.symbol(),
      addr: DAI.address,
      dec: 18,
      chainlinkAddr: ChainlinkDaiUsd.address,
      chainlinkDec: await ChainlinkDaiUsd.decimals()
    };
    return await SEuroCalculator.callStatic.calculate(amount, token);
  }

  async function getBucketPrice(index) {
    const TestBondingCurve = await (await getLibraryFactory(owner, 'TestBondingCurve')).deploy(
      INITIAL_PRICE, MAX_SUPPLY, BUCKET_SIZE
    );
    return await TestBondingCurve.callStatic.getPriceOfBucket(index);
  }

  beforeEach(async () => {
    [owner, user, collateralWallet] = await ethers.getSigners();

    const ERC20Contract = await ethers.getContractFactory('MintableERC20');
    const SEuroOfferingContract = await ethers.getContractFactory('SEuroOffering');
    BondingCurveContract = await getLibraryFactory(owner, 'BondingCurve');
    SEuroCalculatorContract = await getLibraryFactory(owner, 'SEuroCalculator');
    TokenManagerContract = await ethers.getContractFactory('TokenManager');

    WETH = await (await ethers.getContractFactory('WETHMock')).deploy();
    DAI = await (await ethers.getContractFactory('MintableERC20')).deploy('Dai Stablecoin', 'DAI', 18);
    SEuro = await ERC20Contract.deploy('SEuro', 'SEUR', 18);
    ChainlinkEurUsd = await (await ethers.getContractFactory('ChainlinkMock')).deploy(DEFAULT_CHAINLINK_EUR_USD_PRICE);
    ChainlinkEthUsd = await (await ethers.getContractFactory('ChainlinkMock')).deploy(DEFAULT_CHAINLINK_ETH_USD_PRICE);
    ChainlinkDaiUsd = await (await ethers.getContractFactory('ChainlinkMock')).deploy(100000000);
    BondingCurve = await BondingCurveContract.deploy(INITIAL_PRICE, MAX_SUPPLY, BUCKET_SIZE);
    SEuroCalculator = await SEuroCalculatorContract.deploy(BondingCurve.address, ChainlinkEurUsd.address);
    TokenManager = await TokenManagerContract.deploy(WETH.address, ChainlinkEthUsd.address);
    SEuroOffering = await SEuroOfferingContract.deploy(SEuro.address, SEuroCalculator.address, TokenManager.address, BondingCurve.address);
    
    await SEuroOffering.setCollateralWallet(collateralWallet.address);
    await SEuroCalculator.grantRole(await SEuroCalculator.OFFERING(), SEuroOffering.address);
    await BondingCurve.grantRole(await BondingCurve.UPDATER(), SEuroOffering.address);
    await BondingCurve.grantRole(await BondingCurve.CALCULATOR(), SEuroCalculator.address);
  });

  describe('swap', async () => {
    let PriceConverter;

    beforeEach(async () => {
      PriceConverter = await (await ethers.getContractFactory('PriceConverter')).deploy(ChainlinkEurUsd.address, ChainlinkEthUsd.address);
    });

    it('will not swap for eth if ibco not active', async () => {
      const toSwap = ethers.utils.parseEther('1');

      const swap = SEuroOffering.connect(user).swapETH({ value: toSwap });

      await expect(swap).to.be.revertedWith('err-ibco-inactive');
      const userSEuroBalance = await SEuro.balanceOf(user.address);
      expect(userSEuroBalance).to.eq(0);
    });

    it('will not swap for token if ibco not active', async () => {
      const toSwap = ethers.utils.parseEther('1');
      await WETH.mint(user.address, toSwap)
      await WETH.connect(user).approve(SEuroOffering.address, toSwap);

      const swap = SEuroOffering.connect(user).swap('WETH', toSwap);

      await expect(swap).to.be.revertedWith('err-ibco-inactive');
      const userSEuroBalance = await SEuro.balanceOf(user.address);
      expect(userSEuroBalance).to.eq(0);
    });

    context('activated', async () => {
      beforeEach(async () => {
        await SEuroOffering.connect(owner).activate();
      });

      it('swaps for given token', async () => {
        const toSwap = ethers.utils.parseEther('1');
        await WETH.mint(user.address, toSwap)
        await WETH.connect(user).approve(SEuroOffering.address, toSwap);

        const voidSwap = SEuroOffering.connect(user).swap('WETH', 0);
        await expect(voidSwap).to.be.revertedWith('err-invalid-value');

        const expectedEuros = await getEthToSEuro(toSwap);
        const swap = SEuroOffering.connect(user).swap('WETH', toSwap);
        await expect(swap).to.emit(SEuroOffering, 'Swap').withArgs(user.address, 'WETH', toSwap, expectedEuros);
        const userSEuroBalance = await SEuro.balanceOf(user.address);
        expect(userSEuroBalance.toString()).to.equal(expectedEuros.toString());
      });

      it('will not swap without preapproval', async () => {
        const toSwap = ethers.utils.parseEther('1');
        await WETH.mint(user.address, toSwap)

        const swap = SEuroOffering.connect(user).swap('WETH', toSwap);

        await expect(swap).to.be.revertedWith('err-tok-allow');
        const userSEuroBalance = await SEuro.balanceOf(user.address);
        expect(userSEuroBalance.toString()).to.equal('0');
      });

      it('will not swap without balance of token', async () => {
        const toSwap = ethers.utils.parseEther('1');
        await WETH.burn(user.address, await WETH.balanceOf(user.address));
        await WETH.connect(user).approve(SEuroOffering.address, toSwap);

        const swap = SEuroOffering.connect(user).swap('WETH', toSwap);

        await expect(swap).to.be.revertedWith('err-tok-bal');
        const userSEuroBalance = await SEuro.balanceOf(user.address);
        expect(userSEuroBalance.toString()).to.equal('0');
        expect(await WETH.balanceOf(collateralWallet.address)).to.equal(0);
      });

      it('will swap for any accepted token', async () => {
        const toSwap = ethers.utils.parseEther('1');
        await TokenManager.connect(owner).addAcceptedToken(DAI.address, ChainlinkDaiUsd.address);

        await DAI.mint(user.address, toSwap)
        const Dai = await ethers.getContractAt('IERC20', DAI.address);
        const userTokens = await Dai.balanceOf(user.address);
        await Dai.connect(user).approve(SEuroOffering.address, userTokens);

        const expectedSeuros = await getDaiToSEuro(userTokens);
        const swap = SEuroOffering.connect(user).swap('DAI', userTokens);
        await expect(swap).to.emit(SEuroOffering, 'Swap').withArgs(user.address, 'DAI', userTokens, expectedSeuros);
        const userSEuroBalance = await SEuro.balanceOf(user.address);
        expect(userSEuroBalance).to.equal(expectedSeuros);
      });

      it('updates the price in bonding curve when bucket is crossed', async () => {
        const amount = await PriceConverter.eurosToEth(BUCKET_SIZE);
        await WETH.mint(user.address, amount)
        await WETH.connect(user).approve(SEuroOffering.address, amount);

        await SEuroOffering.connect(user).swap('WETH', amount);

        const bucket = await BondingCurve.currentBucket();
        expect(bucket.index).to.equal(1);
        expect(bucket.price).to.equal(await getBucketPrice(1));
      });

      describe('swapETH', async () => {
        it('swaps for eth', async () => {
          const voidSwap = SEuroOffering.connect(user).swapETH({ value: 0 });
          await expect(voidSwap).to.be.revertedWith('err-invalid-value');

          const toSwap = ethers.utils.parseEther('1');
          const collateralWethBalance = await WETH.balanceOf(collateralWallet.address); 
          const expectedEuros = await getEthToSEuro(toSwap);
          const swap = SEuroOffering.connect(user).swapETH({ value: toSwap });
          await expect(swap).to.emit(SEuroOffering, 'Swap').withArgs(user.address, 'ETH', toSwap, expectedEuros);
          const userSEuroBalance = await SEuro.balanceOf(user.address);
          expect(userSEuroBalance.toString()).to.equal(expectedEuros.toString());

          expect(await WETH.balanceOf(collateralWallet.address)).to.equal(collateralWethBalance.add(toSwap));
        });

        it('updates the price in bonding curve when bucket is crossed', async () => {
          const amount = await PriceConverter.eurosToEth(BUCKET_SIZE);
          await SEuroOffering.connect(user).swapETH({ value: amount });

          const bucket = await BondingCurve.currentBucket();
          expect(bucket.index).to.equal(1);
          expect(bucket.price).to.equal(await getBucketPrice(1));
        });
      });

      describe('pausing', async () => {
        it('will not allow state-changing functions when paused', async () => {
          let pause = SEuroOffering.connect(user).pause();
          await expect(pause).to.be.revertedWith('Ownable: caller is not the owner');
          expect(await SEuroOffering.paused()).to.equal(false);
          pause = SEuroOffering.connect(owner).pause();
          await expect(pause).not.to.be.reverted;
          expect(await SEuroOffering.paused()).to.equal(true);

          let swap = SEuroOffering.swap('WETH', etherBalances['8K']);
          await expect(swap).to.be.revertedWith('err-paused');
          let swapETH = SEuroOffering.swapETH({value: etherBalances['8K']});
          await expect(swapETH).to.be.revertedWith('err-paused');

          let unpause = SEuroOffering.connect(user).unpause();
          await expect(unpause).to.be.revertedWith('Ownable: caller is not the owner');
          expect(await SEuroOffering.paused()).to.equal(true);
          unpause = SEuroOffering.connect(owner).unpause();
          await expect(unpause).not.to.be.reverted;
          expect(await SEuroOffering.paused()).to.equal(false);

          swap = SEuroOffering.swap('WETH', etherBalances['8K']);
          await expect(swap).not.to.be.revertedWith('err-paused');
          swapETH = SEuroOffering.swapETH({value: etherBalances['8K']});
          await expect(swapETH).not.to.be.revertedWith('err-paused');
        });
      });
    });
  });

  describe('activate', async () => {
    it('is inactive by default', async () => {
      const status = await SEuroOffering.status();
      expect(status.active).to.equal(false);
      expect(status.start).to.equal(0);
      expect(status.stop).to.equal(0);
    });

    it('can be activated by owner', async () => {
      await SEuroOffering.connect(owner).activate();

      const status = await SEuroOffering.status();
      expect(status.active).to.equal(true);
      expect(status.start).to.be.gt(0);
      expect(status.stop).to.equal(0);
    });

    it('cannot be activated by non-owner', async () => {
      const activate = SEuroOffering.connect(user).activate();

      await expect(activate).to.be.revertedWith('Ownable: caller is not the owner');
      const status = await SEuroOffering.status();
      expect(status.active).to.equal(false);
      expect(status.start).to.equal(0);
      expect(status.stop).to.equal(0);
    });
  });

  describe('complete', async () => {
    it('can be completed by owner', async () => {
      await SEuroOffering.connect(owner).activate();
      await SEuroOffering.connect(owner).complete();

      const status = await SEuroOffering.status();
      expect(status.active).to.equal(false);
      expect(status.start).to.be.gt(0);
      expect(status.stop).to.be.gt(0);
      expect(status.stop).to.be.gt(status.start);
    });

    it('cannot be completed by non-owner', async () => {
      await SEuroOffering.connect(owner).activate();
      const complete = SEuroOffering.connect(user).complete();

      await expect(complete).to.be.revertedWith('Ownable: caller is not the owner');
      const status = await SEuroOffering.status();
      expect(status.active).to.equal(true);
      expect(status.start).to.be.gt(0);
      expect(status.stop).to.equal(0);
    });
  });

  describe('readOnlyCalculateSwap', async () => {
    it('calculates the read-only swap amount for token', async () => {
      const toSwap = ethers.utils.parseEther('1');
      const expectedSeuros = await getEthToSEuro(toSwap);
      const seuros = await SEuroOffering.readOnlyCalculateSwap('WETH', toSwap);

      expect(seuros).to.equal(expectedSeuros);
    });
  });

  describe('dependencies', async () => {
    it('updates the dependencies if contract owner', async () => {
      const newTokenManager = await TokenManagerContract.deploy(WETH.address, ChainlinkEthUsd.address);
      const newBondingCurve = await BondingCurveContract.deploy(INITIAL_PRICE, MAX_SUPPLY, BUCKET_SIZE);
      const newCalculator = await SEuroCalculatorContract.deploy(newBondingCurve.address, ChainlinkEurUsd.address);

      let updateTokenManager = SEuroOffering.connect(user).setTokenManager(newTokenManager.address);
      let updateBondingCurve = SEuroOffering.connect(user).setBondingCurve(newBondingCurve.address);
      let updateCalculator = SEuroOffering.connect(user).setCalculator(newCalculator.address);
      await expect(updateTokenManager).to.be.revertedWith('Ownable: caller is not the owner');
      await expect(updateBondingCurve).to.be.revertedWith('Ownable: caller is not the owner');
      await expect(updateCalculator).to.be.revertedWith('Ownable: caller is not the owner');
      expect(await SEuroOffering.tokenManager()).to.equal(TokenManager.address);
      expect(await SEuroOffering.sEuroRateCalculator()).to.equal(SEuroCalculator.address);
      expect(await SEuroOffering.bondingCurve()).to.equal(BondingCurve.address);

      updateTokenManager = SEuroOffering.connect(owner).setTokenManager(newTokenManager.address);
      updateBondingCurve = SEuroOffering.connect(owner).setBondingCurve(newBondingCurve.address);
      updateCalculator = SEuroOffering.connect(owner).setCalculator(newCalculator.address);
      await expect(updateTokenManager).not.to.be.reverted;
      await expect(updateBondingCurve).not.to.be.reverted;
      await expect(updateCalculator).not.to.be.reverted;
      expect(await SEuroOffering.tokenManager()).to.equal(newTokenManager.address);
      expect(await SEuroOffering.sEuroRateCalculator()).to.equal(newCalculator.address);
      expect(await SEuroOffering.bondingCurve()).to.equal(newBondingCurve.address);
    });
  });
});
