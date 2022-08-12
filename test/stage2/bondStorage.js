const { expect } = require('chai');
const { ethers } = require('hardhat');
const { CHAINLINK_DEC, getLibraryFactory } = require('../common.js');

describe('BondStorage', async () => {
  let contractFactory;
  beforeEach(async () => {
    contractFactory = await getLibraryFactory(owner, 'BondStorage');
  });

  describe('dependencies', async () => {
    it('allows owner to update token gateway dependency', async () => {
      const [owner, customer, gateway1, gateway2, chainlinkFeed] = await ethers.getSigners();
      let BondStorage = await contractFactory.deploy(gateway1.address, chainlinkFeed.address, CHAINLINK_DEC);

      let update = BondStorage.connect(customer).setTokenGateway(gateway2.address);
      await expect(update).to.be.revertedWith('invalid-storage-operator');
      expect(await BondStorage.tokenGateway()).to.equal(gateway1.address);

      update = BondStorage.connect(owner).setTokenGateway(gateway2.address);
      await expect(update).not.to.be.reverted;
      expect(await BondStorage.tokenGateway()).to.equal(gateway2.address);
    });
  });
});
