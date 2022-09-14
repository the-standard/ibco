const { ethers } = require('hardhat');
const { expect } = require('chai');
const { etherBalances } = require('./common');

let DrainableTest, ERC20, owner, wallet1, wallet2;

beforeEach(async () => {
  [ owner, user, wallet1, wallet2 ] = await ethers.getSigners();
  DrainableTest = await (await ethers.getContractFactory('DrainableTest')).deploy();
  ERC20 = await (await ethers.getContractFactory('MintableERC20')).deploy('USDC', 'USD Coin', 6);
});

describe('Drainable contracts', async () => {
  it('allows owner and admins to drain contract of any ERC20 token', async () => {
    // put some ERC20s into the contract
    await ERC20.mint(DrainableTest.address, etherBalances.ONE_MILLION);

    expect(await ERC20.balanceOf(wallet1.address)).to.eq(0);

    await DrainableTest.drain(ERC20.address, wallet1.address, etherBalances.ONE_MILLION);
    expect(await ERC20.balanceOf(wallet1.address)).to.eq(etherBalances.ONE_MILLION);

    // put some more tokens in
    await ERC20.mint(DrainableTest.address, etherBalances.ONE_MILLION);
    const invalid = DrainableTest.connect(user).drain(ERC20.address, wallet2.address, etherBalances.ONE_MILLION);
    await expect(invalid).to.be.revertedWith('err-invalid-drainer');
    expect(await ERC20.balanceOf(wallet2.address)).to.eq(0);

    await DrainableTest.grantRole(await DrainableTest.DRAINER(), user.address);
    const valid = DrainableTest.connect(user).drain(ERC20.address, wallet2.address, etherBalances.ONE_MILLION);
    await expect(valid).not.to.be.reverted;
    expect(await ERC20.balanceOf(wallet2.address)).to.eq(etherBalances.ONE_MILLION);

    expect(await ERC20.balanceOf(DrainableTest.address)).to.eq(0)
  });

  it('allows owner and admins to drain contract of ETH', async () => {
    // put some eth into the contract
    const amount = ethers.utils.parseEther('1');
    await owner.sendTransaction({to: DrainableTest.address, value: amount})

    let walletBalance = await wallet1.getBalance();

    await DrainableTest.drainETH(wallet1.address, amount);
    expect(await wallet1.getBalance()).to.eq(walletBalance.add(amount));

    // put some more eth in
    await owner.sendTransaction({to: DrainableTest.address, value: amount})
    const invalid = DrainableTest.connect(user).drainETH(wallet2.address, amount);
    await expect(invalid).to.be.revertedWith('err-invalid-drainer');

    walletBalance = await wallet2.getBalance();

    await DrainableTest.grantRole(await DrainableTest.DRAINER(), user.address);
    const valid = DrainableTest.connect(user).drainETH(wallet2.address, amount);
    await expect(valid).not.to.be.reverted;
    expect(await wallet2.getBalance()).to.eq(walletBalance.add(amount));

    expect(await ethers.getDefaultProvider().getBalance(DrainableTest.address)).to.eq(0);
  });
});