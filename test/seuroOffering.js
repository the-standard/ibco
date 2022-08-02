const { ethers } = require('hardhat');
const { expect } = require('chai');
const { WETH_ADDRESS, CHAINLINK_DEC, CHAINLINK_ETH_USD, CHAINLINK_DAI_USD, CHAINLINK_EUR_USD } = require('./common');

describe('SEuroOffering', async () => {
  const WETH_BYTES = ethers.utils.formatBytes32String('WETH');
  const DAI_DEC = 18;
  const BUCKET_SIZE = ethers.utils.parseEther('100000');
  const INITIAL_PRICE = ethers.utils.parseEther('0.8');
  const MAX_SUPPLY = ethers.utils.parseEther('200000000');
  let SEuroOffering, SEuro, BondingCurve, SEuroCalculator, TokenManager, WETH, owner, user, collateralWallet;

  async function buyWETH(signer, amount) {
    await WETH.connect(signer).deposit({ value: amount });
  }

  async function buyToken(signer, token, amount) {
    const SwapManagerContract = await ethers.getContractFactory('SwapManager');
    const SwapManager = await SwapManagerContract.deploy();
    await SwapManager.connect(signer).swapEthForToken(token, {value: amount});
  }

  async function getEthToSEuro(amount) {
    return await SEuroCalculator.callStatic.calculate(amount, CHAINLINK_ETH_USD, CHAINLINK_DEC);
  }

  async function getDaiToSEuro(amount) {
    return await SEuroCalculator.callStatic.calculate(amount, CHAINLINK_DAI_USD, CHAINLINK_DEC);
  }

  async function getBucketPrice(index) {
    const TestBondingCurve = await (await ethers.getContractFactory('TestBondingCurve')).deploy(
      INITIAL_PRICE, MAX_SUPPLY, BUCKET_SIZE
    );
    return await TestBondingCurve.callStatic.getPriceOfBucket(index);
  }

  beforeEach(async () => {
    [owner, user, collateralWallet] = await ethers.getSigners();

    const SEuroContract = await ethers.getContractFactory('SEuro');
    const SEuroOfferingContract = await ethers.getContractFactory('SEuroOffering');
    const BondingCurveContract = await ethers.getContractFactory('BondingCurve');
    const SEuroCalculatorContract = await ethers.getContractFactory('SEuroCalculator');
    const TokenManagerContract = await ethers.getContractFactory('TokenManager');

    WETH = await ethers.getContractAt('WETH', WETH_ADDRESS);
    SEuro = await SEuroContract.deploy('SEuro', 'SEUR', [owner.address]);
    BondingCurve = await BondingCurveContract.deploy(INITIAL_PRICE, MAX_SUPPLY, BUCKET_SIZE);
    SEuroCalculator = await SEuroCalculatorContract.deploy(BondingCurve.address, CHAINLINK_EUR_USD, CHAINLINK_DEC);
    TokenManager = await TokenManagerContract.deploy(WETH_ADDRESS, CHAINLINK_ETH_USD, CHAINLINK_DEC);
    SEuroOffering = await SEuroOfferingContract.deploy(SEuro.address, SEuroCalculator.address, TokenManager.address, BondingCurve.address);

    await SEuro.connect(owner).grantRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MINTER_ROLE')), SEuroOffering.address)
    await SEuroCalculator.grantRole(await SEuroCalculator.OFFERING(), SEuroOffering.address);
    await BondingCurve.grantRole(await BondingCurve.UPDATER(), SEuroOffering.address);
    await BondingCurve.grantRole(await BondingCurve.CALCULATOR(), SEuroCalculator.address);
  });

  describe('swap', async () => {
    let PriceConverter;

    before(async () => {
      PriceConverter = await (await ethers.getContractFactory('PriceConverter')).deploy();
    });

    it('will not swap for eth if ibco not active', async () => {
      const toSwap = ethers.utils.parseEther('1');

      const swap = SEuroOffering.connect(user).swapETH({ value: toSwap });

      await expect(swap).to.be.revertedWith('err-ibco-inactive')
      const userSEuroBalance = await SEuro.balanceOf(user.address);
      expect(userSEuroBalance).to.eq(0);
    });

    it('will not swap for token if ibco not active', async () => {
      const toSwap = ethers.utils.parseEther('1');
      await buyWETH(user, toSwap);
      await WETH.connect(user).approve(SEuroOffering.address, toSwap);

      const swap = SEuroOffering.connect(user).swap(WETH_BYTES, toSwap);

      await expect(swap).to.be.revertedWith('err-ibco-inactive')
      const userSEuroBalance = await SEuro.balanceOf(user.address);
      expect(userSEuroBalance).to.eq(0);
    });

    context('activated', async () => {
      beforeEach(async () => {
        await SEuroOffering.connect(owner).activate();
      });

      it('swaps for given token', async () => {
        const toSwap = ethers.utils.parseEther('1');
        await buyWETH(user, toSwap);
        await WETH.connect(user).approve(SEuroOffering.address, toSwap);


        const expectedEuros = await getEthToSEuro(toSwap);
        const swap = SEuroOffering.connect(user).swap(WETH_BYTES, toSwap);
        await expect(swap).to.emit(SEuroOffering, 'Swap').withArgs(WETH_BYTES, toSwap, expectedEuros);
        const userSEuroBalance = await SEuro.balanceOf(user.address);
        expect(userSEuroBalance.toString()).to.equal(expectedEuros.toString());
      });

      it('will not swap without preapproval', async () => {
        const toSwap = ethers.utils.parseEther('1');
        await buyWETH(user, toSwap);

        const swap = SEuroOffering.connect(user).swap(WETH_BYTES, toSwap);

        await expect(swap).to.be.revertedWith('err-tok-allow')
        const userSEuroBalance = await SEuro.balanceOf(user.address);
        expect(userSEuroBalance.toString()).to.equal('0');
      });

      it('will not swap without balance of token', async () => {
        const toSwap = ethers.utils.parseEther('1');
        await WETH.connect(user).withdraw(await WETH.balanceOf(user.address));
        await WETH.connect(user).approve(SEuroOffering.address, toSwap);

        const swap = SEuroOffering.connect(user).swap(WETH_BYTES, toSwap);

        await expect(swap).to.be.revertedWith('err-tok-bal')
        const userSEuroBalance = await SEuro.balanceOf(user.address);
        expect(userSEuroBalance.toString()).to.equal('0');
      });

      it('will swap for any accepted token', async () => {
        const toSwap = ethers.utils.parseEther('1');
        const daiBytes = ethers.utils.formatBytes32String('DAI');
        const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
        await TokenManager.connect(owner).addAcceptedToken(daiBytes, DAI_ADDRESS, DAI_DEC, CHAINLINK_DAI_USD, CHAINLINK_DEC);

        await buyToken(user, DAI_ADDRESS, toSwap);
        const Dai = await ethers.getContractAt('IERC20', DAI_ADDRESS);
        const userTokens = await Dai.balanceOf(user.address);
        await Dai.connect(user).approve(SEuroOffering.address, userTokens);

        const expectedEuros = await getDaiToSEuro(userTokens);
        const swap = SEuroOffering.connect(user).swap(daiBytes, userTokens);
        await expect(swap).to.emit(SEuroOffering, 'Swap').withArgs(daiBytes, userTokens, expectedEuros);
        const userSEuroBalance = await SEuro.balanceOf(user.address);
        expect(userSEuroBalance.toString()).to.equal(expectedEuros.toString());
      });

      it('updates the price in bonding curve when bucket is crossed', async () => {
        const amount = await PriceConverter.eurosToEth(BUCKET_SIZE);
        await buyWETH(user, amount);
        await WETH.connect(user).approve(SEuroOffering.address, amount);

        await SEuroOffering.connect(user).swap(WETH_BYTES, amount);

        const bucket = await BondingCurve.currentBucket();
        expect(bucket.index).to.equal(1);
        expect(bucket.price).to.equal(await getBucketPrice(1));
      });

      describe('swapETH', async () => {
        it('swaps for eth', async () => {
          const toSwap = ethers.utils.parseEther('1');
          const ethBytes = ethers.utils.formatBytes32String('ETH');

          const expectedEuros = await getEthToSEuro(toSwap);
          const swap = SEuroOffering.connect(user).swapETH({ value: toSwap });
          await expect(swap).to.emit(SEuroOffering, 'Swap').withArgs(ethBytes, toSwap, expectedEuros);
          const userSEuroBalance = await SEuro.balanceOf(user.address);
          expect(userSEuroBalance.toString()).to.equal(expectedEuros.toString());
        });

        it('updates the price in bonding curve when bucket is crossed', async () => {
          const amount = await PriceConverter.eurosToEth(BUCKET_SIZE);
          await SEuroOffering.connect(user).swapETH({ value: amount });

          const bucket = await BondingCurve.currentBucket();
          expect(bucket.index).to.equal(1);
          expect(bucket.price).to.equal(await getBucketPrice(1));
        });
      });
    });
  });

  describe('transferring collateral', async () => {
    it('transfers deposited collateral to designated wallet', async () => {
      await SEuroOffering.activate();
      await SEuroOffering.setCollateralWallet(collateralWallet.address);

      const toSwap = ethers.utils.parseEther('1');
      await buyWETH(user, toSwap);
      await WETH.connect(user).approve(SEuroOffering.address, toSwap);
      await SEuroOffering.connect(user).swap(WETH_BYTES, toSwap);
      expect(await WETH.balanceOf(collateralWallet.address)).to.equal(toSwap);

      await SEuroOffering.connect(user).swapETH({ value: toSwap });
      expect(await WETH.balanceOf(collateralWallet.address)).to.equal(toSwap.mul(2));
    });
  });

  describe('activate', async () => {
    it('is inactive by default', async () => {
      const status = await SEuroOffering.getStatus();
      expect(status._active).to.equal(false);
      expect(status._start).to.equal(0);
      expect(status._stop).to.equal(0);
    });

    it('can be activated by owner', async () => {
      await SEuroOffering.connect(owner).activate();

      const status = await SEuroOffering.getStatus();
      expect(status._active).to.equal(true);
      expect(status._start).to.be.gt(0);
      expect(status._stop).to.equal(0);
    });

    it('cannot be activated by non-owner', async () => {
      const activate = SEuroOffering.connect(user).activate();

      await expect(activate).to.be.revertedWith('Ownable: caller is not the owner');
      const status = await SEuroOffering.getStatus();
      expect(status._active).to.equal(false);
      expect(status._start).to.equal(0);
      expect(status._stop).to.equal(0);
    });
  });

  describe('complete', async () => {
    it('can be completed by owner', async () => {
      await SEuroOffering.connect(owner).activate();
      await SEuroOffering.connect(owner).complete();

      const status = await SEuroOffering.getStatus();
      expect(status._active).to.equal(false);
      expect(status._start).to.be.gt(0);
      expect(status._stop).to.be.gt(0);
      expect(status._stop).to.be.gt(status._start);
    });

    it('cannot be completed by non-owner', async () => {
      await SEuroOffering.connect(owner).activate();
      const complete = SEuroOffering.connect(user).complete();

      await expect(complete).to.be.revertedWith('Ownable: caller is not the owner');
      const status = await SEuroOffering.getStatus();
      expect(status._active).to.equal(true);
      expect(status._start).to.be.gt(0);
      expect(status._stop).to.equal(0);
    });
  });

  describe('readOnlyCalculateSwap', async () => {
    it('calculates the read-only swap amount for token', async () => {
      const toSwap = ethers.utils.parseEther('1');
      const wethBytes = ethers.utils.formatBytes32String('WETH');
      const expectedSeuros = await getEthToSEuro(toSwap);
      const seuros = await SEuroOffering.readOnlyCalculateSwap(wethBytes, toSwap);

      expect(seuros).to.equal(expectedSeuros);
    });
  });
});
