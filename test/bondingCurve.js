const { ethers } = require('hardhat');
const { expect } = require('chai');
const { DECIMALS, etherBalances } = require('./common');

describe('BondingCurve', async () => {
  let BondingCurve, SEuro, TestBondingCurve;
  const BUCKET_SIZE = ethers.utils.parseEther('100000');
  const MAX_SUPPLY = ethers.utils.parseEther('200000000');
  const INITIAL_PRICE = ethers.utils.parseEther('0.8');

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

      const actualSEuros = await BondingCurve.callStatic.calculatePrice(euros);

      const expectedSeuros = euros.mul(DECIMALS).div(await getBucketPrice(0));
      expect(actualSEuros).to.equal(expectedSeuros);
    });

    it('should price some tokens from next bucket if transaction will cross bucket limit', async () => {
      // will force crossover to next bucket due to discount
      const eurosSpent = BUCKET_SIZE;

      const actualSEurosReceived = await BondingCurve.callStatic.calculatePrice(eurosSpent);

      // purchase buys whole capacity of first bucket
      const sEurosFromFirstBucket = (await getBucketPrice(0)).mul(BUCKET_SIZE).div(DECIMALS);
      const remainingEuros = eurosSpent.sub(sEurosFromFirstBucket);
      // how many seuros the remaining euros buy from second bucket
      const secondBucketSEuros = remainingEuros.mul(DECIMALS).div(await getBucketPrice(1));
      // total seuros bought should be one whole bucket + the amount bought from second bucket
      const expectedSEuros = BUCKET_SIZE.add(secondBucketSEuros);
      expect(actualSEurosReceived).to.equal(expectedSEuros);
    });

    it('will cross two price buckets when calculating', async () => {
      // will force filling of two buckets, due to curve discount
      const eurosSpent = BUCKET_SIZE.mul(2);

      const actualSEurosReceived = await BondingCurve.callStatic.calculatePrice(eurosSpent);

      // purchase buys whole capacity of first two buckets
      const firstBucketCapacityInEuros = (await getBucketPrice(0)).mul(BUCKET_SIZE).div(DECIMALS);
      const secondBucketCapacityInEuros = (await getBucketPrice(1)).mul(BUCKET_SIZE).div(DECIMALS);
      const remainingEuros = eurosSpent.sub(firstBucketCapacityInEuros).sub(secondBucketCapacityInEuros);
      // how many seuros the remaining euros buy from third bucket
      const thirdBuckeSEuros = remainingEuros.mul(DECIMALS).div(await getBucketPrice(2));
      // total seuros bought should be two whole buckets + the amount bought from third bucket
      const expectedSEuros = BUCKET_SIZE.mul(2).add(thirdBuckeSEuros);
      expect(actualSEurosReceived).to.equal(expectedSEuros);
    });

    it('will not exceed full price when max supply is met', async () => {
      await SEuro.mint(owner.address, MAX_SUPPLY);
      await BondingCurve.updateCurrentBucket(MAX_SUPPLY);
      const euros = ethers.utils.parseEther('1');

      const seuros = await BondingCurve.callStatic.calculatePrice(euros);

      expect(seuros).to.equal(euros);
    });
  });

  describe('updateCurrentBucket', async () => {
    it('saves new bucket price when supply has changed', async () => {
      await SEuro.mint(owner.address, BUCKET_SIZE);
      await BondingCurve.updateCurrentBucket(BUCKET_SIZE);

      const newBucketPrice = (await BondingCurve.currentBucket()).price;

      expect(newBucketPrice).to.equal(await getBucketPrice(1));
    });
  });

  describe.only('read-only euros to seuro', async () => {
    it('converts euro to seuro based on the initial price (read-only)', async () => {
      const { price } = await BondingCurve.currentBucket();
      const euros = etherBalances.TWO_MILLION;
      const expectedSEuro = euros.mul(DECIMALS).div(price);
      expect(await BondingCurve.calculatePriceReadOnly(euros)).to.eq(expectedSEuro);
    });

    it('converts euro to seuro based on later bucket price (read-only)', async () => {
      await BondingCurve.updateCurrentBucket(etherBalances.HUNDRED_MILLION);
      const { price } = await BondingCurve.currentBucket();
      const euros = etherBalances.TWO_MILLION;
      const expectedSEuro = euros.mul(DECIMALS).div(price);
      expect(await BondingCurve.calculatePriceReadOnly(euros)).to.eq(expectedSEuro);
    });
  });
});
