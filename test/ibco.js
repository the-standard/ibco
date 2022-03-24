const { ethers } = require('hardhat');
const { expect } = require('chai')

describe('IBCO', async () => {
    const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
    let IBCO, WETH, SEuro, owner, user;

    beforeEach(async () => {
        [owner, user] = await ethers.getSigners();
        const IBCOContract = await ethers.getContractFactory('IBCO');
        IBCO = await IBCOContract.deploy();
        const SEuroContract = await ethers.getContractFactory('SEuro');
        SEuro = await SEuroContract.deploy('SEuro', 'SEUR', [owner.address]);
        WETH = await ethers.getContractAt('IERC20', WETH_ADDRESS);
    });

    describe('swap', async () => {
        it('swaps for given token', async () => {
            const toSwap = await ethers.utils.parseEther('1');
            const wethBytes = await ethers.utils.formatBytes32String('WETH');
            await IBCO.swap(wethBytes, toSwap);

            const userSEuroBalance = await SEuro.balanceOf(user.address);
            expect(userSEuroBalance.toString()).to.equal('2800');
        });
    });
});