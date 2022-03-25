const { ethers, network } = require('hardhat');
const { expect } = require('chai');

describe('IBCO', async () => {
    const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
    let IBCO, SEuro, WETH, owner, user, benefactor;

    async function buyWETH(signer, amount) {
        await WETH.connect(signer).deposit({value: amount});
    }

    beforeEach(async () => {
        [owner, user, benefactor] = await ethers.getSigners();
        const SEuroContract = await ethers.getContractFactory('SEuro');
        const IBCOContract = await ethers.getContractFactory('IBCO');
        WETH = await ethers.getContractAt('WETH', WETH_ADDRESS);
        SEuro = await SEuroContract.deploy('SEuro', 'SEUR', [owner.address]);
        IBCO = await IBCOContract.deploy(SEuro.address);
        await SEuro.connect(owner).grantRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MINTER_ROLE')), IBCO.address)
    });

    describe('swap', async () => {
        
        it('swaps for given token', async () => {
            const toSwap = await ethers.utils.parseEther('1');
            const wethBytes = await ethers.utils.formatBytes32String('WETH');
            await buyWETH(user, toSwap);
            await WETH.connect(user).approve(IBCO.address, toSwap);

            const swap = await IBCO.connect(user).swap(wethBytes, toSwap);

            expect(swap).to.emit(IBCO, "Swap").withArgs(wethBytes, toSwap, '2800');
            const userSEuroBalance = await SEuro.balanceOf(user.address);
            expect(userSEuroBalance.toString()).to.equal('2800');
        });

        it('will not swap without preapproval', async () => {
            const toSwap = await ethers.utils.parseEther('1');
            const wethBytes = await ethers.utils.formatBytes32String('WETH');
            await buyWETH(user, toSwap);

            const swap = IBCO.connect(user).swap(wethBytes, toSwap);

            await expect(swap).to.be.revertedWith("transfer allowance not approved")
            const userSEuroBalance = await SEuro.balanceOf(user.address);
            expect(userSEuroBalance.toString()).to.equal('0');
        });
    });

    describe('swapETH', async() => {
        it('swaps for eth', async () => {
            const toSwap = await ethers.utils.parseEther('1');
            
            await IBCO.connect(user).swapETH({value: toSwap});

            const userSEuroBalance = await SEuro.balanceOf(user.address);
            expect(userSEuroBalance.toString()).to.equal('2800');
        })
    });
});