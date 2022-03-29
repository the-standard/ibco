const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('IBCO', async () => {
    const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
    const CL_ETH_USD = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';
    const CL_EUR_USD = '0xb49f677943BC038e9857d61E7d053CaA2C1734C1';
    let IBCO, SEuro, BondingCurve, WETH, owner, user;

    async function buyWETH(signer, amount) {
        await WETH.connect(signer).deposit({value: amount});
    }

    async function getEthEuroRate() {
        const ETH_USD_CL = await ethers.getContractAt('Chainlink', CL_ETH_USD, owner);
        const EUR_USD_CL = await ethers.getContractAt('Chainlink', CL_EUR_USD, owner);
        return (await ETH_USD_CL.latestRoundData()).answer /
            (await EUR_USD_CL.latestRoundData()).answer;
    }
    
    async function getDiscountRate() {
        return await BondingCurve.getDiscount() / 100;
    }

    beforeEach(async () => {
        [owner, user] = await ethers.getSigners();

        const SEuroContract = await ethers.getContractFactory('SEuro');
        const IBCOContract = await ethers.getContractFactory('IBCO');
        const BondingCurveContract = await ethers.getContractFactory('BondingCurve');

        WETH = await ethers.getContractAt('WETH', WETH_ADDRESS);
        SEuro = await SEuroContract.deploy('SEuro', 'SEUR', [owner.address]);
        BondingCurve = await BondingCurveContract.deploy(SEuro.address);
        IBCO = await IBCOContract.deploy(SEuro.address, BondingCurve.address);

        await SEuro.connect(owner).grantRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MINTER_ROLE')), IBCO.address)
    });

    describe('swap', async () => {
        
        it('swaps for given token', async () => {
            const ether = 1;
            const toSwap = await ethers.utils.parseEther(ether.toString());
            const wethBytes = await ethers.utils.formatBytes32String('WETH');
            await buyWETH(user, toSwap);
            await WETH.connect(user).approve(IBCO.address, toSwap);

            const swap = IBCO.connect(user).swap(wethBytes, toSwap);

            const expectedEuros = Math.floor(ether * (await getEthEuroRate()) / (await getDiscountRate()));
            await expect(swap).to.emit(IBCO, 'Swap').withArgs(wethBytes, toSwap, expectedEuros);
            const userSEuroBalance = await SEuro.balanceOf(user.address);
            expect(userSEuroBalance.toString()).to.equal(expectedEuros.toString());
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

        it('will not swap without balance of token', async () => {
            const toSwap = await ethers.utils.parseEther('1');
            const wethBytes = await ethers.utils.formatBytes32String('WETH');
            await WETH.connect(user).withdraw(await WETH.balanceOf(user.address));
            await WETH.connect(user).approve(IBCO.address, toSwap);

            const swap = IBCO.connect(user).swap(wethBytes, toSwap);

            await expect(swap).to.be.revertedWith("token balance too low")
            const userSEuroBalance = await SEuro.balanceOf(user.address);
            expect(userSEuroBalance.toString()).to.equal('0');
        });
    });

    describe('swapETH', async() => {
        it('swaps for eth', async () => {
            const ether = 1;
            const toSwap = await ethers.utils.parseEther(ether.toString());
            const ethBytes = await ethers.utils.formatBytes32String('ETH');
            
            const swap = IBCO.connect(user).swapETH({value: toSwap});

            const expectedEuros = Math.floor(ether * (await getEthEuroRate()) / (await getDiscountRate()));
            await expect(swap).to.emit(IBCO, 'Swap').withArgs(ethBytes, toSwap, expectedEuros);
            const userSEuroBalance = await SEuro.balanceOf(user.address);
            expect(userSEuroBalance.toString()).to.equal(expectedEuros.toString());
        })
    });
});