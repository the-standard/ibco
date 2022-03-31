const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('SEuroRateCalculator', async () => {
    const CL_ETH_USD = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';
    const CL_ETH_USD_DEC = 8;
    const CL_DAI_USD = '0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9';
    const CL_DAI_USD_DEC = 8;
    const CL_EUR_USD = '0xb49f677943BC038e9857d61E7d053CaA2C1734C1';
    let SEuroRateCalculator, BondingCurve;

    beforeEach(async () => {
        const SEuroContract = await ethers.getContractFactory('SEuro');
        const SEuro = await SEuroContract.deploy('SEuro', 'SEUR', []);
        const BondingCurveContract = await ethers.getContractFactory('BondingCurve');
        BondingCurve = await BondingCurveContract.deploy(SEuro.address);
        const SEuroRateCalculatorContract = await ethers.getContractFactory('SEuroRateCalculator');
        SEuroRateCalculator = await SEuroRateCalculatorContract.deploy(BondingCurve.address);
    });

    async function getBaseEurRate(clTokUsd) {
        const tokUsdRate = (await (await ethers.getContractAt('Chainlink', clTokUsd)).latestRoundData()).answer;
        const eurUsdRate = (await (await ethers.getContractAt('Chainlink', CL_EUR_USD)).latestRoundData()).answer;
        return tokUsdRate / eurUsdRate;
    }

    async function expectedRate(clTokUsd) {
        return Math.floor((await getBaseEurRate(clTokUsd)) * 100 / (await BondingCurve.getDiscount()));
    }

    it('calculates the rate for weth', async () => {
        const rate = await SEuroRateCalculator.calculate(CL_ETH_USD, CL_ETH_USD_DEC);
        expect(rate).to.equal(await expectedRate(CL_ETH_USD));
    });

    it.only('calculates the rate for other tokens', async () => {
        const rate = await SEuroRateCalculator.calculate(CL_DAI_USD, CL_DAI_USD_DEC);
        console.log((await rate.wait()).events[0].args)
        expect(rate).to.equal(await expectedRate(CL_DAI_USD));
    });
});