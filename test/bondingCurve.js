const { ethers } = require('hardhat');
const { BigNumber } = ethers;
const { expect } = require('chai');

describe('BondingCurve', async () => {
    let BondingCurve;

    beforeEach(async () => {
        const BondingCurveContract = await ethers.getContractFactory('BondingCurve');
        const SEuroContract = await ethers.getContractFactory('SEuro');
        const SEuro = await SEuroContract.deploy('SEuro', 'SEUR', []);
        BondingCurve = await BondingCurveContract.deploy(SEuro.address);
    });

    describe('discount rate', async () => {
        async function expectedDiscount() {
            // shouldn't be constant obvs
            return BigNumber.from(80).mul(await BondingCurve.FIXED_POINT()).div(100);
        }

        it('gets the current discount rate', async () => {
            const discountRate = await BondingCurve.getDiscount();

            expect(discountRate).to.equal(await expectedDiscount());
        });
    });
});