const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('IBCO', async () => {
    const WETH_BYTES = ethers.utils.formatBytes32String('WETH');
    const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
    const CL_ETH_USD = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';
    const CL_ETH_USD_DEC = 8;
    const CL_EUR_USD = '0xb49f677943BC038e9857d61E7d053CaA2C1734C1';
    const ROUTER_ADDRESS = '0xf164fC0Ec4E93095b804a4795bBe1e041497b92a';
    let IBCO, SEuro, BondingCurve, SEuroRateCalculator, TokenManager, WETH, owner, user;

    async function buyWETH(signer, amount) {
        await WETH.connect(signer).deposit({ value: amount });
    }

    async function buyToken(signer, token, amount) {
        const UniswapRouter = await ethers.getContractAt('IUniswapV2Router01', ROUTER_ADDRESS)
        const deadline = Math.floor(Date.now() / 1000) + 60;
        return await UniswapRouter.connect(signer).swapExactETHForTokens(1, [WETH_ADDRESS, token], signer.address, deadline, { value: amount });
    }

    async function getEthEuroRate() {
        const ETH_USD_CL = await ethers.getContractAt('Chainlink', CL_ETH_USD);
        const EUR_USD_CL = await ethers.getContractAt('Chainlink', CL_EUR_USD);
        return (await ETH_USD_CL.latestRoundData()).answer /
            (await EUR_USD_CL.latestRoundData()).answer;
    }

    async function getDiscountRate() {
        return 10 ** (await SEuroRateCalculator.MULTIPLIER())
    }

    beforeEach(async () => {
        [owner, user] = await ethers.getSigners();

        const SEuroContract = await ethers.getContractFactory('SEuro');
        const IBCOContract = await ethers.getContractFactory('IBCO');
        const BondingCurveContract = await ethers.getContractFactory('BondingCurve');
        const SEuroRateCalculatorContract = await ethers.getContractFactory('SEuroRateCalculator');
        const TokenManagerContract = await ethers.getContractFactory('TokenManager');

        WETH = await ethers.getContractAt('WETH', WETH_ADDRESS);
        SEuro = await SEuroContract.deploy('SEuro', 'SEUR', [owner.address]);
        BondingCurve = await BondingCurveContract.deploy(SEuro.address);
        SEuroRateCalculator = await SEuroRateCalculatorContract.deploy(BondingCurve.address);
        TokenManager = await TokenManagerContract.deploy();
        IBCO = await IBCOContract.deploy(SEuro.address, SEuroRateCalculator.address, TokenManager.address);

        await SEuro.connect(owner).grantRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MINTER_ROLE')), IBCO.address)
    });

    describe('swap', async () => {

        it('swaps for given token', async () => {
            const ether = 1;
            const toSwap = await ethers.utils.parseEther(ether.toString());
            await buyWETH(user, toSwap);
            await WETH.connect(user).approve(IBCO.address, toSwap);

            const swap = IBCO.connect(user).swap(WETH_BYTES, toSwap);

            const expectedEuros = Math.floor(ether * (await SEuroRateCalculator.calculate(CL_ETH_USD, CL_ETH_USD_DEC)) / (await getDiscountRate()));
            await expect(swap).to.emit(IBCO, 'Swap').withArgs(WETH_BYTES, toSwap, expectedEuros);
            const userSEuroBalance = await SEuro.balanceOf(user.address);
            expect(userSEuroBalance.toString()).to.equal(expectedEuros.toString());
        });

        it('will not swap without preapproval', async () => {
            const toSwap = await ethers.utils.parseEther('1');
            await buyWETH(user, toSwap);

            const swap = IBCO.connect(user).swap(WETH_BYTES, toSwap);

            await expect(swap).to.be.revertedWith('err-tok-allow')
            const userSEuroBalance = await SEuro.balanceOf(user.address);
            expect(userSEuroBalance.toString()).to.equal('0');
        });

        it('will not swap without balance of token', async () => {
            const toSwap = await ethers.utils.parseEther('1');
            await WETH.connect(user).withdraw(await WETH.balanceOf(user.address));
            await WETH.connect(user).approve(IBCO.address, toSwap);

            const swap = IBCO.connect(user).swap(WETH_BYTES, toSwap);

            await expect(swap).to.be.revertedWith('err-tok-bal')
            const userSEuroBalance = await SEuro.balanceOf(user.address);
            expect(userSEuroBalance.toString()).to.equal('0');
        });

        // it('will swap for any accepted token', async () => {
        //     const ether = 1;
        //     const toSwap = ethers.utils.parseEther(ether.toString());
        //     const daiBytes = ethers.utils.formatBytes32String('DAI');
        //     await IBCO.connect(owner).addAcceptedToken(daiBytes, DAI_ADDRESS, DAI_USD_CL, DAI_CL_DEC);

        //     await buyToken(user, DAI_ADDRESS, toSwap);
        //     const Dai = await ethers.getContractAt('IERC20', DAI_ADDRESS);
        //     const userTokens = await Dai.balanceOf(user.address);
        //     await Dai.connect(user).approve(IBCO.address, userTokens);
            
        //     const expectedEuros = Math.floor(ether * (await getEthEuroRate()) / (await getDiscountRate()));
        //     const swap = IBCO.connect(user).swap(daiBytes, userTokens);
        //     await expect(swap).to.emit(IBCO, 'Swap').withArgs(daiBytes, userTokens, expectedEuros);
        //     const userSEuroBalance = await SEuro.balanceOf(user.address);
        //     expect(userSEuroBalance.toString()).to.equal(expectedEuros.toString());
        // });
    });

    describe('swapETH', async () => {
        it('swaps for eth', async () => {
            const ether = 1;
            const toSwap = await ethers.utils.parseEther(ether.toString());
            const ethBytes = ethers.utils.formatBytes32String('ETH');

            const swap = IBCO.connect(user).swapETH({ value: toSwap });

            const expectedEuros = Math.floor(ether * (await SEuroRateCalculator.calculate(CL_ETH_USD, CL_ETH_USD_DEC)) / (await getDiscountRate()));
            await expect(swap).to.emit(IBCO, 'Swap').withArgs(ethBytes, toSwap, expectedEuros);
            const userSEuroBalance = await SEuro.balanceOf(user.address);
            expect(userSEuroBalance.toString()).to.equal(expectedEuros.toString());
        })
    });
});