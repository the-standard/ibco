const { ethers } = require('hardhat');
const { expect } = require('chai');
const { DECIMALS_18, etherBalances, SEURO_ADDRESS } = require('../common.js');

describe('BondingCurve', async () => {
  let BondingCurve, SEuro, TestBondingCurve;
  const BUCKET_SIZE = ethers.utils.parseEther('100000');
  const MAX_SUPPLY = ethers.utils.parseEther('200000000');
  const INITIAL_PRICE = ethers.utils.parseEther('0.8');

  beforeEach(async () => {
    [owner, customer, updater, calculator] = await ethers.getSigners();

    const BondingCurveContract = await ethers.getContractFactory('BondingCurve');
    SEuro = await ethers.getContractAt('ISeuro', SEURO_ADDRESS);
    BondingCurve = await BondingCurveContract.deploy(INITIAL_PRICE, MAX_SUPPLY, BUCKET_SIZE);
    TestBondingCurve = await (await ethers.getContractFactory('TestBondingCurve')).deploy(INITIAL_PRICE, MAX_SUPPLY, BUCKET_SIZE);
  });

  const getBucketPrice = async (index) => {
    return TestBondingCurve.callStatic.getPriceOfBucket(index);
  }

  describe('calculatePrice', async () => {
    it('gets the current value of given euros in terms of seuros', async () => {
      const euros = ethers.utils.parseEther('1000');

      const actualSEuros = await BondingCurve.callStatic.calculatePrice(euros);

      const expectedSeuros = euros.mul(DECIMALS_18).div(await getBucketPrice(0));
      expect(actualSEuros).to.equal(expectedSeuros);
    });

    it('should price some tokens from next bucket if transaction will cross bucket limit', async () => {
      // will force crossover to next bucket due to discount
      const eurosSpent = BUCKET_SIZE;

      const actualSEurosReceived = await BondingCurve.callStatic.calculatePrice(eurosSpent);

      // purchase buys whole capacity of first bucket
      const sEurosFromFirstBucket = (await getBucketPrice(0)).mul(BUCKET_SIZE).div(DECIMALS_18);
      const remainingEuros = eurosSpent.sub(sEurosFromFirstBucket);
      // how many seuros the remaining euros buy from second bucket
      const secondBucketSEuros = remainingEuros.mul(DECIMALS_18).div(await getBucketPrice(1));
      // total seuros bought should be one whole bucket + the amount bought from second bucket
      const expectedSEuros = BUCKET_SIZE.add(secondBucketSEuros);
      expect(actualSEurosReceived).to.equal(expectedSEuros);
    });

    it('will cross two price buckets when calculating', async () => {
      // will force filling of two buckets, due to curve discount
      const eurosSpent = BUCKET_SIZE.mul(2);

      const actualSEurosReceived = await BondingCurve.callStatic.calculatePrice(eurosSpent);

      // purchase buys whole capacity of first two buckets
      const firstBucketCapacityInEuros = (await getBucketPrice(0)).mul(BUCKET_SIZE).div(DECIMALS_18);
      const secondBucketCapacityInEuros = (await getBucketPrice(1)).mul(BUCKET_SIZE).div(DECIMALS_18);
      const remainingEuros = eurosSpent.sub(firstBucketCapacityInEuros).sub(secondBucketCapacityInEuros);
      // how many seuros the remaining euros buy from third bucket
      const thirdBuckeSEuros = remainingEuros.mul(DECIMALS_18).div(await getBucketPrice(2));
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

    it('only allows calculator role to calculate price', async () => {
      const euros = ethers.utils.parseEther('1');
      await expect(BondingCurve.connect(calculator).calculatePrice(euros)).to.be.revertedWith('invalid-curve-calculator');

      await BondingCurve.grantRole(await BondingCurve.CALCULATOR(), calculator.address);
      await expect(BondingCurve.connect(calculator).calculatePrice(euros)).not.to.be.reverted;
    });
  });

  describe('updateCurrentBucket', async () => {
    it('saves new bucket price when supply has changed, if requested by SEuroOffering', async () => {
      // give updater access to update price bucket
      await BondingCurve.grantRole(await BondingCurve.UPDATER(), updater.address);

      const bucket0Price = await getBucketPrice(0);
      const bucket1Price = await getBucketPrice(1);

      await expect(BondingCurve.connect(customer).updateCurrentBucket(BUCKET_SIZE)).to.be.revertedWith('invalid-curve-updater');
      expect((await BondingCurve.currentBucket()).price).to.equal(bucket0Price);

      const update = BondingCurve.connect(updater).updateCurrentBucket(BUCKET_SIZE);
      await expect(update).to.emit(BondingCurve, 'PriceUpdated').withArgs(1, bucket1Price);
      expect((await BondingCurve.currentBucket()).price).to.equal(bucket1Price);
    });
  });

  describe('read-only euros to seuro', async () => {
    it('converts euro to seuro based on the initial price (read-only)', async () => {
      const { price } = await BondingCurve.currentBucket();
      const euros = etherBalances.TWO_MILLION;
      const expectedSEuro = euros.mul(DECIMALS_18).div(price);
      expect(await BondingCurve.readOnlyCalculatePrice(euros)).to.eq(expectedSEuro);
    });

    it('converts euro to seuro based on later bucket price (read-only)', async () => {
      await BondingCurve.updateCurrentBucket(etherBalances.HUNDRED_MILLION);
      const { price } = await BondingCurve.currentBucket();
      const euros = etherBalances.TWO_MILLION;
      const expectedSEuro = euros.mul(DECIMALS_18).div(price);
      expect(await BondingCurve.readOnlyCalculatePrice(euros)).to.eq(expectedSEuro);
    });
  });
});
