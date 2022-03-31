// const { ethers } = require('hardhat');
// const { expect } = require('chai');

// describe('SEuroRateCalculator', async () => {
//     beforeEach(async () => {
//         const SEuroContract = await ethers.getContractFactory('SEuro');
//         const SEuro = await SEuroContract.deploy('SEuro', 'SEUR', []);
//         const BondingCurveContract = await ethers.getContractFactory('BondingCurve');
//         const BondingCurve = await BondingCurveContract.deploy(SEuro.address);
//         const SEuroRateCalculatorContract = await ethers.getContractFactory('SEuroRateCalculator');
//         const SEuroRateCalculator = await SEuroRateCalculatorContract.deploy(BondingCurve.address);
//     });

//     async function getBaseEurRate(token) {
//         const tokUsdRate = (await (await ethers.getContractAt(CL_TOK_USD)).latestRoundData()).answer;
//         const eurUsdRate = (await (await ethers.getContractAt(CL_EUR_USD)).latestRoundData()).answer;
//     }

//     async function expectedRate(token) {
//         return (await getBaseEurRate(token)) * (await BondingCurve.getDiscount());
//     }

//     it('calculates the rate', async () => {
//         const rate = await SEuroRateCalculator.calculate(amount, token);

//         expect(rate).to.equal(await expectedRate(amount, token));
//     });
// });