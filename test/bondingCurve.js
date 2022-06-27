const { ethers } = require('hardhat');
const { expect } = require('chai');
const { BigNumber } = require('ethers');

describe('BondingCurve', async () => {
  let BondingCurve, SEuro, BondingCurveBucketPrices;
  const BUCKET_SIZE = ethers.utils.parseEther('100000');
  const MAX_SUPPLY = ethers.utils.parseEther('200000000');
  const INITIAL_PRICE = ethers.utils.parseEther('0.8');

  beforeEach(async () => {
    [owner] = await ethers.getSigners();

    const BondingCurveContract = await ethers.getContractFactory('BondingCurve');
    const SEuroContract = await ethers.getContractFactory('SEuro');
    SEuro = await SEuroContract.deploy('SEuro', 'SEUR', [owner.address]);
    BondingCurve = await BondingCurveContract.deploy(SEuro.address, INITIAL_PRICE, MAX_SUPPLY, BUCKET_SIZE);
    BondingCurveBucketPrices = await (await ethers.getContractFactory('BondingCurveBucketPrices')).deploy(SEuro.address, INITIAL_PRICE, MAX_SUPPLY, BUCKET_SIZE);
  });

  const getBucketPrice = async (index) => {
    return BondingCurveBucketPrices.callStatic.getPriceOfBucket(index);
  }

  const calculateSEuros = async (euros) => {
    let seuros = BigNumber.from(0);
    let remainingEuros = euros;
    let bucket = 0;
    while (remainingEuros > 0) {
      const bucketPrice = await getBucketPrice(bucket);
      const euroBucketCapacity = BUCKET_SIZE.mul(bucketPrice).div(ethers.utils.parseEther('1'));
      if (remainingEuros.gt(euroBucketCapacity)) {
        seuros = seuros.add(BUCKET_SIZE);
        remainingEuros = remainingEuros.sub(euroBucketCapacity);
        bucket++;
      } else {
        seuros = seuros.add(remainingEuros.mul(ethers.utils.parseEther('1')).div(bucketPrice));
        remainingEuros = 0;
      }
    }
    return seuros;
  }

  describe('updateBucketAndCalculatePrice', async () => {
    it('gets the current value of given euros in terms of seuros', async () => {
      const euros = ethers.utils.parseEther('1000');

      const seuros = await BondingCurve.callStatic.updateBucketAndCalculatePrice(euros);

      const expectedSeuros = await calculateSEuros(euros);
      expect(seuros).to.equal(expectedSeuros);
    });

    it('should price some tokens from next bucket if transaction will cross bucket limit', async () => {
      // will force crossover to next bucket due to discount
      const euros = BUCKET_SIZE;
      
      const seuros = await BondingCurve.callStatic.updateBucketAndCalculatePrice(euros);

      const expectedSEuros = await calculateSEuros(euros);
      expect(seuros).to.equal(expectedSEuros);
    });

    it('will cross two price buckets when calculating', async () => {
      const euros = BUCKET_SIZE.mul(2);
      
      const seuros = await BondingCurve.callStatic.updateBucketAndCalculatePrice(euros);

      const expectedSEuros = await calculateSEuros(euros);
      expect(seuros).to.equal(expectedSEuros);
    });

    it('saves new bucket price when supply has changed', async () => {
      const euros = ethers.utils.parseEther('1');
      await SEuro.mint(owner.address, BUCKET_SIZE);
      // activates updating of current price
      await BondingCurve.updateBucketAndCalculatePrice(euros);

      const newBucketPrice = (await BondingCurve.currentBucket()).price;

      expect(newBucketPrice).to.equal(await getBucketPrice(1));
    });

    it('will not exceed full price', async () => {
      await SEuro.mint(owner.address, MAX_SUPPLY);
      const euros = ethers.utils.parseEther('1');

      const seuros = await BondingCurve.callStatic.updateBucketAndCalculatePrice(euros);

      expect(seuros).to.equal(euros);
    });
  });
});
