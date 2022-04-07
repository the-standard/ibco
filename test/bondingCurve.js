const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('BondingCurve', async () => {
    describe('discount rate', async () => {
        async function expectedDiscount() {
            // shouldn't be constant obvs
            return ethers.BigNumber.from(0.8 * (await BondingCurve.FIXED_POINT));
        }

        it('gets the current discount rate', async () => {
            BondingCurveContract = await ethers.getContractFactory('BondingCurve');
            SEuroContract = await ethers.getContractFactory('SEuro');
            const SEuro = await SEuroContract.deploy('SEuro', 'SEUR', []);
            BondingCurve = await BondingCurveContract.deploy(SEuro.address);

            const discountRate = await BondingCurve.getDiscount();

            expect(discountRate).to.equal(await expectedDiscount());
        });
    });
});