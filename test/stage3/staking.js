const { ethers } = require('hardhat');
const { expect } = require('chai');

let owner, user1, user2, SEuro, TST, SEUROTST, INTEREST, StakingContract;
const { etherBalances } = require('../common.js');

beforeEach(async () => {
  [owner, user1, user2] = await ethers.getSigners();
  const SEuroContract = await ethers.getContractFactory('SEuro');
  const ERC20Contract = await ethers.getContractFactory('DUMMY');
  StakingContract = await ethers.getContractFactory('Staking');
  SEuro = await SEuroContract.deploy('sEURO', 'SEUR', [owner.address]);
  TST = await ERC20Contract.deploy('TST', 'TST', 18);
  TST_ADDRESS = TST.address;
  SEUR_ADDRESS = SEuro.address;
  TOTAL_SEURO = etherBalances["ONE_MILLION"];
  SEUROTST = 5000;
  INTEREST = 7000; // 7%
  HUNDRED_PC = 100000;
});

describe('Staking', async () => {
  it('opens the pool and sets all the variables', async () => {
    let blockNum = await ethers.provider.getBlock();
    const then = blockNum.timestamp + 600;

    const Staking = await StakingContract.deploy("Staking", "STS", 1000, then, then + 5000, TST_ADDRESS, SEUR_ADDRESS, SEUROTST, INTEREST);

    expect(await Staking.name()).to.eq("Staking");
    expect(await Staking.symbol()).to.eq("STS");

    expect(await Staking.active()).to.eq(false);
    expect(await Staking.windowStart()).to.eq(1000);
    expect(await Staking.windowEnd()).to.eq(then);
    expect(await Staking.maturity()).to.eq(then + 5000);
    expect(await Staking.SEUROTST()).to.eq(SEUROTST);
    expect(await Staking.INTEREST()).to.eq(INTEREST);
    expect(await Staking.owner()).to.eq(owner.address);

    blockNum = await ethers.provider.getBlock();
    let bi = await Staking.initialised();
    const bt = ethers.BigNumber.from(bi);

    expect(bt).to.eq(blockNum.timestamp);
  });

  it('activates the pool', async () => {
    const Staking = await StakingContract.deploy("Staking", "STS", 1000, 2000, 5000, TST_ADDRESS, SEUR_ADDRESS, SEUROTST, INTEREST);
    expect(await Staking.active()).to.eq(false);

    await Staking.activate();

    expect(await Staking.active()).to.eq(true);
  });

  it('disables the pool', async () => {
    const Staking = await StakingContract.deploy("Staking", "STS", 1000, 200000000000000, 5000, TST_ADDRESS, SEUR_ADDRESS, SEUROTST, INTEREST);

    let disable = Staking.connect(user1).disable();
    await expect(disable).to.be.revertedWith('Ownable: caller is not the owner');

    // pool isn't active
    disable = Staking.disable();
    await expect(disable).to.be.revertedWith('err-not-active');

    // activate the pool
    await Staking.activate();

    let pa = await Staking.active();
    await expect(pa).to.eq(true);

    await Staking.disable();
    pa = await Staking.active();
    await expect(pa).to.eq(false);
  });

  describe('SEURO balance stuff!', async () => {
    it('tests for the seuro balance', async () => {
      const Staking = await StakingContract.deploy("Staking", "STS", 1000, 200000000000000, 5000, TST_ADDRESS, SEUR_ADDRESS, SEUROTST, INTEREST);

      await Staking.activate();

      let balance = await Staking.balance(SEuro.address);
      expect(balance).to.eq(0);

      let value = etherBalances.ONE_MILLION;
      await SEuro.mint(Staking.address, value);

      balance = await Staking.balance(SEuro.address);
      expect(balance).to.eq(value);
    });

    it('tests for the seuro remaining', async () => {
      const Staking = await StakingContract.deploy("Staking", "STS", 1000, 200000000000000, 5000, TST_ADDRESS, SEUR_ADDRESS, SEUROTST, INTEREST);

      await Staking.activate();

      let balance = await Staking.balance(SEuro.address);
      expect(balance).to.eq(0);

      let remaining = await Staking.remaining(SEuro.address);
      expect(remaining).to.eq(0);

      let value = etherBalances.ONE_MILLION;
      await SEuro.mint(Staking.address, value);

      remaining = await Staking.remaining(SEuro.address);
      expect(remaining).to.eq(value);
    });
  });

  describe('Minting, burning, rate cals!', async () => {
    it('mints a token and creates a position', async () => {
      const Staking = await StakingContract.deploy("Staking", "STS", 1000, 200000000000000, 5000, TST_ADDRESS, SEUR_ADDRESS, SEUROTST, INTEREST);

      const weiValue = etherBalances["8K"];
      await expect(Staking.mint(weiValue)).to.be.revertedWith('err-not-active');

      // activate the pool
      await Staking.activate();

      // Send in some SEURO
      const contractSeuroBalance = etherBalances.ONE_MILLION;
      await SEuro.mint(Staking.address, contractSeuroBalance);

      // try without TST
      let mint = Staking.connect(user1).mint(weiValue);
      await expect(mint).to.be.revertedWith('ERC20: insufficient allowance');

      await TST.connect(owner).mint(user1.address, weiValue);
      await TST.connect(user1).approve(Staking.address, weiValue);
      let balance = await TST.balanceOf(user1.address);
      expect(balance).to.eq(weiValue);

      await Staking.connect(user1).mint(weiValue);
      balance = await TST.balanceOf(user1.address);
      expect(balance).to.eq(0);

      // check the 721 mint stuff
      expect(await Staking.balanceOf(user1.address)).to.eq(1);
      expect(await Staking.ownerOf(0)).to.eq(user1.address);

      // seuro reward = 8000 * 0.07 / 20 = 28
      // balance = 1_000_000 - 28 = 999_972
      const rewardInTST = weiValue.mul(INTEREST).div(HUNDRED_PC);
      const rewardInSeuro = rewardInTST.mul(SEUROTST).div(HUNDRED_PC);
      let expectedBalance = contractSeuroBalance.sub(rewardInSeuro);
      expect(await Staking.remaining(SEuro.address)).to.eq(expectedBalance);

      // test positions
      let p = await Staking.position(user1.address);
      expect(p.nonce).to.eq(1);
      expect(p.tokenId).to.eq(0);
      expect(p.open).to.eq(true);
      expect(p.stake).to.eq(weiValue);
      expect(p.reward).to.eq(rewardInSeuro);

      // do again to check increment etc
      await TST.connect(owner).mint(user1.address, weiValue);
      await TST.connect(user1).approve(Staking.address, weiValue);

      // mint - it should not mint...->
      await Staking.connect(user1).mint(weiValue);
      expect(await Staking.balanceOf(user1.address)).to.eq(1);

      p = await Staking.position(user1.address);
      expect(p.nonce).to.eq(2);
      expect(p.tokenId).to.eq(0);
      expect(p.open).to.eq(true);
      expect(p.stake).to.eq(weiValue.mul(2));

      // check the reward is ok
      const expectedUser1Reward = rewardInSeuro.mul(2);
      expect(p.reward).to.eq(expectedUser1Reward);

      // 1_000_000 - (2 * 28) = 999_944
      expectedBalance = contractSeuroBalance.sub(expectedUser1Reward);
      expect(await Staking.remaining(SEuro.address)).to.eq(expectedBalance);

      // with not enough TST
      mint = Staking.connect(user1).mint(10);
      await expect(mint).to.be.revertedWith('err-not-min');

      // mint second user //

      await TST.connect(owner).mint(user2.address, weiValue);
      await TST.connect(user2).approve(Staking.address, weiValue);
      balance = await TST.balanceOf(user2.address);
      expect(balance).to.eq(weiValue);

      await Staking.connect(user2).mint(weiValue);
      balance = await TST.balanceOf(user2.address);
      expect(balance).to.eq(0);

      // check the 721 mint stuff
      expect(await Staking.balanceOf(user2.address)).to.eq(1);
      expect(await Staking.ownerOf(1)).to.eq(user2.address);

      // 1,000,000 - (3 * 28) == 999_916
      expectedBalance = contractSeuroBalance.sub(rewardInSeuro.mul(3));
      expect(await Staking.remaining(SEuro.address)).to.eq(expectedBalance);

      // test positions
      p = await Staking.position(user2.address);
      expect(p.nonce).to.eq(1);
      expect(p.tokenId).to.eq(1);
      expect(p.open).to.eq(true);
      expect(p.stake).to.eq(weiValue);
      expect(p.reward).to.eq(rewardInSeuro);
    });

    it('tests the start, end, supply MINT validations', async () => {
      let blockNum = await ethers.provider.getBlock();
      const then = blockNum.timestamp + 600;

      const Staking = await StakingContract.deploy("Staking", "STS", then, then + 600, 5000, TST_ADDRESS, SEUR_ADDRESS, SEUROTST, INTEREST);

      const weiValue = etherBalances["8K"];

      // activate the pool
      await Staking.activate();

      await TST.connect(owner).mint(user1.address, weiValue);
      await TST.connect(user1).approve(Staking.address, weiValue);
      let balance = await TST.balanceOf(user1.address);
      expect(balance).to.eq(weiValue);

      // actually mint
      let mint = Staking.connect(user1).mint(weiValue);
      await expect(mint).to.be.revertedWith('err-not-started');

      // move the time ahead
      await ethers.provider.send("evm_increaseTime", [601]);
      await ethers.provider.send("evm_mine");

      // over the seuro allowance of 1m
      const tfm = ethers.utils.parseEther('25000000');
      mint = Staking.connect(user1).mint(tfm);
      await expect(mint).to.be.revertedWith('err-overlimit');

      // move the time ahead again
      await ethers.provider.send("evm_increaseTime", [3600]);
      await ethers.provider.send("evm_mine");

      mint = Staking.connect(user1).mint(weiValue);
      await expect(mint).to.be.revertedWith('err-finished');

      // check the disabled
      await Staking.disable();
      mint = Staking.connect(user1).mint(weiValue);
      await expect(mint).to.be.revertedWith('err-not-active');
    });

    it('tests the seuro:tst rate', async () => {
      let blockNum = await ethers.provider.getBlock();
      const then = blockNum.timestamp + 600;

      let Staking = await StakingContract.deploy("Staking", "STS", then, then + 600, then + 5000, TST_ADDRESS, SEUR_ADDRESS, SEUROTST, INTEREST);

      // activate the pool
      await Staking.activate();

      let weiValue = etherBalances["8K"];
      let reward = await Staking.calculateReward(weiValue);

      // 7% of 8,000 == 560 TST
      // 1 TST == 0.05 sEURO
      // 560 TST == 28 sEURO
      let fte = ethers.utils.parseEther('28');
      expect(reward).to.eq(fte);

      // new amounts

      INTEREST = 1500; // 1.5%
      SEUROTST = 3250; // 0.0325
      weiValue = etherBalances["TWO_MILLION"];

      Staking = await StakingContract.deploy("Staking", "STS", then, then + 600, then + 5000, TST_ADDRESS, SEUR_ADDRESS, SEUROTST, INTEREST);
      await Staking.activate();

      // 1.5% of 2,000,000 == 30,000 TST
      // 1 TST == 0.0325 SEURO
      // 30,000 TST == 975 sEURO
      fte = ethers.utils.parseEther('975');
      reward = await Staking.calculateReward(weiValue);
      expect(reward).to.eq(fte);

    });

    it('burns and withdraws seuro', async () => {
      let blockNum = await ethers.provider.getBlock();
      const then = blockNum.timestamp;

      const Staking = await StakingContract.deploy("Staking", "STS", then, then + 600, then + 5000, TST_ADDRESS, SEUR_ADDRESS, SEUROTST, INTEREST);

      const weiValue = etherBalances["8K"];
      await expect(Staking.mint(weiValue)).to.be.revertedWith('err-not-active');

      // activate the pool
      await Staking.activate();

      // add funds
      let value = etherBalances.ONE_MILLION;
      await SEuro.mint(Staking.address, value);

      await TST.connect(owner).mint(user1.address, weiValue);
      await TST.connect(user1).approve(Staking.address, weiValue);
      let TSTBalance = await TST.balanceOf(user1.address);
      expect(TSTBalance).to.eq(weiValue);

      await Staking.connect(user1).mint(weiValue);
      TSTBalance = await TST.balanceOf(user1.address);
      expect(TSTBalance).to.eq(0);

      let burn = Staking.connect(user1).burn();
      await expect(burn).to.be.revertedWith('err-maturity');

      // move the time ahead
      await ethers.provider.send("evm_increaseTime", [5001]);
      await ethers.provider.send("evm_mine");

      // should burn now
      burn = Staking.connect(user1).burn();
      await expect(burn).to.not.be.reverted;

      // check the position
      let p = await Staking.position(user1.address);
      expect(p[2]).to.eq(false);  // closed for business

      const SeuroBalance = await SEuro.balanceOf(user1.address);
      value = ethers.utils.parseEther('28');
      expect(SeuroBalance).to.eq(value);

      TSTBalance = await TST.balanceOf(user1.address);
      expect(TSTBalance).to.eq(weiValue);

      expect(await Staking.balanceOf(user1.address)).to.eq(0);

      // check we cannot re-burn and empty
      burn = Staking.connect(user1).burn();
      await expect(burn).to.be.revertedWith('err-closed');

      // can't burn with no position.
      burn = Staking.connect(user2).burn();
      await expect(burn).to.be.revertedWith('err-not-valid');
    });
  });

  describe('Adding SEURO to the pool!', async () => {
    it('adds and removes seuro to the pool', async () => {
      let blockNum = await ethers.provider.getBlock();
      const then = blockNum.timestamp;

      const Staking = await StakingContract.deploy("Staking", "STS", then, then + 600, then + 5000, TST_ADDRESS, SEUR_ADDRESS, SEUROTST, INTEREST);

      let value = etherBalances.ONE_MILLION;
      await SEuro.mint(Staking.address, value);

      let balance = await SEuro.balanceOf(Staking.address);
      expect(balance).to.eq(value);

      let withdraw = Staking.connect(user1).withdraw(SEuro.address);
      await expect(withdraw).to.be.revertedWith('Ownable: caller is not the owner');

      // withdraw SEURO
      await Staking.withdraw(SEuro.address);

      // the contract should be empty
      balance = await SEuro.balanceOf(Staking.address);
      expect(balance).to.eq(0);

      // the owner shoud have the funds
      balance = await SEuro.balanceOf(owner.address);
      expect(balance).to.eq(value);

      // withdraw TST (which we have none)
      withdraw = Staking.withdraw(TST.address);
      await expect(withdraw).to.be.revertedWith('err-no-funds');
    });
  });

  describe('Catastrophic events!', async () => {
    it('closes pool and allows people to withdraw!!!', async () => {
      let blockNum = await ethers.provider.getBlock();
      const then = blockNum.timestamp;

      const Staking = await StakingContract.deploy("Staking", "STS", then, then + 600, then + 5000, TST_ADDRESS, SEUR_ADDRESS, SEUROTST, INTEREST);

      await Staking.activate();

      let active = await Staking.active();
      expect(active).to.eq(true);

      let catastrophic = await Staking.catastrophic();
      expect(catastrophic).to.eq(false);

      let cat = Staking.connect(user1).catastrophy();
      await expect(cat).to.be.revertedWith('Ownable: caller is not the owner');

      cat = Staking.catastrophy();
      catastrophic = await Staking.catastrophic();
      expect(catastrophic).to.eq(true);

      active = await Staking.active();
      expect(active).to.eq(false);

      cat = Staking.catastrophy();
      await expect(cat).to.be.revertedWith('err-already-active');
    });

    it('closes pool and allows people to withdraw!!!', async () => {
      let blockNum = await ethers.provider.getBlock();
      const then = blockNum.timestamp;

      const Staking = await StakingContract.deploy("Staking", "STS", 0, then + 600, then + 5000, TST_ADDRESS, SEUR_ADDRESS, SEUROTST, INTEREST);

      await Staking.activate();

      let value = etherBalances.ONE_MILLION;
      await SEuro.mint(Staking.address, value);

      // cannot withdraw cos we're not suspended
      let cat = Staking.connect(user1).catastrophicClose();
      await expect(cat).to.be.revertedWith('err-not-allowed');

      // mint
      const weiValue = etherBalances["8K"];
      await TST.connect(owner).mint(user1.address, weiValue);
      await TST.connect(user1).approve(Staking.address, weiValue);
      await Staking.connect(user1).mint(weiValue);

      balance = await TST.balanceOf(user1.address);
      expect(balance).to.eq(0);

      // catastrophy!
      await Staking.catastrophy();
      let catastrophic = await Staking.catastrophic();
      expect(catastrophic).to.eq(true);

      // close
      cat = Staking.connect(user1).catastrophicClose();
      await expect(cat).to.not.be.reverted;

      balance = await TST.balanceOf(user1.address);
      expect(balance).to.eq(weiValue);

      // test positions
      let p = await Staking.position(user1.address);
      expect(p[2]).to.eq(false);     // closed for business
    });

    it('closes pool and checks the validations!!!', async () => {
      let blockNum = await ethers.provider.getBlock();
      const then = blockNum.timestamp;

      const Staking = await StakingContract.deploy("Staking", "STS", 0, then + 600, then + 5000, TST_ADDRESS, SEUR_ADDRESS, SEUROTST, INTEREST);

      await Staking.activate();

      let value = etherBalances.ONE_MILLION;
      await SEuro.mint(Staking.address, value);

      // cannot withdraw cos we're not suspended
      let cat = Staking.connect(user1).catastrophicClose();
      await expect(cat).to.be.revertedWith('err-not-allowed');

      balance = await TST.balanceOf(user1.address);
      expect(balance).to.eq(0);

      // catastrophy!
      await Staking.catastrophy();
      let catastrophic = await Staking.catastrophic();
      expect(catastrophic).to.eq(true);

      // close
      cat = Staking.connect(user1).catastrophicClose();
      await expect(cat).to.be.revertedWith('err-no-position');
    });
  });
});
