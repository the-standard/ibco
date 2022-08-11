const { ethers } = require('hardhat');
const { expect } = require('chai');

let owner, user, random, SEuro, TST, SEUROTST, INTEREST, StakingContract;
const { etherBalances } = require('../common.js');

beforeEach(async () => {
  [owner, user, random] = await ethers.getSigners();
  const SEuroContract = await ethers.getContractFactory('SEuro');
  const ERC20Contract = await ethers.getContractFactory('DUMMY');
  SEuro = await SEuroContract.deploy('sEURO', 'SEUR', [owner.address]);
  TST = await ERC20Contract.deploy('TST', 'TST', 18);
  TST_ADDRESS = TST.address;
  SEUR_ADDRESS = SEuro.address;
  TOTAL_SEURO = etherBalances["ONE_MILLION"];
  SEUROTST = 5000;
  INTEREST = 7000; // 7%
});

describe('Staking', async () => {
  it('opens the pool and sets all the variables', async () => {
    let blockNum = await ethers.provider.getBlock();
    const then = blockNum.timestamp + 600;

    StakingContract = await ethers.getContractFactory('Staking');
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
    StakingContract = await ethers.getContractFactory('Staking');
    const Staking = await StakingContract.deploy("Staking", "STS", 1000, 2000, 5000, TST_ADDRESS, SEUR_ADDRESS, SEUROTST, INTEREST);
    expect(await Staking.active()).to.eq(false);

    await Staking.activate();

    expect(await Staking.active()).to.eq(true);
  });

  it('disables the pool', async () => {
    StakingContract = await ethers.getContractFactory('Staking');
    const Staking = await StakingContract.deploy("Staking", "STS", 1000, 200000000000000, 5000, TST_ADDRESS, SEUR_ADDRESS, SEUROTST, INTEREST);

    let disable = Staking.connect(user).disable();
    await expect(disable).to.be.revertedWith('Ownable: caller is not the owner')

    // pool isn't active
    disable = Staking.disable();
    await expect(disable).to.be.revertedWith('err-not-active')

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
      StakingContract = await ethers.getContractFactory('Staking');
      const Staking = await StakingContract.deploy("Staking", "STS", 1000, 200000000000000, 5000, TST_ADDRESS, SEUR_ADDRESS, SEUROTST, INTEREST);

      await Staking.activate();

      let balance = await Staking.balance(SEuro.address);
      expect(balance).to.eq(0);

      let value = etherBalances.ONE_MILLION;
      await SEuro.mint(Staking.address, value);

      balance = await Staking.balance(SEuro.address);
      expect(balance).to.eq(value);
    })

    it('tests for the seuro remaining', async () => {
      StakingContract = await ethers.getContractFactory('Staking');
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
      StakingContract = await ethers.getContractFactory('Staking');
      const Staking = await StakingContract.deploy("Staking", "STS", 1000, 200000000000000, 5000, TST_ADDRESS, SEUR_ADDRESS, SEUROTST, INTEREST);

      const weiValue = etherBalances["8K"];
      await expect(Staking.mint(weiValue)).to.be.revertedWith('err-not-active');

      let blockNum = await ethers.provider.getBlock();
      blockNum.timestamp + 600;

      // activate the pool
      await Staking.activate()

      // Send in some SEURO
      await SEuro.mint(Staking.address, etherBalances.ONE_MILLION);

      // try without TST
      let mint = Staking.connect(user).mint(weiValue);
      await expect(mint).to.be.revertedWith('ERC20: insufficient allowance');

      await TST.connect(owner).mint(user.address, weiValue);
      await TST.connect(user).approve(Staking.address, weiValue);
      let balance = await TST.balanceOf(user.address);
      expect(balance).to.eq(weiValue);

      await Staking.connect(user).mint(weiValue);
      balance = await TST.balanceOf(user.address);
      expect(balance).to.eq(0);

      // check the 721 mint stuff
      expect(await Staking.balanceOf(user.address)).to.eq(1);
      expect(await Staking.ownerOf(0)).to.eq(user.address);

      // value == 1,000,000 SEURO
      // 428 SEURO reward
      // 1,000,000 - 428 == 999572
      let value = ethers.utils.parseEther('999572');
      expect(await Staking.remaining(SEuro.address)).to.eq(value);

      // test positions
      let p = await Staking.position(user.address)
      expect(p[0]).to.eq(1);        // nonce
      expect(p[1]).to.eq(0);        // tokenId
      expect(p[2]).to.eq(true);     // open for business
      expect(p[3]).to.eq(weiValue); // weiValue

      // check the reward is ok
      let reward = ethers.utils.parseEther('428');
      expect(p[4]).to.eq(reward);   // reward value

      // do again to check increment etc
      await TST.connect(owner).mint(user.address, weiValue);
      await TST.connect(user).approve(Staking.address, weiValue);

      // mint - it should not mint...->
      await Staking.connect(user).mint(weiValue);
      expect(await Staking.balanceOf(user.address)).to.eq(1);

      p = await Staking.position(user.address)
      expect(p[0]).to.eq(2);                // nonce
      expect(p[1]).to.eq(0);                // tokenId
      expect(p[2]).to.eq(true);             // open for business
      expect(p[3]).to.eq(weiValue.mul(2));  // weiValue

      // check the reward is ok
      reward = ethers.utils.parseEther('856'); // 428 * 2
      expect(p[4]).to.eq(reward);   // reward value

      // value == 1,000,000 SEURO
      // 428 SEURO reward
      // 1,000,000 - 428 - 428 == 999144
      value = ethers.utils.parseEther('999144');
      expect(await Staking.remaining(SEuro.address)).to.eq(value);

      // with not enough TST
      mint = Staking.connect(user).mint(10);
      await expect(mint).to.be.revertedWith('err-not-min');

      // mint second user //
      
      await TST.connect(owner).mint(random.address, weiValue);
      await TST.connect(random).approve(Staking.address, weiValue);
      balance = await TST.balanceOf(random.address);
      expect(balance).to.eq(weiValue);

      await Staking.connect(random).mint(weiValue);
      balance = await TST.balanceOf(random.address);
      expect(balance).to.eq(0);

      // check the 721 mint stuff
      expect(await Staking.balanceOf(random.address)).to.eq(1);
      expect(await Staking.ownerOf(1)).to.eq(random.address);

      // value == 1,000,000 SEURO
      // 428 SEURO reward
      // 1,000,000 - 428 - 428 == 999572
      value = ethers.utils.parseEther('998716');
      expect(await Staking.remaining(SEuro.address)).to.eq(value);

      // test positions
      p = await Staking.position(random.address)
      expect(p[0]).to.eq(1);        // nonce
      expect(p[1]).to.eq(1);        // tokenId
      expect(p[2]).to.eq(true);     // open for business
      expect(p[3]).to.eq(weiValue); // weiValue
    });

    it('tests the start, end, supply MINT validations', async () => {
      let blockNum = await ethers.provider.getBlock();
      const then = blockNum.timestamp + 600;

      StakingContract = await ethers.getContractFactory('Staking');
      const Staking = await StakingContract.deploy("Staking", "STS", then, then + 600, 5000, TST_ADDRESS, SEUR_ADDRESS, SEUROTST, INTEREST);

      const weiValue = etherBalances["8K"];

      // activate the pool
      await Staking.activate()

      await TST.connect(owner).mint(user.address, weiValue);
      await TST.connect(user).approve(Staking.address, weiValue);
      let balance = await TST.balanceOf(user.address);
      expect(balance).to.eq(weiValue);

      // actually mint
      let mint = Staking.connect(user).mint(weiValue);
      await expect(mint).to.be.revertedWith('err-not-started');

      // move the time ahead
      await ethers.provider.send("evm_increaseTime", [601])
      await ethers.provider.send("evm_mine")

      // over the seuro allowance of 1m
      const tfm = ethers.utils.parseEther('25000000');
      mint = Staking.connect(user).mint(tfm);
      await expect(mint).to.be.revertedWith('err-overlimit');

      // move the time ahead again
      await ethers.provider.send("evm_increaseTime", [3600])
      await ethers.provider.send("evm_mine")

      mint = Staking.connect(user).mint(weiValue);
      await expect(mint).to.be.revertedWith('err-finished');

      // check the disabled
      await Staking.disable()
      mint = Staking.connect(user).mint(weiValue);
      await expect(mint).to.be.revertedWith('err-not-active');
    });

    it('tests the seuro:tst rate', async () => {
      let blockNum = await ethers.provider.getBlock();
      const then = blockNum.timestamp + 600;

      StakingContract = await ethers.getContractFactory('Staking');
      let Staking = await StakingContract.deploy("Staking", "STS", then, then + 600, then + 5000, TST_ADDRESS, SEUR_ADDRESS, SEUROTST, INTEREST);

      // activate the pool
      await Staking.activate()

      let weiValue = etherBalances["8K"];
      let reward = await Staking.reward(weiValue);

      // 8,000 TST == 400 SEURO at a rate of 0.05 SEURO:TST
      // 1 TST == 0.05 SEURO
      // Assume interest is 7%, the total would be 400 * 1.07 == 428 SEURO
      let fte = ethers.utils.parseEther('428');
      expect(reward).to.eq(fte);

      // new amounts

      INTEREST = 1500; // 1.5%
      SEUROTST = 3250; // 0.0325
      weiValue = etherBalances["TWO_MILLION"];

      Staking = await StakingContract.deploy("Staking", "STS", then, then + 600, then + 5000, TST_ADDRESS, SEUR_ADDRESS, SEUROTST, INTEREST);
      await Staking.activate()

      // 2,000,000 TST == 65,000 SEURO at a rate of 0.0325 SEURO:TST
      // 1 TST == 0.0325 SEURO
      // Assume interest is 1.5%, the total would be 65000 * 1.015 == 65975 SEURO
      fte = ethers.utils.parseEther('65975');
      reward = await Staking.reward(weiValue);
      expect(reward).to.eq(fte);

    });

    it('burns and withdraws seuro', async () => {
      let blockNum = await ethers.provider.getBlock();
      const then = blockNum.timestamp;

      StakingContract = await ethers.getContractFactory('Staking');
      const Staking = await StakingContract.deploy("Staking", "STS", then, then + 600, then + 5000, TST_ADDRESS, SEUR_ADDRESS, SEUROTST, INTEREST);

      const weiValue = etherBalances["8K"];
      await expect(Staking.mint(weiValue)).to.be.revertedWith('err-not-active');

      // activate the pool
      await Staking.activate()

      // add funds
      let value = etherBalances.ONE_MILLION;
      await SEuro.mint(Staking.address, value);

      await TST.connect(owner).mint(user.address, weiValue);
      await TST.connect(user).approve(Staking.address, weiValue);
      let balance = await TST.balanceOf(user.address);
      expect(balance).to.eq(weiValue);

      await Staking.connect(user).mint(weiValue);
      balance = await TST.balanceOf(user.address);
      expect(balance).to.eq(0);

      let burn = Staking.connect(user).burn();
      await expect(burn).to.be.revertedWith('err-maturity');

      // move the time ahead
      await ethers.provider.send("evm_increaseTime", [5001])
      await ethers.provider.send("evm_mine")

      // should burn now
      burn = Staking.connect(user).burn();
      await expect(burn).to.not.be.reverted;

      // check the position
      let p = await Staking.position(user.address)
      expect(p[2]).to.eq(false);  // closed for business

      balance = await SEuro.balanceOf(user.address);
      value = ethers.utils.parseEther('428');
      expect(balance).to.eq(value);

      expect(await Staking.balanceOf(user.address)).to.eq(0);

      // check we cannot re-burn and empty
      burn = Staking.connect(user).burn();
      await expect(burn).to.be.revertedWith('err-closed');

      // can't burn with no position.
      burn = Staking.connect(random).burn();
      await expect(burn).to.be.revertedWith('err-not-valid');
    });
  });

  describe('Adding SEURO to the pool!', async () => {
    it('adds and removes seuro to the pool', async () => {
      let blockNum = await ethers.provider.getBlock();
      const then = blockNum.timestamp;

      StakingContract = await ethers.getContractFactory('Staking');
      const Staking = await StakingContract.deploy("Staking", "STS", then, then + 600, then + 5000, TST_ADDRESS, SEUR_ADDRESS, SEUROTST, INTEREST);

      let value = etherBalances.ONE_MILLION;
      await SEuro.mint(Staking.address, value);

      let balance = await SEuro.balanceOf(Staking.address);
      expect(balance).to.eq(value);

      let withdraw = Staking.connect(user).withdraw(SEuro.address);
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

      StakingContract = await ethers.getContractFactory('Staking');
      const Staking = await StakingContract.deploy("Staking", "STS", then, then + 600, then + 5000, TST_ADDRESS, SEUR_ADDRESS, SEUROTST, INTEREST);

      await Staking.activate();

      let active = await Staking.active();
      expect(active).to.eq(true);

      let catastrophic = await Staking.catastrophic();
      expect(catastrophic).to.eq(false);

      let cat = Staking.connect(user).catastrophy();
      await expect(cat).to.be.revertedWith('Ownable: caller is not the owner')

      cat = Staking.catastrophy();
      catastrophic = await Staking.catastrophic();
      expect(catastrophic).to.eq(true);

      active = await Staking.active();
      expect(active).to.eq(false);

      cat = Staking.catastrophy();
      await expect(cat).to.be.revertedWith('err-already-active')
    });

    it('closes pool and allows people to withdraw!!!', async () => {
      let blockNum = await ethers.provider.getBlock();
      const then = blockNum.timestamp;

      StakingContract = await ethers.getContractFactory('Staking');
      const Staking = await StakingContract.deploy("Staking", "STS", 0, then + 600, then + 5000, TST_ADDRESS, SEUR_ADDRESS, SEUROTST, INTEREST);

      await Staking.activate();

      let value = etherBalances.ONE_MILLION;
      await SEuro.mint(Staking.address, value);

      // cannot withdraw cos we're not suspended
      let cat = Staking.connect(user).catastrophicClose();
      await expect(cat).to.be.revertedWith('err-not-allowed')

      // mint
      const weiValue = etherBalances["8K"];
      await TST.connect(owner).mint(user.address, weiValue);
      await TST.connect(user).approve(Staking.address, weiValue);
      await Staking.connect(user).mint(weiValue);

      balance = await TST.balanceOf(user.address);
      expect(balance).to.eq(0);

      // catastrophy!
      await Staking.catastrophy();
      let catastrophic = await Staking.catastrophic();
      expect(catastrophic).to.eq(true);
      
      // close
      cat = Staking.connect(user).catastrophicClose();
      await expect(cat).to.not.be.reverted;

      balance = await TST.balanceOf(user.address);
      expect(balance).to.eq(weiValue);

      // test positions
      let p = await Staking.position(user.address)
      expect(p[2]).to.eq(false);     // closed for business
    })

    it('closes pool and checks the validations!!!', async () => {
      let blockNum = await ethers.provider.getBlock();
      const then = blockNum.timestamp;

      StakingContract = await ethers.getContractFactory('Staking');
      const Staking = await StakingContract.deploy("Staking", "STS", 0, then + 600, then + 5000, TST_ADDRESS, SEUR_ADDRESS, SEUROTST, INTEREST);

      await Staking.activate();

      let value = etherBalances.ONE_MILLION;
      await SEuro.mint(Staking.address, value);

      // cannot withdraw cos we're not suspended
      let cat = Staking.connect(user).catastrophicClose();
      await expect(cat).to.be.revertedWith('err-not-allowed')

      balance = await TST.balanceOf(user.address);
      expect(balance).to.eq(0);

      // catastrophy!
      await Staking.catastrophy();
      let catastrophic = await Staking.catastrophic();
      expect(catastrophic).to.eq(true);
      
      // close
      cat = Staking.connect(user).catastrophicClose();
      await expect(cat).to.be.revertedWith('err-no-position')
    })
  });
});
