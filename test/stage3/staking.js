const { ethers } = require('hardhat');
const { expect } = require('chai');

let owner, user1, user2, SEuro, TST, simpleInterestRate, TGateway, StakingContract;
const { etherBalances, getLibraryFactory } = require('../common.js');

beforeEach(async () => {
  [owner, user1, user2] = await ethers.getSigners();
  const ERC20Contract = await ethers.getContractFactory('DUMMY');
  const GatewayContract = await ethers.getContractFactory('StandardTokenGateway');
  StakingContract = await getLibraryFactory(owner, 'Staking');
  SEuro = await ERC20Contract.deploy('sEURO', 'SEUR', 18);
  TST = await ERC20Contract.deploy('TST', 'TST', 18);
  TGateway = await GatewayContract.connect(owner).deploy(TST.address);
  TST_ADDRESS = TST.address;
  SEUR_ADDRESS = SEuro.address;
  simpleInterestRate = 5000; // 5%
});

describe('Staking', async () => {
  it('opens the pool and sets all the variables', async () => {
    let blockNum = await ethers.provider.getBlock();
    const start = blockNum.timestamp;
    const endTime = start + 3600; // an hour later
    const maturity = start + 600; // 10 minutes later

    const Staking = await StakingContract.deploy("Staking", "STS", start, endTime, maturity, TGateway.address, TST_ADDRESS, SEUR_ADDRESS, simpleInterestRate);

    expect(await Staking.name()).to.eq("Staking");
    expect(await Staking.symbol()).to.eq("STS");

    expect(await Staking.active()).to.eq(false);
    expect(await Staking.windowStart()).to.eq(start);
    expect(await Staking.windowEnd()).to.eq(endTime);
    expect(await Staking.maturity()).to.eq(maturity);
    expect(await Staking.SI_RATE()).to.eq(simpleInterestRate);
    expect(await Staking.owner()).to.eq(owner.address);

    blockNum = await ethers.provider.getBlock();
    let timestamp = await Staking.initialisedAt();
    const num = ethers.BigNumber.from(timestamp);

    expect(num).to.eq(blockNum.timestamp);
  });

  it('activates the pool', async () => {
    const Staking = await StakingContract.deploy("Staking", "STS", 2000, 5000, 2600, TGateway.address, TST_ADDRESS, SEUR_ADDRESS, simpleInterestRate);
    expect(await Staking.active()).to.eq(false);
    await Staking.activate();
    expect(await Staking.active()).to.eq(true);
  });

  it('disables the pool', async () => {
    const Staking = await StakingContract.deploy("Staking", "STS", 1000, 200000000000000, 5000, TGateway.address, TST_ADDRESS, SEUR_ADDRESS, simpleInterestRate);

    let isDisable = Staking.connect(user1).disable();
    await expect(isDisable).to.be.revertedWith('Ownable: caller is not the owner');

    // pool isn't active
    isDisabled = Staking.disable();
    await expect(isDisabled).to.be.revertedWith('err-not-active');

    // activate the pool
    await Staking.activate();

    let pa = await Staking.active();
    await expect(pa).to.eq(true);

    await Staking.disable();
    pa = await Staking.active();
    await expect(pa).to.eq(false);
  });

  describe('SEURO balance', async () => {
    it('tests for the seuro balance', async () => {
      const Staking = await StakingContract.deploy("Staking", "STS", 1000, 200000000000000, 5000, TGateway.address, TST_ADDRESS, SEUR_ADDRESS, simpleInterestRate);

      await Staking.activate();

      let balance = await Staking.balance(SEuro.address);
      expect(balance).to.eq(0);

      let value = etherBalances.ONE_MILLION;
      await SEuro.mint(Staking.address, value);

      balance = await Staking.balance(SEuro.address);
      expect(balance).to.eq(value);
    });

    it('tests for the seuro remaining', async () => {
      let blockNum = await ethers.provider.getBlock();
      const start = blockNum.timestamp;
      const Staking = await StakingContract.deploy("Staking", "STS", start, start + 3600, 5000, TGateway.address, TST_ADDRESS, SEUR_ADDRESS, simpleInterestRate);

      await Staking.activate();

      let balance = await Staking.balance(SEuro.address);
      expect(balance).to.eq(0);

      let remaining = await Staking.remaining(SEuro.address);
      expect(remaining).to.eq(0);

      let value = etherBalances.ONE_MILLION;
      await SEuro.mint(Staking.address, value);

      remaining = await Staking.remaining(SEuro.address);
      expect(remaining).to.eq(value);

      await TST.connect(owner).mint(user1.address, value);
      await TST.connect(user1).approve(Staking.address, value);
      await Staking.connect(user1).mint(value);
      // stake of 1_000_000 tst
      // 5% interest = 50_000 tst
      // 50_000 * 0.055 = 2750 seuro
      expectedReward = ethers.utils.parseEther('2750');
      
      expect(await Staking.balance(SEuro.address)).to.eq(value);
      remaining = await Staking.remaining(SEuro.address);
      let expectedRemaining = value.sub(expectedReward);
      expect(remaining).to.equal(expectedRemaining);
      
      await Staking.connect(user1).burn();

      expect(await Staking.balance(SEuro.address)).to.eq(value.sub(expectedReward));
      expect(await Staking.remaining(SEuro.address)).to.eq(value.sub(expectedReward));
    });
  });

  describe('mint and burn rate calculations', async () => {
    it('mints a token and creates a position', async () => {
      const Staking = await StakingContract.deploy("Staking", "STS", 1000, 200000000000000, 5000, TGateway.address, TST_ADDRESS, SEUR_ADDRESS, simpleInterestRate);

      // Set TST / sEURO price as 0.05 (5000000 / 10 ^ 8)
      // or 20 TST = 1 sEURO
      await TGateway.connect(owner).setTstEurPrice(5000000, 8);

      const standardBalance = etherBalances['8K'];
      await expect(Staking.mint(standardBalance)).to.be.revertedWith('err-not-active');

      // activate the pool
      await Staking.activate();

      // Send in some SEURO
      let contractSeuroBalance = etherBalances.ONE_MILLION;
      await SEuro.mint(Staking.address, contractSeuroBalance);

      // try without TST allowance
      let mint = Staking.connect(user1).mint(standardBalance);
      await expect(mint).to.be.revertedWith('ERC20: insufficient allowance');

      await TST.connect(owner).mint(user1.address, standardBalance);
      await TST.connect(user1).approve(Staking.address, standardBalance);
      let bal = await TST.balanceOf(user1.address);
      expect(bal).to.eq(standardBalance);

      await Staking.connect(user1).mint(standardBalance);
      balance = await TST.balanceOf(user1.address);
      expect(balance).to.eq(0);

      // check the NFT mint
      expect(await Staking.balanceOf(user1.address)).to.eq(1);
      expect(await Staking.ownerOf(1)).to.eq(user1.address);

      // the reward should be 5% of 8000 TSTs but in SEUR:
      // 5% of 8000 = 400 TST = 20 sEURO
      let rewardInSeuro1 = bal.div(400);
      contractSeuroBalance = contractSeuroBalance.sub(rewardInSeuro1);
      expect(await Staking.remaining(SEuro.address)).to.eq(contractSeuroBalance);

      // test positions
      let p = await Staking.position(user1.address);
      expect(p.nonce).to.eq(1);
      expect(p.tokenId).to.eq(1);
      expect(p.open).to.eq(true);
      expect(p.stake).to.eq(standardBalance);
      expect(p.reward).to.eq(rewardInSeuro1);

      // do again to check increment etc
      await TST.connect(owner).mint(user1.address, standardBalance);
      await TST.connect(user1).approve(Staking.address, standardBalance);

      await Staking.connect(user1).mint(standardBalance);
      expect(await Staking.balanceOf(user1.address)).to.eq(1);

      p = await Staking.position(user1.address);
      expect(p.nonce).to.eq(2);
      expect(p.tokenId).to.eq(1);
      expect(p.open).to.eq(true);
      expect(p.stake).to.eq(standardBalance.mul(2));

      // check that the reward is the double amount now
      let doubleReward = rewardInSeuro1.mul(2);
      expect(p.reward).to.eq(doubleReward);

      contractSeuroBalance = contractSeuroBalance.sub(rewardInSeuro1);
      expect(await Staking.remaining(SEuro.address)).to.eq(contractSeuroBalance);

      // with not enough TST
      mint = Staking.connect(user1).mint(10);
      await expect(mint).to.be.revertedWith('err-not-min');

      const otherStandardBal = etherBalances['10K'];
      // mint TSTs for second user
      await TST.connect(owner).mint(user2.address, otherStandardBal);
      await TST.connect(user2).approve(Staking.address, otherStandardBal);
      balance = await TST.balanceOf(user2.address);
      expect(balance).to.eq(otherStandardBal);

      await Staking.connect(user2).mint(otherStandardBal);
      balance = await TST.balanceOf(user2.address);
      expect(balance).to.eq(0);

      // check the 721 mint stuff
      expect(await Staking.balanceOf(user2.address)).to.eq(1);
      expect(await Staking.ownerOf(2)).to.eq(user2.address);

      // the reward should be 5% of 10000 TSTs but in SEUR:
      // 5% of 10000 = 500 TST = 25 sEURO
      let rewardInSeuro2 = otherStandardBal.div(400);
      contractSeuroBalance = contractSeuroBalance.sub(rewardInSeuro2);
      expect(await Staking.remaining(SEuro.address)).to.eq(contractSeuroBalance);

      // test positions
      p = await Staking.position(user2.address);
      expect(p.nonce).to.eq(1);
      expect(p.tokenId).to.eq(2);
      expect(p.open).to.eq(true);
      expect(p.stake).to.eq(otherStandardBal);
      expect(p.reward).to.eq(rewardInSeuro2);
    });

    it('tests the start, end, and validate stakes', async () => {
      let blockNum = await ethers.provider.getBlock();
      const then = blockNum.timestamp + 600;

      const Staking = await StakingContract.deploy("Staking", "STS", then, then + 600, 100, TGateway.address, TST_ADDRESS, SEUR_ADDRESS, simpleInterestRate);

      const standardBalance = etherBalances["8K"];

      // activate the pool
      await Staking.activate();

      await TST.connect(owner).mint(user1.address, standardBalance);
      await TST.connect(user1).approve(Staking.address, standardBalance);
      let balance = await TST.balanceOf(user1.address);
      expect(balance).to.eq(standardBalance);

      // actually mint
      let mint = Staking.connect(user1).mint(standardBalance);
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

      mint = Staking.connect(user1).mint(standardBalance);
      await expect(mint).to.be.revertedWith('err-finished');

      // check the disabled
      await Staking.disable();
      mint = Staking.connect(user1).mint(standardBalance);
      await expect(mint).to.be.revertedWith('err-not-active');
    });

    it('tests the exchange rate', async () => {
      await TGateway.connect(owner).setTstEurPrice(5000000, 8);
      let blockNum = await ethers.provider.getBlock();
      const then = blockNum.timestamp + 600;

      let Staking = await StakingContract.deploy("Staking", "STS", then, then + 600, then + 100, TGateway.address, TST_ADDRESS, SEUR_ADDRESS, simpleInterestRate);

      // activate the pool
      await Staking.activate();

      let standardBalance = etherBalances["8K"];
      let reward = await Staking.calculateReward(standardBalance);

      // 5% of 8,000 TST = 400 TST = 20 sEURO
      let expectedReward = ethers.utils.parseEther('20');
      expect(reward).to.eq(expectedReward);

      // new amounts
      simpleInterestRate = 1500;
      standardBalance = etherBalances.TWO_MILLION;

      Staking = await StakingContract.deploy("Staking", "STS", then, then + 600, then + 5000, TGateway.address, TST_ADDRESS, SEUR_ADDRESS, simpleInterestRate);
      await Staking.activate();

      // 1.5% of 2,000,000 == 30,000 TST
      // 30,000 TST == 1,500 sEURO
      expectedReward = ethers.utils.parseEther('1500');
      reward = await Staking.calculateReward(standardBalance);
      expect(reward).to.eq(expectedReward);
    });

    it('burns and withdraws seuro', async () => {
      await TGateway.connect(owner).setTstEurPrice(5000000, 8);
      let blockNum = await ethers.provider.getBlock();
      const then = blockNum.timestamp;

      const Staking = await StakingContract.deploy("Staking", "STS", then, then + 600, then + 5000, TGateway.address, TST_ADDRESS, SEUR_ADDRESS, simpleInterestRate);

      const standardBalance = etherBalances["8K"];
      await expect(Staking.mint(standardBalance)).to.be.revertedWith('err-not-active');

      // activate the pool
      await Staking.activate();

      // add funds
      await SEuro.mint(Staking.address, etherBalances.ONE_MILLION);

      await TST.connect(owner).mint(user1.address, standardBalance);
      await TST.connect(user1).approve(Staking.address, standardBalance);
      let TSTBalance = await TST.balanceOf(user1.address);
      expect(TSTBalance).to.eq(standardBalance);

      await Staking.connect(user1).mint(standardBalance);
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
      const expectedSeuros = standardBalance.div(400);
      expect(SeuroBalance).to.eq(expectedSeuros);

      TSTBalance = await TST.balanceOf(user1.address);
      expect(TSTBalance).to.eq(standardBalance);

      expect(await Staking.balanceOf(user1.address)).to.eq(0);

      // check we cannot re-burn and empty
      burn = Staking.connect(user1).burn();
      await expect(burn).to.be.revertedWith('err-closed');

      // can't burn with no position.
      burn = Staking.connect(user2).burn();
      await expect(burn).to.be.revertedWith('err-not-valid');
    });
  });

  describe('Adding SEURO to the pool', async () => {
    it('adds and removes seuro to the pool', async () => {
      let blockNum = await ethers.provider.getBlock();
      const then = blockNum.timestamp;

      const Staking = await StakingContract.deploy("Staking", "STS", then, then + 600, then + 5000, TGateway.address, TST_ADDRESS, SEUR_ADDRESS, simpleInterestRate);

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

  describe('catastrophic events', async () => {
    it('checks that the catastrophe event reverts in various situations', async () => {
      let blockNum = await ethers.provider.getBlock();
      const then = blockNum.timestamp;
      const Staking = await StakingContract.deploy("Staking", "STS", then, then + 600, then + 5000, TGateway.address, TST_ADDRESS, SEUR_ADDRESS, simpleInterestRate);

      await Staking.connect(owner).activate();
      let active = await Staking.active();
      expect(active).to.eq(true);

      cat = Staking.connect(user1).enableCatastrophe();
      await expect(cat).to.be.revertedWith('Ownable: caller is not the owner');

      cat = await Staking.enableCatastrophe();
      let isCat = await Staking.isCatastrophe();
      expect(isCat).to.eq(true);

      active = await Staking.active();
      expect(active).to.eq(false);

      cat = Staking.connect(owner).enableCatastrophe();
      await expect(cat).to.be.revertedWith('err-already-active');
    });

    it('closes pool and allows people to withdraw', async () => {
      let blockNum = await ethers.provider.getBlock();
      const then = blockNum.timestamp;
      const Staking = await StakingContract.deploy("Staking", "STS", then, then + 600, then + 5000, TGateway.address, TST_ADDRESS, SEUR_ADDRESS, simpleInterestRate);

      await Staking.connect(owner).activate();
      await SEuro.mint(Staking.address, etherBalances.ONE_MILLION);

      // cannot withdraw cos we're not suspended
      let cat = Staking.connect(owner).emergencyWithdraw();
      await expect(cat).to.be.revertedWith('err-not-catastrophe');

      const standardBalance = etherBalances["8K"];
      await TST.connect(owner).mint(user1.address, standardBalance);
      await TST.connect(user1).approve(Staking.address, standardBalance);
      await Staking.connect(user1).mint(standardBalance);
      balance = await TST.balanceOf(user1.address);
      expect(balance).to.eq(0);

      await Staking.connect(owner).enableCatastrophe();
      let isCat = await Staking.isCatastrophe();
      expect(isCat).to.eq(true);

      // close
      cat = Staking.connect(user1).emergencyWithdraw();
      await expect(cat).to.not.be.reverted;

      balance = await TST.balanceOf(user1.address);
      expect(balance).to.eq(standardBalance);

      // test positions
      let p = await Staking.position(user1.address);
      expect(p[2]).to.eq(false);     // closed for business
    });

    it('closes pool and checks the validations', async () => {
      let blockNum = await ethers.provider.getBlock();
      const then = blockNum.timestamp;

      const Staking = await StakingContract.deploy("Staking", "STS", 0, then + 600, then + 5000, TGateway.address, TST_ADDRESS, SEUR_ADDRESS, simpleInterestRate);

      await Staking.activate();

      let value = etherBalances.ONE_MILLION;
      await SEuro.mint(Staking.address, value);

      // cannot withdraw cos we're not suspended
      let cat = Staking.connect(user1).emergencyWithdraw();
      await expect(cat).to.be.revertedWith('err-not-catastrophe');

      balance = await TST.balanceOf(user1.address);
      expect(balance).to.eq(0);

      await Staking.connect(owner).enableCatastrophe();
      let isCat = await Staking.isCatastrophe();
      expect(isCat).to.eq(true);

      // close
      cat = Staking.connect(user1).emergencyWithdraw();
      await expect(cat).to.be.revertedWith('err-no-position');
    });
  });

  describe('pausing', async () => {
    it('restricts minting and burning when paused', async () => {
      const blockNum = await ethers.provider.getBlock();
      const then = blockNum.timestamp;

      const Staking = await StakingContract.deploy("Staking", "STS", 0, then + 600, then + 5000, TGateway.address, TST_ADDRESS, SEUR_ADDRESS, simpleInterestRate);

      let pause = Staking.connect(user1).pause();
      await expect(pause).to.be.revertedWith('Ownable: caller is not the owner');
      expect(await Staking.paused()).to.equal(false);
      pause = Staking.connect(owner).pause();
      await expect(pause).not.to.be.reverted;
      expect(await Staking.paused()).to.equal(true);

      let mint = Staking.mint(etherBalances['8K']);
      await expect(mint).to.be.revertedWith('err-paused');
      let burn = Staking.burn();
      await expect(burn).to.be.revertedWith('err-paused');

      let unpause = Staking.connect(user1).unpause();
      await expect(unpause).to.be.revertedWith('Ownable: caller is not the owner');
      expect(await Staking.paused()).to.equal(true);
      unpause = Staking.connect(owner).unpause();
      await expect(unpause).not.to.be.reverted;
      expect(await Staking.paused()).to.equal(false);

      mint = Staking.mint(etherBalances['8K']);
      await expect(mint).not.to.be.revertedWith('err-paused');
      burn = Staking.burn();
      await expect(burn).not.to.be.revertedWith('err-paused');
    });
  });
});
