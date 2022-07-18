const { ethers } = require('hardhat');
const { expect } = require('chai');
const bn = require('bignumber.js');

let owner, user, SEuro, TST;

let durations = {
  "ONE_YR_WEEKS": 52,
  "HALF_YR_WEEKS": 26,
  "ONE_WEEK": 1,
  "TWO_WEEKS": 2,
  "FOUR_WEEKS": 4,
  "EIGHT_WEEKS": 8
};

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

    let activate = Staking.connect(user).activate(1000,2000);
    await expect(activate).to.be.revertedWith('Ownable: caller is not the owner')

    // should have start < end
    activate = Staking.activate(2000,1000)
    await expect(activate).to.be.revertedWith('err-start-end');

    // should work
    await Staking.activate(1000,2000);
    const blockNum = await ethers.provider.getBlock();

    expect(await Staking.active()).to.eq(true);
    expect(await Staking.startTime()).to.eq(1000);
    expect(await Staking.endTime()).to.eq(2000);
    expect(await Staking.duration()).to.eq(1000);

    let bi = await Staking.initialised();
    const bt = ethers.BigNumber.from(bi);

    expect(bt).to.eq(blockNum.timestamp);

    // should revert since we're already active
    activate = Staking.activate(5000,100000);
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
    await Staking.activate(1000,2000);

    let pa = await Staking.active();
    await expect(pa).to.eq(true);

    await Staking.disable();
    pa = await Staking.active();
    await expect(pa).to.eq(false);
    
    activate = Staking.activate(5000,100000);
    await expect(activate).to.be.revertedWith('err-already-initialised');
  });

  // it('destroys the pool and all the tokens!!!', async () => {
  // });

  // it('cannot mint a token because the pool aint started', async () => {
  // });

  // it('cannot mint a token because the pool doesnt have enough liquidity', async () => {
  // });

  // it('mints a token and creates a position', async () => {
  // });

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
