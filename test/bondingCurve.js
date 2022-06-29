const { ethers } = require('hardhat');
const { expect } = require('chai');
const { BigNumber } = require('ethers');

describe('BondingCurve', async () => {
  let BondingCurve, SEuro, TestBondingCurve;
  const BUCKET_SIZE = ethers.utils.parseEther('100000');
  const MAX_SUPPLY = ethers.utils.parseEther('200000000');
  const INITIAL_PRICE = ethers.utils.parseEther('0.8');
  const DECIMALS = BigNumber.from(10).pow(18);

  beforeEach(async () => {
    [owner] = await ethers.getSigners();

    const BondingCurveContract = await ethers.getContractFactory('BondingCurve');
    const SEuroContract = await ethers.getContractFactory('SEuro');
    SEuro = await SEuroContract.deploy('SEuro', 'SEUR', [owner.address]);
    BondingCurve = await BondingCurveContract.deploy(SEuro.address, INITIAL_PRICE, MAX_SUPPLY, BUCKET_SIZE);
    TestBondingCurve = await (await ethers.getContractFactory('TestBondingCurve')).deploy(SEuro.address, INITIAL_PRICE, MAX_SUPPLY, BUCKET_SIZE);
  });

  const getBucketPrice = async (index) => {
    return TestBondingCurve.callStatic.getPriceOfBucket(index);
  }

  describe('calculatePrice', async () => {
    it('gets the current value of given euros in terms of seuros', async () => {
      const euros = ethers.utils.parseEther('1000');

      const seuros = await BondingCurve.callStatic.calculatePrice(euros);

      const expectedSeuros = euros.mul(DECIMALS).div(await getBucketPrice(0));
      expect(seuros).to.equal(expectedSeuros);
    });

    it('should price some tokens from next bucket if transaction will cross bucket limit', async () => {
      // will force crossover to next bucket due to discount
      const euros = BUCKET_SIZE;
      
      const seuros = await BondingCurve.callStatic.calculatePrice(euros);

      const firstBucketCapacityInEuros = (await getBucketPrice(0)).mul(BUCKET_SIZE).div(DECIMALS);
      const remainingEuros = euros.sub(firstBucketCapacityInEuros);
      const secondBucketSEuros = remainingEuros.mul(DECIMALS).div(await getBucketPrice(1));
      const expectedSEuros = BUCKET_SIZE.add(secondBucketSEuros);
      expect(seuros).to.equal(expectedSEuros);
    });

    it('will cross two price buckets when calculating', async () => {
      const euros = BUCKET_SIZE.mul(2);
      
      const seuros = await BondingCurve.callStatic.calculatePrice(euros);

      const firstBucketCapacityInEuros = (await getBucketPrice(0)).mul(BUCKET_SIZE).div(DECIMALS);
      const secondBucketCapacityInEuros = (await getBucketPrice(1)).mul(BUCKET_SIZE).div(DECIMALS);
      const remainingEuros = euros.sub(firstBucketCapacityInEuros).sub(secondBucketCapacityInEuros);
      const thirdBuckeSEuros = remainingEuros.mul(DECIMALS).div(await getBucketPrice(2));
      const expectedSEuros = BUCKET_SIZE.mul(2).add(thirdBuckeSEuros);
      expect(seuros).to.equal(expectedSEuros);
    });

    it('will not exceed full price when max supply is met', async () => {
      await SEuro.mint(owner.address, MAX_SUPPLY);
      await BondingCurve.updateCurrentBucket();
      const euros = ethers.utils.parseEther('1');

      const seuros = await BondingCurve.callStatic.calculatePrice(euros);

      expect(seuros).to.equal(euros);
    });
  });

  describe('updateCurrentBucket', async () => {
    it('saves new bucket price when supply has changed', async () => {
      await SEuro.mint(owner.address, BUCKET_SIZE);
      await BondingCurve.updateCurrentBucket();

      const newBucketPrice = (await BondingCurve.currentBucket()).price;

      expect(newBucketPrice).to.equal(await getBucketPrice(1));
    });
  });
});
