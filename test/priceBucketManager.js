const { ethers } = require('hardhat');
const { expect } = require('chai');
const { generatePriceBuckets } = require('./utils');

describe('PriceBucketManager', async () => {

    describe('getPriceBuckets', async () => {
        it('initialises with price buckets and returns all', async () => {
            const PriceBucketManagerContract = await ethers.getContractFactory('PriceBucketManager');
            const bucketSize = 200_000;
            const buckets = generatePriceBuckets(bucketSize, 1000);
            const PriceBucketManager = await PriceBucketManagerContract.deploy(bucketSize, buckets);

            const priceBuckets = await PriceBucketManager.getPriceBuckets();

            expect(priceBuckets).deep.to.equal(buckets);
        });
    });
});
