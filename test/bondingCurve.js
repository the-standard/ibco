const { ethers } = require('hardhat');
const { BigNumber, utils } = ethers;
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
            const discountRate = await BondingCurve.blah();
            console.log(discountRate)

            expect(discountRate).to.equal(initialPrice);
        });

        it.only('gets more expensive as supply increases', async () => {
            // const initialPrice = await BondingCurve.blah();
            await SEuro.connect(owner).mint(owner.address, 10_000_000)
            const latestPrice = await BondingCurve.blah();
            console.log(latestPrice)

            expect(latestPrice).to.be.gt(0);
        });
    });
});