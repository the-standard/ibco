const { ethers } = require('hardhat');
const { expect } = require('chai');
const bn = require('bignumber.js');

let owner, user, SEuro, TST;
const { etherBalances } = require('./common.js');

beforeEach(async () => {
  [owner, user] = await ethers.getSigners();
  const SEuroContract = await ethers.getContractFactory('SEuro');
  const ERC20Contract = await ethers.getContractFactory('DUMMY');
  SEuro = await SEuroContract.deploy('sEURO', 'SEUR', [owner.address]);
  TST = await ERC20Contract.deploy('TST', 'TST', ethers.utils.parseEther('10000000'));
  TST_ADDRESS = TST.address;
  SEUR_ADDRESS = SEuro.address;
  let StakingContract;
});

describe('Staking', async () => {
  it('opens the pool and sets all the variables', async () => {
    StakingContract = await ethers.getContractFactory('Staking');
    const Staking = await StakingContract.deploy("Staking", "STS");

    expect(await Staking.name()).to.eq("Staking");
    expect(await Staking.symbol()).to.eq("STS");
    expect(await Staking.active()).to.eq(false);
    expect(await Staking.startTime()).to.eq(0);
    expect(await Staking.endTime()).to.eq(0);
    expect(await Staking.duration()).to.eq(0);
  });

  it('activates the pool', async () => {
    StakingContract = await ethers.getContractFactory('Staking');
    const Staking = await StakingContract.deploy("Staking", "STS");

    let activate = Staking.connect(user).activate(1000,2000, TST_ADDRESS);
    await expect(activate).to.be.revertedWith('Ownable: caller is not the owner')

    // should have start < end
    activate = Staking.activate(2000,1000, TST_ADDRESS)
    await expect(activate).to.be.revertedWith('err-start-end');

    // should not work - end time
    activate = Staking.activate(1000,2000, TST_ADDRESS);
    await expect(activate).to.be.revertedWith('err-invalid-end');

    let blockNum = await ethers.provider.getBlock();
    const then = blockNum.timestamp + 600;

    activate = await Staking.activate(1000, then, TST_ADDRESS);

    expect(await Staking.active()).to.eq(true);
    expect(await Staking.startTime()).to.eq(1000);
    expect(await Staking.endTime()).to.eq(then);
    // expect(await Staking.duration()).to.eq(then - 1000);

    blockNum = await ethers.provider.getBlock();
    let bi = await Staking.initialised();
    const bt = ethers.BigNumber.from(bi);

    expect(bt).to.eq(blockNum.timestamp);

    // should revert since we're already active
    activate = Staking.activate(5000,100000, TST_ADDRESS);
    await expect(activate).to.be.revertedWith('err-already-active');
  });

  it('disables the pool', async () => {
    StakingContract = await ethers.getContractFactory('Staking');
    const Staking = await StakingContract.deploy("Staking", "STS");

    let activate = Staking.connect(user).disable();
    await expect(activate).to.be.revertedWith('Ownable: caller is not the owner')

    // pool isn't active
    activate = Staking.disable();
    await expect(activate).to.be.revertedWith('err-not-active')

    // activate the pool
    await Staking.activate(1000,200000000000000, TST_ADDRESS);

    let pa = await Staking.active();
    await expect(pa).to.eq(true);

    await Staking.disable();
    pa = await Staking.active();
    await expect(pa).to.eq(false);

    activate = Staking.activate(5000,200000000000, TST_ADDRESS);
    await expect(activate).to.be.revertedWith('err-already-initialised');
  });

  it('un-disables the pool', async () => {
  })

  // it('destroys the pool and all the tokens!!!', async () => {
  // });

  // it('cannot mint a token because the pool aint started', async () => {
  // });

  // it('cannot mint a token because the pool doesnt have enough liquidity', async () => {
  // });

  it('mints a token and creates a position', async () => {
    StakingContract = await ethers.getContractFactory('Staking');
    const Staking = await StakingContract.deploy("Staking", "STS");

    const weiValue = etherBalances["8K"];
    await expect(Staking.mint(weiValue)).to.be.revertedWith('err-not-active');

    let blockNum = await ethers.provider.getBlock();
    const then = blockNum.timestamp + 600;

    // activate the pool
    await Staking.activate(1000, 200000000000000, TST_ADDRESS);

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

    // do again to check increment etc
    await TST.connect(owner).mint(user.address, weiValue);
    await TST.connect(user).approve(Staking.address, weiValue);

    // mint ->
    await Staking.connect(user).mint(weiValue);

    expect(await Staking.balanceOf(user.address)).to.eq(2);
    expect(await Staking.ownerOf(1)).to.eq(user.address);

    // with not enough TST
    mint = Staking.connect(user).mint(10);
    await expect(mint).to.be.revertedWith('err-not-min');
  });

  it('tests the start, end, supply MINT validations', async () => {
    StakingContract = await ethers.getContractFactory('Staking');
    const Staking = await StakingContract.deploy("Staking", "STS");

    const weiValue = etherBalances["8K"];

    let blockNum = await ethers.provider.getBlock();
    const then = blockNum.timestamp + 600;

    // activate the pool
    await Staking.activate(then, then + 600, TST_ADDRESS);

    await TST.connect(owner).mint(user.address, weiValue);
    await TST.connect(user).approve(Staking.address, weiValue);
    let balance = await TST.balanceOf(user.address);
    expect(balance).to.eq(weiValue);

    // actually mint
    let mint = Staking.connect(user).mint(weiValue);
    await expect(mint).to.be.revertedWith('err-not-started');

    // move the time ahead
    await ethers.provider.send("evm_increaseTime", [3600])
    await ethers.provider.send("evm_mine") 
    
    mint = Staking.connect(user).mint(weiValue);
    await expect(mint).to.be.revertedWith('err-finished');

    // check the disabled
    await Staking.disable()
    mint = Staking.connect(user).mint(weiValue);
    await expect(mint).to.be.revertedWith('err-not-active');
  });

  // it('will not close and settle because the pool aint finished', async () => {
  // });

  // it('closes and settles the pool', async () => {
  // });

  // it('adds seuro to the pool', async () => {
  // });

  // it('removes seuro from the pool', async () => {
  //   // checks ownership too
  // });

  // it('removes tst from the pool', async () => {
  //   // checks ownership too
  // });

  // it('creates the position', async () => {
  // });

  // it('fetches the position for an address', async () => {
  // });

  // it('adds tst to an existing position', async () => {
  // });

});
