const { ethers } = require('hardhat');
const { utils } = ethers;
const { expect } = require('chai');

describe('BondingCurve', async () => {
  let BondingCurve, SEuro;
  const BUCKET_SIZE = ethers.utils.parseEther('100000');
  const MAX_SUPPLY = ethers.utils.parseEther('200000000');

  beforeEach(async () => {
    [owner] = await ethers.getSigners();

    const BondingCurveContract = await ethers.getContractFactory('BondingCurve');
    const SEuroContract = await ethers.getContractFactory('SEuro');
    SEuro = await SEuroContract.deploy('SEuro', 'SEUR', [owner.address]);
    const INITIAL_PRICE = ethers.utils.parseEther('0.8');
    BondingCurve = await BondingCurveContract.deploy(SEuro.address, INITIAL_PRICE, MAX_SUPPLY, BUCKET_SIZE);
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

  describe.only('seuroValue', async () => {
    it('gets the current value of given euros in terms of seuros', async () => {
      const euros = ethers.utils.parseEther('1000');

      const seuros = await BondingCurve.callStatic.seuroValue(euros);

      const expectedSeuros = euros.mul(ethers.utils.parseEther('1')).div(await BondingCurve.currentBucketPrice())
      expect(seuros).to.equal(expectedSeuros);
    });

    it('should price some tokens from next bucket if transaction will cross bucket limit', async () => {
      // will force crossover to next bucket due to discount
      const euros = BUCKET_SIZE;
      
      const firstBucketPrice = await BondingCurve.currentBucketPrice();
      const seuros = await BondingCurve.callStatic.seuroValue(euros);

      const maximumSeuros = euros.mul(ethers.utils.parseEther('1')).div(firstBucketPrice);
      // should be less than maximum seuros as that calculation assumes all seuro will be priced in first bucket
      expect(seuros).to.be.lt(maximumSeuros);
    });

    it('saves new bucket price when supply has changed', async () => {
      const euros = ethers.utils.parseEther('1');
      const initialBucketPrice = await BondingCurve.currentBucketPrice();
      await SEuro.mint(owner.address, BUCKET_SIZE);
      // activates updating of current price
      await BondingCurve.seuroValue(euros);
      const newBucketPrice = await BondingCurve.currentBucketPrice();

      expect(newBucketPrice).to.be.gt(initialBucketPrice);
    });

    it('will not exceed full price', async () => {
      await SEuro.mint(owner.address, MAX_SUPPLY);
      const euros = ethers.utils.parseEther('1');

      const seuros = await BondingCurve.callStatic.seuroValue(euros);

      expect(seuros).to.equal(euros);
    });
  });
});
