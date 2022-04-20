const { ethers } = require('hardhat');
const { utils } = ethers;
const { expect } = require('chai');

describe('BondingCurve', async () => {
    let BondingCurve, SEuro;

    beforeEach(async () => {
        [owner] = await ethers.getSigners();

        const BondingCurveContract = await ethers.getContractFactory('BondingCurve');
        const SEuroContract = await ethers.getContractFactory('SEuro');
        SEuro = await SEuroContract.deploy('SEuro', 'SEUR', [owner.address]);
        BondingCurve = await BondingCurveContract.deploy(SEuro.address);
    });

    describe('discount rate', async () => {
        it('initialises with given initial price', async () => {
            const initialPrice = utils.parseEther('0.7');
            const discountRate = await BondingCurve.pricePerEuro();

            expect(discountRate).to.equal(initialPrice);
        });

        it('gets more expensive as supply increases', async () => {
            const initialPrice = await BondingCurve.pricePerEuro();
            await SEuro.connect(owner).mint(owner.address, 10_000_000)
            const latestPrice = await BondingCurve.pricePerEuro();

            expect(latestPrice).to.be.gt(initialPrice);
        });
    });
});